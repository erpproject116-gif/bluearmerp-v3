package sales

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxAttachmentBytes = 25 * 1024 * 1024

type SalesAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/{id}/attachments", uploadSalesAttachment(pool))
	r.Get("/{id}/attachments", listSalesAttachments(pool))
}

func uploadDir() string {
	if d := strings.TrimSpace(os.Getenv("SALES_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/sales-attachments"
}

func uploadSalesAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		salesID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null)`,
			salesID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}

		if err := r.ParseMultipartForm(maxAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()

		if header.Size > maxAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}

		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}

		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(salesID, 10))
		absDir := filepath.Join(uploadDir(), relDir)
		if err := os.MkdirAll(absDir, 0o755); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}

		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		absPath := filepath.Join(absDir, storedName)
		dst, err := os.Create(absPath)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written, err := io.Copy(dst, io.LimitReader(file, maxAttachmentBytes+1))
		_ = dst.Close()
		if err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		if written > maxAttachmentBytes {
			_ = os.Remove(absPath)
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}

		mimeType := header.Header.Get("Content-Type")
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))

		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.sa_sales_attachments
			  (sales_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id)
			values ($1,$2,$3,$4,$5,$6)
			returning id, created_at`,
			salesID, safeName, nullIfEmpty(mimeType), written, storagePath, tu.AppUserID).
			Scan(&id, &createdAt)
		if err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.attachment.upload", "sa_sales_attachment", &id, nil, map[string]any{
			"sales_id":   salesID,
			"file_name":  safeName,
			"size_bytes": written,
		})

		response.OK(w, SalesAttachment{
			ID:               id,
			FileName:         safeName,
			MimeType:         mimeType,
			SizeBytes:        written,
			UploadedByUserID: &tu.AppUserID,
			CreatedAt:        createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listSalesAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		salesID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null)`,
			salesID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.sa_sales_attachments a
			join public.sa_sales s on s.id = a.sales_id
			where a.sales_id = $1 and s.tenant_id = $2
			order by a.created_at desc`, salesID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SalesAttachment
		for rows.Next() {
			var row SalesAttachment
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []SalesAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func nullIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}
