package manufacturing

import (
	"fmt"
	"io"
	"net/http"
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

const maxWorkOrderAttachmentBytes = 25 * 1024 * 1024

type WorkOrderAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerWorkOrderAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessWrite)).
		Post("/work-orders/{id}/attachments", uploadWorkOrderAttachment(pool))
	r.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessRead)).
		Get("/work-orders/{id}/attachments", listWorkOrderAttachments(pool))
	r.With(auth.RequirePermission("manufacturing.work_orders", auth.AccessRead)).
		Get("/work-orders/{id}/attachments/{attachmentId}/download", downloadWorkOrderAttachment(pool))
}

func nullIfEmptyWOAttachment(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func uploadWorkOrderAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || woID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.mfg_work_orders where id = $1 and tenant_id = $2)`,
			woID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Work order not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxWorkOrderAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxWorkOrderAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := strings.TrimSpace(header.Filename)
		safeName = safeName[strings.LastIndex(safeName, "/")+1:]
		safeName = safeName[strings.LastIndex(safeName, "\\")+1:]
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxWorkOrderAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxWorkOrderAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		storagePath := fmt.Sprintf("%d/%d/%d_%s", tu.TenantID, woID, time.Now().UnixNano(), safeName)

		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.mfg_work_order_attachments
			  (work_order_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
			values ($1,$2,$3,$4,$5,$6,$7)
			returning id, created_at`,
			woID, safeName, nullIfEmptyWOAttachment(mimeType), written, storagePath, tu.AppUserID, data).
			Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order.attachment.upload", "mfg_work_order_attachment", &id, nil, map[string]any{
			"work_order_id": woID,
			"file_name":     safeName,
		})
		response.OK(w, WorkOrderAttachment{
			ID: id, FileName: safeName, MimeType: mimeType, SizeBytes: written,
			UploadedByUserID: &tu.AppUserID, CreatedAt: createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listWorkOrderAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || woID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.mfg_work_order_attachments a
			join public.mfg_work_orders wo on wo.id = a.work_order_id
			where a.work_order_id = $1 and wo.tenant_id = $2
			order by a.created_at desc`, woID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []WorkOrderAttachment
		for rows.Next() {
			var row WorkOrderAttachment
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []WorkOrderAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadWorkOrderAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		woID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || woID <= 0 {
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
			from public.mfg_work_order_attachments a
			join public.mfg_work_orders wo on wo.id = a.work_order_id
			where a.id = $1 and a.work_order_id = $2 and wo.tenant_id = $3`,
			attachmentID, woID, tu.TenantID).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, "", storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to download attachment.", "ERR_INTERNAL")
		}
	}
}
