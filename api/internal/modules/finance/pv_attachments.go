package finance

import (
	"fmt"
	"io"
	"net/http"
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

type PVAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

const maxPVAttachmentBytes = 25 * 1024 * 1024

func registerPVAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	// Allow apply users (payment_vouchers_new) and full voucher editors to attach receipts.
	r.With(auth.RequirePermission("finance.payment_vouchers_new", auth.AccessWrite)).Post("/payment-vouchers/{id}/attachments", uploadPVAttachment(pool))
	r.Get("/payment-vouchers/{id}/attachments", listPVAttachments(pool))
	r.Get("/payment-vouchers/{id}/attachments/{attachmentId}/download", downloadPVAttachment(pool))
}

func uploadPVAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		voucherID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.fin_payment_vouchers where id = $1 and tenant_id = $2 and deleted_at is null)`,
			voucherID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Payment voucher not found.", "ERR_NOT_FOUND")
			return
		}
		if err := r.ParseMultipartForm(maxPVAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxPVAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxPVAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxPVAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), "pv", strconv.FormatInt(voucherID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_payment_voucher_attachments (
			  payment_voucher_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes
			) values ($1,$2,$3,$4,$5,$6,$7) returning id, created_at`,
			voucherID, safeName, orNullIfEmpty(mimeType), written, storagePath, tu.AppUserID, data).Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.payment_voucher.attachment.upload", "fin_payment_voucher_attachment", &id, nil, map[string]any{
			"payment_voucher_id": voucherID,
			"file_name":          safeName,
		})
		response.OK(w, PVAttachment{
			ID:               id,
			FileName:         safeName,
			MimeType:         mimeType,
			SizeBytes:        written,
			UploadedByUserID: &tu.AppUserID,
			CreatedAt:        createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listPVAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		voucherID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.fin_payment_voucher_attachments a
			join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
			where a.payment_voucher_id = $1 and pv.tenant_id = $2 and pv.deleted_at is null
			order by a.created_at desc`, voucherID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PVAttachment
		for rows.Next() {
			var row PVAttachment
			var created time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &created); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = created.UTC().Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []PVAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadPVAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		voucherID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
			from public.fin_payment_voucher_attachments a
			join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
			where a.id = $1 and a.payment_voucher_id = $2 and pv.tenant_id = $3 and pv.deleted_at is null`,
			attachmentID, voucherID, tu.TenantID).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, financeUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}
