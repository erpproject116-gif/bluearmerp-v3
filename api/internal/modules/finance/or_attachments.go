package finance

import (
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

type ORAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

const maxORAttachmentBytes = 25 * 1024 * 1024

func registerORAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.official_receipts", auth.AccessWrite)).Post("/official-receipts/{id}/attachments", uploadORAttachment(pool))
	r.Get("/official-receipts/{id}/attachments", listORAttachments(pool))
	r.Get("/official-receipts/{id}/attachments/{attachmentId}/download", downloadORAttachment(pool))
}

func financeUploadDir() string {
	if d := strings.TrimSpace(os.Getenv("FINANCE_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/finance-attachments"
}

func uploadORAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		receiptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.fin_official_receipts where id = $1 and tenant_id = $2 and deleted_at is null)`,
			receiptID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Official receipt not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxORAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxORAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		// Persist bytes in the database: local disk is ephemeral on containerized
		// deploys, so files written here vanish on redeploy while their rows survive.
		data, err := io.ReadAll(io.LimitReader(file, maxORAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxORAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(receiptID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_official_receipt_attachments (
			  official_receipt_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes
			) values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
			receiptID, safeName, orNullIfEmpty(mimeType), written, storagePath, tu.AppUserID, data).Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.receipt.attachment.upload", "fin_official_receipt_attachment", &id, nil, map[string]any{"receipt_id": receiptID, "file_name": safeName})
		response.OK(w, ORAttachment{ID: id, FileName: safeName, MimeType: mimeType, SizeBytes: written, UploadedByUserID: &tu.AppUserID, CreatedAt: createdAt.Format(time.RFC3339)}, "Uploaded.")
	}
}

func listORAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		receiptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.fin_official_receipt_attachments a
			join public.fin_official_receipts r on r.id = a.official_receipt_id
			where a.official_receipt_id = $1 and r.tenant_id = $2 and r.deleted_at is null
			order by a.created_at desc`, receiptID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ORAttachment
		for rows.Next() {
			var row ORAttachment
			var created time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &created); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = created.UTC().Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []ORAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadORAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		receiptID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		attachmentID, err := strconv.ParseInt(chi.URLParam(r, "attachmentId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"attachmentId": "Invalid attachment id."})
			return
		}
		var fileName, storagePath, mime string
		var createdAt time.Time
		var fileBytes []byte
		err = pool.QueryRow(r.Context(), `
			select a.file_name, a.storage_path, coalesce(a.mime_type, ''), a.created_at, a.file_bytes
			from public.fin_official_receipt_attachments a
			join public.fin_official_receipts r on r.id = a.official_receipt_id
			where a.id = $1 and a.official_receipt_id = $2 and r.tenant_id = $3 and r.deleted_at is null`,
			attachmentID, receiptID, tu.TenantID).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, financeUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}

func orNullIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
