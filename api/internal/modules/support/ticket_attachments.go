package support

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Combined attachment budget per ticket (images, docs, short videos).
const maxTicketAttachmentsTotalBytes = 25 * 1024 * 1024

type TicketAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerTicketAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/tickets/{id}/attachments", uploadTicketAttachment(pool))
	r.Get("/tickets/{id}/attachments", listTicketAttachments(pool))
	r.Get("/tickets/{id}/attachments/{attachmentId}/download", downloadTicketAttachment(pool))
}

func ticketUploadDir() string {
	if d := strings.TrimSpace(os.Getenv("SUPPORT_TICKET_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/support-ticket-attachments"
}

func allowedTicketMime(mime, name string) bool {
	m := strings.ToLower(strings.TrimSpace(mime))
	ext := strings.ToLower(filepath.Ext(name))
	switch {
	case strings.HasPrefix(m, "image/"):
		return true
	case strings.HasPrefix(m, "video/"):
		return true
	case strings.HasPrefix(m, "audio/"):
		return true
	case m == "application/pdf", m == "application/msword",
		m == "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		m == "application/vnd.ms-excel",
		m == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		m == "application/vnd.ms-powerpoint",
		m == "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		m == "application/zip", m == "application/x-zip-compressed",
		m == "application/octet-stream",
		m == "text/plain", m == "text/csv", m == "text/markdown":
		return true
	case ext == ".pdf", ext == ".doc", ext == ".docx", ext == ".xls", ext == ".xlsx",
		ext == ".ppt", ext == ".pptx", ext == ".txt", ext == ".csv", ext == ".md",
		ext == ".png", ext == ".jpg", ext == ".jpeg", ext == ".gif", ext == ".webp",
		ext == ".heic", ext == ".bmp",
		ext == ".mp4", ext == ".webm", ext == ".mov", ext == ".m4a", ext == ".mp3",
		ext == ".zip", ext == ".rar", ext == ".7z":
		return true
	default:
		// Unknown MIME with a normal file extension — still allow (browsers often send octet-stream).
		return ext != "" && len(ext) <= 8
	}
}

func uploadTicketAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.sup_support_tickets where id = $1 and tenant_id = $2)`,
			ticketID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		if !ticketAccessOK(r.Context(), pool, tu, tu.TenantID, ticketID) {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}

		var used int64
		_ = pool.QueryRow(r.Context(),
			`select coalesce(sum(size_bytes), 0) from public.sup_support_ticket_attachments where ticket_id = $1`,
			ticketID).Scan(&used)

		if err := r.ParseMultipartForm(maxTicketAttachmentsTotalBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB combined)."})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()

		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		if !allowedTicketMime(mimeType, safeName) {
			response.Validation(w, map[string]string{"file": "Only images, documents, and short videos are allowed."})
			return
		}

		remaining := maxTicketAttachmentsTotalBytes - used
		if remaining <= 0 {
			response.Validation(w, map[string]string{"file": "Ticket already has 25 MB of attachments."})
			return
		}
		if header.Size > remaining {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Combined attachments must stay under 25 MB (%d bytes remaining).", remaining)})
			return
		}

		// Read the file into memory and persist bytes in the database. Local
		// disk is ephemeral on containerized deploys (files vanished on every
		// redeploy while their DB rows survived), so the DB is the source of
		// truth. The 25 MB combined cap keeps rows small enough for bytea.
		data, err := io.ReadAll(io.LimitReader(file, remaining+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > remaining {
			response.Validation(w, map[string]string{"file": "Combined attachments must stay under 25 MB."})
			return
		}

		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(ticketID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.sup_support_ticket_attachments
			  (ticket_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
			values ($1,$2,$3,$4,$5,$6,$7)
			returning id, created_at`,
			ticketID, safeName, nullIfEmptyStr(mimeType), written, storagePath, tu.AppUserID, data).
			Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "support.ticket.attachment.upload", "sup_support_ticket_attachment", &id, nil, map[string]any{
			"ticket_id":  ticketID,
			"file_name":  safeName,
			"size_bytes": written,
		})

		response.OK(w, TicketAttachment{
			ID:               id,
			FileName:         safeName,
			MimeType:         mimeType,
			SizeBytes:        written,
			UploadedByUserID: &tu.AppUserID,
			CreatedAt:        createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listTicketAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if !ticketAccessOK(r.Context(), pool, tu, tu.TenantID, ticketID) {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.sup_support_ticket_attachments a
			join public.sup_support_tickets t on t.id = a.ticket_id
			where a.ticket_id = $1 and t.tenant_id = $2
			order by a.created_at desc`, ticketID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []TicketAttachment
		for rows.Next() {
			var row TicketAttachment
			var createdAt time.Time
			var mime string
			if err := rows.Scan(&row.ID, &row.FileName, &mime, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.MimeType = mime
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []TicketAttachment{}
		}
		response.OK(w, out, "")
	}
}

func downloadTicketAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ticketID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		attachmentID, err := strconv.ParseInt(chi.URLParam(r, "attachmentId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"attachmentId": "Invalid attachment id."})
			return
		}
		if !ticketAccessOK(r.Context(), pool, tu, tu.TenantID, ticketID) {
			response.Err(w, http.StatusNotFound, "Ticket not found.", "ERR_NOT_FOUND")
			return
		}
		var fileName, storagePath, mime string
		var createdAt time.Time
		var fileBytes []byte
		err = pool.QueryRow(r.Context(), `
			select a.file_name, a.storage_path, coalesce(a.mime_type, ''), a.created_at, a.file_bytes
			from public.sup_support_ticket_attachments a
			join public.sup_support_tickets t on t.id = a.ticket_id
			where a.id = $1 and a.ticket_id = $2 and t.tenant_id = $3`,
			attachmentID, ticketID, tu.TenantID).
			Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if len(fileBytes) > 0 {
			if mime != "" {
				w.Header().Set("Content-Type", mime)
			}
			w.Header().Set("Content-Disposition", `attachment; filename="`+strings.ReplaceAll(fileName, `"`, "")+`"`)
			http.ServeContent(w, r, fileName, createdAt, bytes.NewReader(fileBytes))
			return
		}
		// Legacy rows uploaded before bytes were stored in the DB: try disk.
		if err := filedownload.ServeStoredFile(w, r, ticketUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}

func nullIfEmptyStr(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
