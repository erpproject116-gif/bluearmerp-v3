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

const maxStockAdjAttachmentBytes = 25 * 1024 * 1024

type StockAdjustmentAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerStockAdjustmentAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/stock-adjustment-requests/{id}/attachments", uploadStockAdjustmentAttachment(pool))
	r.Get("/stock-adjustment-requests/{id}/attachments", listStockAdjustmentAttachments(pool))
	r.Get("/stock-adjustment-requests/{id}/attachments/{attachmentId}/download", downloadStockAdjustmentAttachment(pool))
}

func stockAdjUploadDir() string {
	if d := strings.TrimSpace(os.Getenv("STOCK_ADJUSTMENT_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/stock-adjustment-attachments"
}

func uploadStockAdjustmentAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		requestID, err := parseStockAdjRequestID(r)
		if err != nil || requestID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.inv_stock_adjustment_requests where id = $1 and tenant_id = $2)`,
			requestID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Stock adjustment request not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxStockAdjAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxStockAdjAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxStockAdjAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxStockAdjAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(requestID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))

		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.inv_stock_adjustment_request_attachments
			  (request_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
			values ($1,$2,$3,$4,$5,$6,$7)
			returning id, created_at`,
			requestID, safeName, nullIfEmptyAttachment(mimeType), written, storagePath, tu.AppUserID, data).
			Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_adjustment.attachment.upload", "inv_stock_adjustment_attachment", &id, nil, map[string]any{
			"request_id": requestID,
			"file_name":  safeName,
		})
		response.OK(w, StockAdjustmentAttachment{
			ID: id, FileName: safeName, MimeType: mimeType, SizeBytes: written,
			UploadedByUserID: &tu.AppUserID, CreatedAt: createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listStockAdjustmentAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		requestID, err := parseStockAdjRequestID(r)
		if err != nil || requestID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.inv_stock_adjustment_request_attachments a
			join public.inv_stock_adjustment_requests r on r.id = a.request_id
			where a.request_id = $1 and r.tenant_id = $2
			order by a.created_at desc`, requestID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []StockAdjustmentAttachment
		for rows.Next() {
			var row StockAdjustmentAttachment
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []StockAdjustmentAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadStockAdjustmentAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		requestID, err := parseStockAdjRequestID(r)
		if err != nil || requestID <= 0 {
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
			from public.inv_stock_adjustment_request_attachments a
			join public.inv_stock_adjustment_requests r on r.id = a.request_id
			where a.id = $1 and a.request_id = $2 and r.tenant_id = $3`,
			attachmentID, requestID, tu.TenantID).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, stockAdjUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to download attachment.", "ERR_INTERNAL")
		}
	}
}
