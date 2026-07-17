package finance

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxSIAttachmentBytes = 25 * 1024 * 1024

type SupplierInvoiceAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func registerSupplierInvoiceAttachmentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/supplier-invoices/{id}/attachments", uploadSIAttachment(pool))
	r.Get("/supplier-invoices/{id}/attachments", listSIAttachments(pool))
	r.Get("/supplier-invoices/{id}/attachments/{attachmentId}/download", downloadSIAttachment(pool))
}

func supplierInvoiceUploadDir() string {
	return attachmentx.Dir("supplier_invoice")
}

func uploadSIAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		siID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.fin_supplier_invoices where id = $1 and tenant_id = $2 and deleted_at is null)`,
			siID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}

		if err := r.ParseMultipartForm(maxSIAttachmentBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()

		if header.Size > maxSIAttachmentBytes {
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
		data, err := io.ReadAll(io.LimitReader(file, maxSIAttachmentBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		written := int64(len(data))
		if written > maxSIAttachmentBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}

		mimeType := header.Header.Get("Content-Type")
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), strconv.FormatInt(siID, 10))
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))

		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_supplier_invoice_attachments
			  (supplier_invoice_id, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id, file_bytes)
			values ($1,$2,$3,$4,$5,$6,$7)
			returning id, created_at`,
			siID, safeName, siNullIfEmpty(mimeType), written, storagePath, tu.AppUserID, data).
			Scan(&id, &createdAt)
		if err != nil {
			log.Printf("supplier_invoice attachment insert: supplier_invoice_id=%d: %v", siID, err)
			if isMissingAttachmentTable(err) {
				response.Err(w, http.StatusServiceUnavailable, "Purchase attachments are not available until database migration 142 is applied.", "ERR_SCHEMA")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save attachment.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "supplier_invoice.attachment.upload", "fin_supplier_invoice_attachment", &id, nil, map[string]any{
			"supplier_invoice_id": siID,
			"file_name":           safeName,
			"size_bytes":          written,
		})

		response.OK(w, SupplierInvoiceAttachment{
			ID:               id,
			FileName:         safeName,
			MimeType:         mimeType,
			SizeBytes:        written,
			UploadedByUserID: &tu.AppUserID,
			CreatedAt:        createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func listSIAttachments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		siID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.fin_supplier_invoices where id = $1 and tenant_id = $2 and deleted_at is null)`,
			siID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select a.id, a.file_name, coalesce(a.mime_type, ''), a.size_bytes, a.uploaded_by_user_id, a.created_at
			from public.fin_supplier_invoice_attachments a
			join public.fin_supplier_invoices si on si.id = a.supplier_invoice_id
			where a.supplier_invoice_id = $1 and si.tenant_id = $2
			order by a.created_at desc`, siID, tu.TenantID)
		if err != nil {
			log.Printf("supplier_invoice attachments list: supplier_invoice_id=%d tenant_id=%d: %v", siID, tu.TenantID, err)
			if isMissingAttachmentTable(err) {
				response.Err(w, http.StatusServiceUnavailable, "Purchase attachments are not available until database migration 142 is applied.", "ERR_SCHEMA")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to list attachments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SupplierInvoiceAttachment
		for rows.Next() {
			var row SupplierInvoiceAttachment
			var createdAt time.Time
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.UploadedByUserID, &createdAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
				return
			}
			row.CreatedAt = createdAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			log.Printf("supplier_invoice attachments list rows: supplier_invoice_id=%d: %v", siID, err)
			response.Err(w, http.StatusInternalServerError, "Failed to read attachments.", "ERR_INTERNAL")
			return
		}
		if out == nil {
			out = []SupplierInvoiceAttachment{}
		}
		response.OK(w, out, "OK")
	}
}

func downloadSIAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		siID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
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
			from public.fin_supplier_invoice_attachments a
			join public.fin_supplier_invoices si on si.id = a.supplier_invoice_id
			where a.id = $1 and a.supplier_invoice_id = $2 and si.tenant_id = $3`,
			attachmentID, siID, tu.TenantID).
			Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, supplierInvoiceUploadDir(), storagePath, fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}

func siNullIfEmpty(s string) *string {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	return &s
}

func isMissingAttachmentTable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "42P01"
}
