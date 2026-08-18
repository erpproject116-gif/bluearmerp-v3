package cms

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterPublicRoutes mounts unauthenticated published-article reads.
// Content comes from CMS_PUBLIC_TENANT_CODE (default BLUEARM), not the visitor's session.
func RegisterPublicRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Route("/public/cms", func(sr chi.Router) {
		sr.Get("/pages", publicListPublished(pool, cfg))
		sr.Get("/pages/by-slug/{slug}", publicGetBySlug(pool, cfg))
		sr.Get("/media/{id}/download", publicDownloadMedia(pool, cfg))
	})
}

func publicTenantID(r *http.Request, pool *pgxpool.Pool, cfg config.Config) (int64, bool) {
	code := strings.TrimSpace(cfg.CmsPublicTenantCode)
	if code == "" {
		code = cfg.DemoLeadgenTenantCode
	}
	return customerregistry.LeadgenTenantID(r.Context(), pool, code)
}

func publicListPublished(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := publicTenantID(r, pool, cfg)
		if !ok {
			response.OKList(w, []Page{}, 1, 25, 0)
			return
		}
		p := httputil.ParseListParams(r, "published_at", map[string]string{
			"title": "p.title", "slug": "p.slug", "topic": "p.topic",
			"published_at": "p.published_at", "updated_at": "p.updated_at",
		})
		where := "p.tenant_id = $1 and p.deleted_at is null and p.status = 'published'"
		args := []any{tenantID}
		n := 2
		topic := normalizeSlug(r.URL.Query().Get("topic"))
		if topic != "" {
			if !validSlug(topic) {
				response.Validation(w, map[string]string{"topic": "Use lowercase letters, numbers, and hyphens."})
				return
			}
			where += fmt.Sprintf(" and p.topic = $%d", n)
			args = append(args, topic)
			n++
		}
		if p.Q != "" {
			where += fmt.Sprintf(" and (p.title ilike $%d or p.slug ilike $%d or p.topic ilike $%d)", n, n, n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		q := fmt.Sprintf(`
			select p.id, p.title, p.topic, p.slug, p.status, p.seo_title, p.seo_description, p.featured_media_id,
			  p.published_at::text, p.created_at::text, p.updated_at::text, count(*) over()
			from public.cms_pages p
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, httputil.Offset(p))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list pages.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Page
		var total int64
		for rows.Next() {
			var row Page
			if err := rows.Scan(
				&row.ID, &row.Title, &row.Topic, &row.Slug, &row.Status, &row.SEOTitle, &row.SEODescription, &row.FeaturedMediaID,
				&row.PublishedAt, &row.CreatedAt, &row.UpdatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pages.", "ERR_INTERNAL")
				return
			}
			row.Permalink = articlePermalink(row.Topic, row.Slug)
			out = append(out, row)
		}
		if out == nil {
			out = []Page{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func publicGetBySlug(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := publicTenantID(r, pool, cfg)
		if !ok {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		slug := normalizeSlug(chi.URLParam(r, "slug"))
		if !validSlug(slug) {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		row, err := loadPageBySlug(r.Context(), pool, tenantID, slug)
		if err == nil && row.Status == "published" {
			response.OK(w, slugResolve{Page: &row}, "OK")
			return
		}
		to, rok := lookupRedirect(r.Context(), pool, tenantID, slug)
		if rok {
			dest, derr := loadPageBySlug(r.Context(), pool, tenantID, to)
			if derr == nil && dest.Status == "published" {
				response.OK(w, slugResolve{RedirectTo: articlePermalink(dest.Topic, dest.Slug)}, "OK")
				return
			}
		}
		response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
	}
}

func publicDownloadMedia(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tenantID, ok := publicTenantID(r, pool, cfg)
		if !ok {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var used int64
		token := fmt.Sprintf("cms-media:%d)", id)
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.cms_pages
			where tenant_id=$1 and deleted_at is null and status='published'
			  and (featured_media_id=$2 or position($3 in body) > 0)`,
			tenantID, id, token).Scan(&used)
		if used == 0 {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		var fileName, storagePath, mime string
		var createdAt time.Time
		var fileBytes []byte
		err = pool.QueryRow(r.Context(), `
			select file_name, storage_path, coalesce(mime_type,''), created_at, file_bytes
			from public.cms_media
			where id=$1 and tenant_id=$2 and deleted_at is null`, id, tenantID,
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
