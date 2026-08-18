package cms

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Page struct {
	ID              int64          `json:"id"`
	Title           string         `json:"title"`
	Slug            string         `json:"slug"`
	Status          string         `json:"status"`
	Body            string         `json:"body,omitempty"`
	SEOTitle        *string        `json:"seo_title,omitempty"`
	SEODescription  *string        `json:"seo_description,omitempty"`
	FeaturedMediaID *int64         `json:"featured_media_id,omitempty"`
	PublishedAt     *string        `json:"published_at,omitempty"`
	CreatedAt       string         `json:"created_at"`
	UpdatedAt       string         `json:"updated_at"`
	CustomValues    map[string]any `json:"custom_values,omitempty"`
}

type pageCreate struct {
	Title           string         `json:"title"`
	Slug            string         `json:"slug"`
	Body            string         `json:"body"`
	SEOTitle        *string        `json:"seo_title"`
	SEODescription  *string        `json:"seo_description"`
	FeaturedMediaID *int64         `json:"featured_media_id"`
	CustomValues    map[string]any `json:"custom_values"`
}

type pagePatch struct {
	Title           *string        `json:"title"`
	Slug            *string        `json:"slug"`
	Body            *string        `json:"body"`
	SEOTitle        *string        `json:"seo_title"`
	SEODescription  *string        `json:"seo_description"`
	FeaturedMediaID *int64         `json:"featured_media_id"`
	LeaveRedirect   *bool          `json:"leave_redirect"`
	CustomValues    map[string]any `json:"custom_values"`
}

type slugResolve struct {
	RedirectTo string `json:"redirect_to,omitempty"`
	Page       *Page  `json:"page,omitempty"`
}

func listPages(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		writer := canWritePages(tu)
		p := httputil.ParseListParams(r, "updated_at", map[string]string{
			"title": "p.title", "slug": "p.slug", "status": "p.status", "updated_at": "p.updated_at", "created_at": "p.created_at",
		})
		where := "p.tenant_id = $1 and p.deleted_at is null"
		args := []any{tu.TenantID}
		n := 2
		st := strings.TrimSpace(r.URL.Query().Get("status"))
		if st != "" {
			if st == "draft" || st == "archived" {
				if !writer {
					response.OKList(w, []Page{}, p.Page, p.PageSize, 0)
					return
				}
			}
			if st != "draft" && st != "published" && st != "archived" {
				response.Validation(w, map[string]string{"status": "Invalid status."})
				return
			}
			where += fmt.Sprintf(" and p.status = $%d", n)
			args = append(args, st)
			n++
		} else if writer {
			where += " and p.status in ('draft', 'published')"
		} else {
			where += " and p.status = 'published'"
		}
		if p.Q != "" {
			where += fmt.Sprintf(" and (p.title ilike $%d or p.slug ilike $%d)", n, n)
			args = append(args, "%"+p.Q+"%")
			n++
		}
		q := fmt.Sprintf(`
			select p.id, p.title, p.slug, p.status, p.seo_title, p.seo_description, p.featured_media_id,
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
				&row.ID, &row.Title, &row.Slug, &row.Status, &row.SEOTitle, &row.SEODescription, &row.FeaturedMediaID,
				&row.PublishedAt, &row.CreatedAt, &row.UpdatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pages.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Page{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getPage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadPage(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		if row.Status != "published" && !canWritePages(tu) {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, row.ID)
		response.OK(w, row, "OK")
	}
}

func getPageBySlug(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		slug := normalizeSlug(chi.URLParam(r, "slug"))
		if !validSlug(slug) {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		writer := canWritePages(tu)
		row, err := loadPageBySlug(r.Context(), pool, tu.TenantID, slug)
		if err == nil {
			if row.Status == "published" || (writer && row.Status != "archived") {
				row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, row.ID)
				response.OK(w, slugResolve{Page: &row}, "OK")
				return
			}
		}
		to, ok := lookupRedirect(r.Context(), pool, tu.TenantID, slug)
		if ok {
			response.OK(w, slugResolve{RedirectTo: to}, "OK")
			return
		}
		response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
	}
}

func createPage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body pageCreate
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if !isPrintableTitle(title) {
			response.Validation(w, map[string]string{"title": "Required."})
			return
		}
		if len(body.Body) > maxPageBodyBytes {
			response.Validation(w, map[string]string{"body": "Body too large (max 200KB)."})
			return
		}
		slug := normalizeSlug(body.Slug)
		if slug == "" {
			slug = slugFromTitle(title)
		}
		if !validSlug(slug) {
			response.Validation(w, map[string]string{"slug": "Use lowercase letters, numbers, and hyphens."})
			return
		}
		seoTitle, seoDesc, ferr := normalizeSEO(body.SEOTitle, body.SEODescription)
		if ferr != nil {
			response.Validation(w, ferr)
			return
		}
		if err := ensureMedia(r.Context(), pool, tu.TenantID, body.FeaturedMediaID); err != nil {
			response.Validation(w, map[string]string{"featured_media_id": "Media not found."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create page.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.cms_pages (
			  tenant_id, title, slug, body, seo_title, seo_description, featured_media_id,
			  created_by_user_id, updated_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$8)
			returning id`,
			tu.TenantID, title, slug, body.Body, seoTitle, seoDesc, body.FeaturedMediaID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			if isUniqueViolation(err) {
				response.Validation(w, map[string]string{"slug": "That slug is already used."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create page.", "ERR_INTERNAL")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create page.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.create", "cms_page", &id, nil, map[string]any{
			"slug": slug, "title": title,
		})
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created")
	}
}

func patchPage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		existing, err := loadPage(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		var body pagePatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := existing.Title
		slug := existing.Slug
		docBody := existing.Body
		seoTitle := existing.SEOTitle
		seoDesc := existing.SEODescription
		feat := existing.FeaturedMediaID
		if body.Title != nil {
			title = strings.TrimSpace(*body.Title)
			if !isPrintableTitle(title) {
				response.Validation(w, map[string]string{"title": "Required."})
				return
			}
		}
		if body.Slug != nil {
			slug = normalizeSlug(*body.Slug)
			if !validSlug(slug) {
				response.Validation(w, map[string]string{"slug": "Use lowercase letters, numbers, and hyphens."})
				return
			}
		}
		if body.Body != nil {
			if len(*body.Body) > maxPageBodyBytes {
				response.Validation(w, map[string]string{"body": "Body too large (max 200KB)."})
				return
			}
			docBody = *body.Body
		}
		if body.SEOTitle != nil || body.SEODescription != nil {
			inTitle, inDesc := seoTitle, seoDesc
			if body.SEOTitle != nil {
				inTitle = body.SEOTitle
			}
			if body.SEODescription != nil {
				inDesc = body.SEODescription
			}
			t, d, ferr := normalizeSEO(inTitle, inDesc)
			if ferr != nil {
				response.Validation(w, ferr)
				return
			}
			seoTitle, seoDesc = t, d
		}
		if body.FeaturedMediaID != nil {
			if *body.FeaturedMediaID == 0 {
				feat = nil
			} else {
				feat = body.FeaturedMediaID
				if err := ensureMedia(r.Context(), pool, tu.TenantID, feat); err != nil {
					response.Validation(w, map[string]string{"featured_media_id": "Media not found."})
					return
				}
			}
		}
		leaveRedirect := true
		if body.LeaveRedirect != nil {
			leaveRedirect = *body.LeaveRedirect
		}
		oldSlug := existing.Slug
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update page.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		_, err = tx.Exec(r.Context(), `
			update public.cms_pages set
			  title=$1, slug=$2, body=$3, seo_title=$4, seo_description=$5, featured_media_id=$6,
			  updated_by_user_id=$7, updated_at=now()
			where id=$8 and tenant_id=$9 and deleted_at is null`,
			title, slug, docBody, seoTitle, seoDesc, feat, tu.AppUserID, id, tu.TenantID)
		if err != nil {
			if isUniqueViolation(err) {
				response.Validation(w, map[string]string{"slug": "That slug is already used."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to update page.", "ERR_INTERNAL")
			return
		}
		if leaveRedirect && existing.Status == "published" && oldSlug != slug {
			if err := upsertRedirectTx(r.Context(), tx, tu.TenantID, oldSlug, slug); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save redirect.", "ERR_INTERNAL")
				return
			}
		}
		if body.CustomValues != nil {
			if errs := saveCustom(r.Context(), tx, tu.TenantID, id, body.CustomValues); errs != nil {
				response.Validation(w, errs)
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update page.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.update", "cms_page", &id, nil, map[string]any{
			"slug": slug,
		})
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "OK")
	}
}

func publishPage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_pages set
			  status='published', published_at=coalesce(published_at, now()),
			  updated_by_user_id=$1, updated_at=now()
			where id=$2 and tenant_id=$3 and deleted_at is null`, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.publish", "cms_page", &id, nil, nil)
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Published")
	}
}

func archivePage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_pages set status='archived', updated_by_user_id=$1, updated_at=now()
			where id=$2 and tenant_id=$3 and deleted_at is null`, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.archive", "cms_page", &id, nil, nil)
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Archived")
	}
}

func loadPage(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Page, error) {
	var row Page
	err := pool.QueryRow(ctx, `
		select id, title, slug, status, body, seo_title, seo_description, featured_media_id,
		  published_at::text, created_at::text, updated_at::text
		from public.cms_pages
		where id=$1 and tenant_id=$2 and deleted_at is null`, id, tenantID).Scan(
		&row.ID, &row.Title, &row.Slug, &row.Status, &row.Body, &row.SEOTitle, &row.SEODescription, &row.FeaturedMediaID,
		&row.PublishedAt, &row.CreatedAt, &row.UpdatedAt,
	)
	return row, err
}

func loadPageBySlug(ctx context.Context, pool *pgxpool.Pool, tenantID int64, slug string) (Page, error) {
	var row Page
	err := pool.QueryRow(ctx, `
		select id, title, slug, status, body, seo_title, seo_description, featured_media_id,
		  published_at::text, created_at::text, updated_at::text
		from public.cms_pages
		where tenant_id=$1 and slug=$2 and deleted_at is null`, tenantID, slug).Scan(
		&row.ID, &row.Title, &row.Slug, &row.Status, &row.Body, &row.SEOTitle, &row.SEODescription, &row.FeaturedMediaID,
		&row.PublishedAt, &row.CreatedAt, &row.UpdatedAt,
	)
	return row, err
}

func ensureMedia(ctx context.Context, pool *pgxpool.Pool, tenantID int64, id *int64) error {
	if id == nil || *id == 0 {
		return nil
	}
	var ok bool
	if err := pool.QueryRow(ctx, `
		select exists(select 1 from public.cms_media where id=$1 and tenant_id=$2 and deleted_at is null)`,
		*id, tenantID).Scan(&ok); err != nil || !ok {
		return errMediaMissing
	}
	return nil
}

func normalizeSEO(title, desc *string) (*string, *string, map[string]string) {
	var t, d *string
	if title != nil {
		s := strings.TrimSpace(*title)
		if len(s) > maxSEOTitleLen {
			return nil, nil, map[string]string{"seo_title": "Too long."}
		}
		if s == "" {
			t = nil
		} else {
			t = &s
		}
	}
	if desc != nil {
		s := strings.TrimSpace(*desc)
		if len(s) > maxSEODescLen {
			return nil, nil, map[string]string{"seo_description": "Too long."}
		}
		if s == "" {
			d = nil
		} else {
			d = &s
		}
	}
	return t, d, nil
}

var errMediaMissing = fmt.Errorf("media missing")
