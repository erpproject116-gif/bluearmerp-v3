package reporttemplates

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
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

const maxLogoBytes = 2 * 1024 * 1024

type templateRow struct {
	ID           int64           `json:"id"`
	ReportKey    string          `json:"report_key"`
	TemplateCode string          `json:"template_code"`
	TemplateName string          `json:"template_name"`
	Settings     json.RawMessage `json:"settings"`
	UpdatedAt    string          `json:"updated_at"`
}

type upsertBody struct {
	TemplateCode string          `json:"template_code"`
	TemplateName string          `json:"template_name"`
	Settings     json.RawMessage `json:"settings"`
}

type logoAssetRow struct {
	ID        int64  `json:"id"`
	ReportKey string `json:"report_key"`
	FileName  string `json:"file_name"`
	MimeType  string `json:"mime_type,omitempty"`
	SizeBytes int64  `json:"size_bytes"`
}

var templateCodeRe = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,59}$`)

var allowedLogoMIME = map[string]struct{}{
	"image/png":  {},
	"image/jpeg": {},
	"image/gif":  {},
	"image/webp": {},
}

func slugTemplateCode(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	s = regexp.MustCompile(`[^a-z0-9]+`).ReplaceAllString(s, "_")
	s = strings.Trim(s, "_")
	if s == "" {
		s = "template"
	}
	if len(s) > 60 {
		s = s[:60]
	}
	return s
}

func uploadDir() string {
	if d := strings.TrimSpace(os.Getenv("REPORT_TEMPLATE_UPLOAD_DIR")); d != "" {
		return d
	}
	return "data/report-template-assets"
}

func listTemplates(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		reportKey := strings.TrimSpace(r.URL.Query().Get("report_key"))
		if !ValidReportKey(reportKey) {
			response.Validation(w, map[string]string{"report_key": "Unsupported report key."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, report_key, template_code, template_name, settings, updated_at
			from public.tenant_report_templates
			where tenant_id = $1 and report_key = $2
			order by template_name asc`, tu.TenantID, reportKey)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report templates.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []templateRow
		for rows.Next() {
			var row templateRow
			var updatedAt time.Time
			if err := rows.Scan(&row.ID, &row.ReportKey, &row.TemplateCode, &row.TemplateName, &row.Settings, &updatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load report templates.", "ERR_INTERNAL")
				return
			}
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []templateRow{}
		}
		response.OK(w, out, "OK")
	}
}

func upsertTemplate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		reportKey := strings.TrimSpace(r.URL.Query().Get("report_key"))
		if !ValidReportKey(reportKey) {
			response.Validation(w, map[string]string{"report_key": "Unsupported report key."})
			return
		}
		var body upsertBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.TemplateName)
		if name == "" {
			response.Validation(w, map[string]string{"template_name": "Template name is required."})
			return
		}
		code := strings.ToLower(strings.TrimSpace(body.TemplateCode))
		if code == "" {
			code = slugTemplateCode(name)
		}
		if !templateCodeRe.MatchString(code) {
			response.Validation(w, map[string]string{"template_code": "Use lowercase letters, numbers, underscores, or hyphens."})
			return
		}
		if len(body.Settings) == 0 {
			body.Settings = json.RawMessage(`{}`)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.tenant_report_templates (
			  tenant_id, report_key, template_code, template_name, settings, created_by_user_id
			) values ($1, $2, $3, $4, $5, $6)
			on conflict (tenant_id, report_key, template_code) do update set
			  template_name = excluded.template_name,
			  settings = excluded.settings,
			  updated_at = now()
			returning id`, tu.TenantID, reportKey, code, name, body.Settings, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save report template.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "report_template.save", "tenant_report_template", &id, nil, map[string]any{
			"report_key":    reportKey,
			"template_code": code,
		})
		response.OK(w, map[string]any{"id": id, "template_code": code}, "Saved.")
	}
}

func deleteTemplate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		reportKey := strings.TrimSpace(r.URL.Query().Get("report_key"))
		if !ValidReportKey(reportKey) {
			response.Validation(w, map[string]string{"report_key": "Unsupported report key."})
			return
		}
		code := strings.TrimSpace(chi.URLParam(r, "code"))
		if code == "" {
			response.Validation(w, map[string]string{"code": "Template code is required."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.tenant_report_templates
			where tenant_id = $1 and report_key = $2 and template_code = $3`,
			tu.TenantID, reportKey, code)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Template not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "report_template.delete", "tenant_report_template", nil, nil, map[string]any{
			"report_key":    reportKey,
			"template_code": code,
		})
		response.OK(w, nil, "Deleted.")
	}
}

func uploadLogo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		reportKey := strings.TrimSpace(r.URL.Query().Get("report_key"))
		if !ValidReportKey(reportKey) {
			response.Validation(w, map[string]string{"report_key": "Unsupported report key."})
			return
		}
		if err := r.ParseMultipartForm(maxLogoBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form or file too large (max 2 MB)."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "File is required."})
			return
		}
		defer file.Close()
		if header.Size > maxLogoBytes {
			response.Validation(w, map[string]string{"file": "Logo exceeds 2 MB limit."})
			return
		}
		mimeType := strings.ToLower(strings.TrimSpace(header.Header.Get("Content-Type")))
		if _, ok := allowedLogoMIME[mimeType]; mimeType != "" && !ok {
			response.Validation(w, map[string]string{"file": "Logo must be PNG, JPEG, GIF, or WebP."})
			return
		}
		safeName := filepath.Base(strings.TrimSpace(header.Filename))
		if safeName == "" || safeName == "." {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		relDir := filepath.Join(strconv.FormatInt(tu.TenantID, 10), reportKey, "logos")
		absDir := filepath.Join(uploadDir(), relDir)
		if err := os.MkdirAll(absDir, 0o755); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store logo.", "ERR_INTERNAL")
			return
		}
		storedName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), safeName)
		absPath := filepath.Join(absDir, storedName)
		dst, err := os.Create(absPath)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store logo.", "ERR_INTERNAL")
			return
		}
		written, err := io.Copy(dst, io.LimitReader(file, maxLogoBytes+1))
		_ = dst.Close()
		if err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to store logo.", "ERR_INTERNAL")
			return
		}
		if written > maxLogoBytes {
			_ = os.Remove(absPath)
			response.Validation(w, map[string]string{"file": "Logo exceeds 2 MB limit."})
			return
		}
		storagePath := filepath.ToSlash(filepath.Join(relDir, storedName))
		var row logoAssetRow
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.tenant_report_template_assets (
			  tenant_id, report_key, file_name, mime_type, size_bytes, storage_path, uploaded_by_user_id
			) values ($1, $2, $3, $4, $5, $6, $7)
			returning id, report_key, file_name, coalesce(mime_type, ''), size_bytes, created_at`,
			tu.TenantID, reportKey, safeName, mimeType, written, storagePath, tu.AppUserID,
		).Scan(&row.ID, &row.ReportKey, &row.FileName, &row.MimeType, &row.SizeBytes, &createdAt)
		if err != nil {
			_ = os.Remove(absPath)
			response.Err(w, http.StatusInternalServerError, "Failed to save logo record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "report_template.logo_upload", "tenant_report_template_asset", &row.ID, nil, map[string]any{
			"report_key": reportKey,
		})
		response.OK(w, row, "Uploaded.")
	}
}

func downloadLogo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		assetID, err := strconv.ParseInt(chi.URLParam(r, "assetId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"assetId": "Invalid asset id."})
			return
		}
		var fileName, storagePath, mimeType string
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			select file_name, storage_path, coalesce(mime_type, ''), created_at
			from public.tenant_report_template_assets
			where id = $1 and tenant_id = $2`, assetID, tu.TenantID).Scan(&fileName, &storagePath, &mimeType, &createdAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Logo not found.", "ERR_NOT_FOUND")
			return
		}
		inline := strings.TrimSpace(r.URL.Query().Get("inline")) == "1"
		if inline {
			abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Logo not found.", "ERR_NOT_FOUND")
				return
			}
			f, err := os.Open(abs)
			if err != nil {
				response.Err(w, http.StatusNotFound, "Logo not found.", "ERR_NOT_FOUND")
				return
			}
			defer f.Close()
			if mimeType != "" {
				w.Header().Set("Content-Type", mimeType)
			}
			w.Header().Set("Content-Disposition", "inline")
			http.ServeContent(w, r, fileName, createdAt, f)
			return
		}
		if err := filedownload.ServeStoredFile(w, r, uploadDir(), storagePath, fileName, mimeType, createdAt); err != nil {
			response.Err(w, http.StatusNotFound, "Logo not found.", "ERR_NOT_FOUND")
		}
	}
}

func deleteLogo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		assetID, err := strconv.ParseInt(chi.URLParam(r, "assetId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"assetId": "Invalid asset id."})
			return
		}
		var storagePath string
		err = pool.QueryRow(r.Context(), `
			delete from public.tenant_report_template_assets
			where id = $1 and tenant_id = $2
			returning storage_path`, assetID, tu.TenantID).Scan(&storagePath)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Logo not found.", "ERR_NOT_FOUND")
			return
		}
		if abs, err := filedownload.ResolveSafePath(uploadDir(), storagePath); err == nil {
			_ = os.Remove(abs)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "report_template.logo_delete", "tenant_report_template_asset", &assetID, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}
