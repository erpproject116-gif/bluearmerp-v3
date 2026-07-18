package hr

import (
	"encoding/json"
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

const maxEmployeeDocBytes = 25 * 1024 * 1024

type EmployeeDocument struct {
	ID         int64   `json:"id"`
	EmployeeID int64   `json:"employee_id"`
	DocType    string  `json:"doc_type"`
	Title      string  `json:"title"`
	FileName   string  `json:"file_name"`
	FileURL    string  `json:"file_url"`
	MimeType   string  `json:"mime_type"`
	HasFile    bool    `json:"has_file"`
	Notes      *string `json:"notes,omitempty"`
	CreatedAt  string  `json:"created_at,omitempty"`
}

func registerEmployeeDocRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.employee_docs", auth.AccessRead)).Get("/employees/{id}/documents", listEmployeeDocuments(pool))
	r.With(auth.RequirePermission("hr.employee_docs", auth.AccessWrite)).Post("/employees/{id}/documents", createEmployeeDocument(pool))
	r.With(auth.RequirePermission("hr.employee_docs", auth.AccessRead)).Get("/employees/{id}/documents/{docId}/download", downloadEmployeeDocument(pool))
	r.With(auth.RequirePermission("hr.employee_docs", auth.AccessWrite)).Delete("/employee-documents/{id}", deleteEmployeeDocument(pool))
}

func listEmployeeDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid employee id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, employee_id, doc_type, title, file_name, file_url, mime_type,
			  file_bytes is not null, notes, created_at::text
			from public.hr_employee_documents
			where tenant_id = $1 and employee_id = $2
			order by created_at desc`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list documents.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []EmployeeDocument
		for rows.Next() {
			var row EmployeeDocument
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.DocType, &row.Title, &row.FileName, &row.FileURL, &row.MimeType, &row.HasFile, &row.Notes, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read document.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []EmployeeDocument{}
		}
		response.OK(w, out, "OK")
	}
}

func createEmployeeDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid employee id."})
			return
		}

		ct := strings.ToLower(strings.TrimSpace(r.Header.Get("Content-Type")))
		if strings.HasPrefix(ct, "multipart/form-data") {
			createEmployeeDocumentMultipart(w, r, pool, tu, empID)
			return
		}


		var body struct {
			DocType  string  `json:"doc_type"`
			Title    string  `json:"title"`
			FileName string  `json:"file_name"`
			FileURL  string  `json:"file_url"`
			MimeType string  `json:"mime_type"`
			Notes    *string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		docType := strings.TrimSpace(body.DocType)
		if docType == "" {
			docType = "other"
		}
		var row EmployeeDocument
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employee_documents
			  (tenant_id, employee_id, doc_type, title, file_name, file_url, mime_type, notes, uploaded_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id, employee_id, doc_type, title, file_name, file_url, mime_type,
			  file_bytes is not null, notes, created_at::text`,
			tu.TenantID, empID, docType, title, strings.TrimSpace(body.FileName), strings.TrimSpace(body.FileURL),
			strings.TrimSpace(body.MimeType), body.Notes, tu.AppUserID,
		).Scan(&row.ID, &row.EmployeeID, &row.DocType, &row.Title, &row.FileName, &row.FileURL, &row.MimeType, &row.HasFile, &row.Notes, &row.CreatedAt)
		if err != nil {
			if strings.Contains(err.Error(), "check") {
				response.Validation(w, map[string]string{"doc_type": "Invalid document type."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create document.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.employee_doc.create", "hr_employee_document", &row.ID, nil, body)
		response.OK(w, row, "Document added to 201 file.")
	}
}

func createEmployeeDocumentMultipart(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, empID int64) {
	if err := r.ParseMultipartForm(maxEmployeeDocBytes + 1024); err != nil {
		response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		response.Validation(w, map[string]string{"file": "File is required."})
		return
	}
	defer file.Close()

	if header.Size > maxEmployeeDocBytes {
		response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
		return
	}

	safeName := filepath.Base(strings.TrimSpace(header.Filename))
	if safeName == "" || safeName == "." {
		response.Validation(w, map[string]string{"file": "Invalid file name."})
		return
	}

	data, err := io.ReadAll(io.LimitReader(file, maxEmployeeDocBytes+1))
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
		return
	}
	if int64(len(data)) > maxEmployeeDocBytes {
		response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
		return
	}

	docType := strings.TrimSpace(r.FormValue("doc_type"))
	if docType == "" {
		docType = "other"
	}
	title := strings.TrimSpace(r.FormValue("title"))
	if title == "" {
		title = safeName
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = strings.TrimSpace(r.FormValue("mime_type"))
	}

	var row EmployeeDocument
	err = pool.QueryRow(r.Context(), `
		insert into public.hr_employee_documents
		  (tenant_id, employee_id, doc_type, title, file_name, file_url, mime_type, file_bytes, uploaded_by_user_id)
		values ($1,$2,$3,$4,$5,'',$6,$7,$8)
		returning id, employee_id, doc_type, title, file_name, file_url, mime_type,
		  file_bytes is not null, notes, created_at::text`,
		tu.TenantID, empID, docType, title, safeName, mimeType, data, tu.AppUserID,
	).Scan(&row.ID, &row.EmployeeID, &row.DocType, &row.Title, &row.FileName, &row.FileURL, &row.MimeType, &row.HasFile, &row.Notes, &row.CreatedAt)
	if err != nil {
		if strings.Contains(err.Error(), "check") {
			response.Validation(w, map[string]string{"doc_type": "Invalid document type."})
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to create document.", "ERR_INTERNAL")
		return
	}
	_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.employee_doc.upload", "hr_employee_document", &row.ID, nil, map[string]any{
		"employee_id": empID,
		"doc_type":    docType,
		"file_name":   safeName,
		"size_bytes":  len(data),
	})
	response.OK(w, row, "Document added to 201 file.")
}

func downloadEmployeeDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid employee id."})
			return
		}
		docID, err := strconv.ParseInt(chi.URLParam(r, "docId"), 10, 64)
		if err != nil || docID <= 0 {
			response.Validation(w, map[string]string{"docId": "Invalid document id."})
			return
		}
		var fileName, mime string
		var createdAt time.Time
		var fileBytes []byte
		err = pool.QueryRow(r.Context(), `
			select file_name, coalesce(mime_type, ''), created_at, file_bytes
			from public.hr_employee_documents
			where id = $1 and employee_id = $2 and tenant_id = $3`,
			docID, empID, tu.TenantID).
			Scan(&fileName, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		if len(fileBytes) == 0 {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, "", "", fileName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}

func deleteEmployeeDocument(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.hr_employee_documents where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Document not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
