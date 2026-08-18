package cms

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxMediaBytes = 25 * 1024 * 1024

type Media struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type,omitempty"`
	SizeBytes        int64  `json:"size_bytes"`
	AltText          string `json:"alt_text,omitempty"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
}

func listMedia(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{
			"file_name": "m.file_name", "created_at": "m.created_at", "size_bytes": "m.size_bytes",
		})
		where := "m.tenant_id = $1 and m.deleted_at is null"
		args := []any{tu.TenantID}
		n := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and m.file_name ilike $%d", n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		order := orderSQL(p.Order)
		if p.Sort == "m.created_at" && p.Order == "asc" && r.URL.Query().Get("order") == "" {
			order = "desc"
		}
		q := fmt.Sprintf(`
			select m.id, m.file_name, coalesce(m.mime_type,''), m.size_bytes, m.alt_text, m.uploaded_by_user_id, m.created_at::text,
			  count(*) over()
			from public.cms_media m
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, order, n, n+1)
		args = append(args, p.PageSize, httputil.Offset(p))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list media.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Media
		var total int64
		for rows.Next() {
			var row Media
			if err := rows.Scan(&row.ID, &row.FileName, &row.MimeType, &row.SizeBytes, &row.AltText, &row.UploadedByUserID, &row.CreatedAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read media.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Media{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func uploadMedia(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(maxMediaBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 25 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxMediaBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, maxMediaBytes+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store file.", "ERR_INTERNAL")
			return
		}
		if int64(len(data)) > maxMediaBytes {
			response.Validation(w, map[string]string{"file": "File exceeds 25 MB limit."})
			return
		}
		claimed := header.Header.Get("Content-Type")
		mime, ok := sniffAllowedMIME(data, claimed, safeName)
		if !ok {
			response.Validation(w, map[string]string{"file": "Only PNG, JPEG, GIF, WebP, and PDF files are allowed."})
			return
		}
		alt := strings.TrimSpace(r.FormValue("alt_text"))
		if len(alt) > 500 {
			alt = alt[:500]
		}
		relDir := strconv.FormatInt(tu.TenantID, 10)
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var id int64
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.cms_media
			  (tenant_id, file_name, mime_type, size_bytes, storage_path, file_bytes, alt_text, uploaded_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8)
			returning id, created_at`,
			tu.TenantID, safeName, mime, int64(len(data)), storagePath, data, alt, tu.AppUserID,
		).Scan(&id, &createdAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save file.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.media.upload", "cms_media", &id, nil, map[string]any{
			"file_name":  safeName,
			"size_bytes": len(data),
		})
		uid := tu.AppUserID
		response.OK(w, Media{
			ID: id, FileName: safeName, MimeType: mime, SizeBytes: int64(len(data)),
			AltText: alt, UploadedByUserID: &uid, CreatedAt: createdAt.Format(time.RFC3339),
		}, "Uploaded.")
	}
}

func downloadMedia(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var fileName, storagePath, mime string
		var createdAt time.Time
		var fileBytes []byte
		err = pool.QueryRow(r.Context(), `
			select file_name, storage_path, coalesce(mime_type,''), created_at, file_bytes
			from public.cms_media
			where id=$1 and tenant_id=$2 and deleted_at is null`, id, tu.TenantID,
		).Scan(&fileName, &storagePath, &mime, &createdAt, &fileBytes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		dispName := fileName
		if isImageMIME(mime) {
			w.Header().Set("Content-Disposition", `inline; filename="`+strings.ReplaceAll(fileName, `"`, "")+`"`)
			dispName = ""
		}
		if err := filedownload.ServeBytesOrStoredFile(w, r, fileBytes, attachmentx.Dir("cms"), storagePath, dispName, mime, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
		}
	}
}

func deleteMedia(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var used int64
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.cms_pages
			where tenant_id=$1 and featured_media_id=$2 and deleted_at is null`, tu.TenantID, id).Scan(&used)
		if used > 0 {
			response.Err(w, http.StatusConflict, "This file is used as a page image. Remove it from pages first.", "ERR_CONFLICT")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_media set deleted_at=now()
			where id=$1 and tenant_id=$2 and deleted_at is null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.media.delete", "cms_media", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}
