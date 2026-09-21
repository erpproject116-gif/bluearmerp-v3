package inventory

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

const maxStockEntryAttachmentBytes = 25 * 1024 * 1024

type StockEntryAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerStockEntryAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).
		Post("/stock-entries/{id}/attachments", uploadStockEntryAttachment(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).
		Get("/stock-entries/{id}/attachments", listStockEntryAttachments(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).
		Get("/stock-entries/{id}/attachments/{attachmentId}/download", downloadStockEntryAttachment(pool))
}

func stockEntryUploadDir() string {
	if d := strings.TrimSpace(os.Getenv("STOCK_ENTRY_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/stock-entry-attachments"
}

func parseStockEntryID(r *http.Request) (int64, error) {
	return strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
}

func uploadStockEntryAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entryID, err := parseStockEntryID(r)
		if err != nil || entryID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.inv_stock_entries where id = $1 and tenant_id = $2)`,
			entryID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxStockEntryAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxStockEntryAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxStockEntryAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxStockEntryAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(entryID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))

		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.inv_stock_entry_attachments
			  (stock_entry_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
			values ($1,$2,$3,$4,$5,$6,$7)
			returning id, created_at`,
			entryID, safeName, nullIfEmptyAttachment(mimeType), written, storagePath, tu.AppUserID, data).
			Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry.attachment.upload", "inv_stock_entry_attachment", &id, nil, map[string]any{
			"stock_entry_id": entryID,
			"file_name":      safeName,
		})
		response.OK(w, StockEntryAttachment{
			ID: id, FileName: safeName, MimeType: mimeType, SizeBytes: written,
			UploadedByUserID: &tu.AppUserID, CreatedAt: createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listStockEntryAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entryID, err := parseStockEntryID(r)
		if err != nil || entryID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.inv_stock_entry_attachments a
			join public.inv_stock_entries e on e.id = a.stock_entry_id
			where a.stock_entry_id = $1 and e.tenant_id = $2
			order by a.created_at desc`, entryID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []StockEntryAttachment
		for rows.Next() {
			var row StockEntryAttachment
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []StockEntryAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadStockEntryAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entryID, err := parseStockEntryID(r)
		if err != nil || entryID <= 0 {
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
			from public.inv_stock_entry_attachments a
			join public.inv_stock_entries e on e.id = a.stock_entry_id
			where a.id = $1 and a.stock_entry_id = $2 and e.tenant_id = $3`,
			attachmentID, entryID, tu.TenantID).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, stockEntryUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to download attachment.", "ERR_INTERNAL")
		}
	}
}
