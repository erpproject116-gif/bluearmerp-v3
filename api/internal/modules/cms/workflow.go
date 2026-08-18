package cms

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type pageRevision struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Topic     string `json:"topic"`
	Slug      string `json:"slug"`
	CreatedAt string `json:"created_at"`
}

type topicRow struct {
	Topic string `json:"topic"`
	Count int64  `json:"count"`
}

func canPublishPages(tu auth.TenantUser) bool {
	return tu.HasPermission("cms.pages_publish", auth.AccessWrite) || tu.HasPermission("cms.pages_write", auth.AccessWrite)
}

func insertPageRevision(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, page Page) {
	_, _ = pool.Exec(ctx, `
		insert into public.cms_page_revisions
		  (tenant_id, page_id, title, topic, slug, body, seo_title, seo_description, created_by_user_id)
		values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		tenantID, page.ID, page.Title, page.Topic, page.Slug, page.Body, page.SEOTitle, page.SEODescription, userID)
}

func maybeInsertPageRevision(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, page Page) {
	var last time.Time
	err := pool.QueryRow(ctx, `
		select created_at from public.cms_page_revisions
		where tenant_id=$1 and page_id=$2
		order by created_at desc limit 1`, tenantID, page.ID).Scan(&last)
	if err == nil && time.Since(last) < 2*time.Minute {
		return
	}
	insertPageRevision(ctx, pool, tenantID, userID, page)
}

func unpublishPage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !canPublishPages(tu) {
			response.Err(w, http.StatusForbidden, "You do not have permission to unpublish.", "ERR_FORBIDDEN")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_pages set status='draft', updated_by_user_id=$1, updated_at=now()
			where id=$2 and tenant_id=$3 and deleted_at is null`, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.unpublish", "cms_page", &id, nil, nil)
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Unpublished")
	}
}

func deletePage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_pages set deleted_at=now(), updated_by_user_id=$1, updated_at=now()
			where id=$2 and tenant_id=$3 and deleted_at is null`, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.delete", "cms_page", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func clonePage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		src, err := loadPage(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		base := src.Slug
		if len(base) > 110 {
			base = strings.Trim(base[:110], "-")
		}
		slug := base + "-copy"
		for i := 2; i < 50; i++ {
			var exists bool
			_ = pool.QueryRow(r.Context(), `
				select exists(select 1 from public.cms_pages where tenant_id=$1 and slug=$2 and deleted_at is null)`,
				tu.TenantID, slug).Scan(&exists)
			if !exists {
				break
			}
			slug = fmt.Sprintf("%s-copy-%d", base, i)
		}
		var newID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.cms_pages (
			  tenant_id, title, topic, slug, body, seo_title, seo_description, featured_media_id,
			  lang, focus_phrase, visibility, created_by_user_id, updated_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'internal',$11,$11)
			returning id`,
			tu.TenantID, src.Title+" (copy)", src.Topic, slug, src.Body, src.SEOTitle, src.SEODescription,
			src.FeaturedMediaID, src.Lang, src.FocusPhrase, tu.AppUserID,
		).Scan(&newID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clone page.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.clone", "cms_page", &newID, nil, map[string]any{"from": id})
		row, _ := loadPage(r.Context(), pool, tu.TenantID, newID)
		response.OK(w, row, "Cloned")
	}
}

func listPageRevisions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, title, topic, slug, created_at::text
			from public.cms_page_revisions
			where tenant_id=$1 and page_id=$2
			order by created_at desc
			limit 50`, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list revisions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []pageRevision{}
		for rows.Next() {
			var row pageRevision
			if err := rows.Scan(&row.ID, &row.Title, &row.Topic, &row.Slug, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read revisions.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func restorePageRevision(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		rid, err2 := strconv.ParseInt(chi.URLParam(r, "rid"), 10, 64)
		if err != nil || err2 != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		existing, err := loadPage(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		var title, topic, slug, body string
		var seoTitle, seoDesc *string
		err = pool.QueryRow(r.Context(), `
			select title, topic, slug, body, seo_title, seo_description
			from public.cms_page_revisions
			where id=$1 and page_id=$2 and tenant_id=$3`, rid, id, tu.TenantID,
		).Scan(&title, &topic, &slug, &body, &seoTitle, &seoDesc)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Revision not found.", "ERR_NOT_FOUND")
			return
		}
		insertPageRevision(r.Context(), pool, tu.TenantID, tu.AppUserID, existing)
		_, err = pool.Exec(r.Context(), `
			update public.cms_pages set title=$1, topic=$2, slug=$3, body=$4, seo_title=$5, seo_description=$6,
			  status='draft', updated_by_user_id=$7, updated_at=now()
			where id=$8 and tenant_id=$9 and deleted_at is null`,
			title, topic, slug, body, seoTitle, seoDesc, tu.AppUserID, id, tu.TenantID)
		if err != nil {
			if isUniqueViolation(err) {
				response.Validation(w, map[string]string{"slug": "That slug is already used."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to restore revision.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.page.restore", "cms_page", &id, nil, map[string]any{"revision_id": rid})
		row, _ := loadPage(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Restored")
	}
}

func listTopics(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select topic, count(*)::bigint
			from public.cms_pages
			where tenant_id=$1 and deleted_at is null
			group by topic
			order by topic`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list topics.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		seen := map[string]bool{}
		out := []topicRow{}
		for rows.Next() {
			var row topicRow
			if err := rows.Scan(&row.Topic, &row.Count); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read topics.", "ERR_INTERNAL")
				return
			}
			seen[row.Topic] = true
			out = append(out, row)
		}
		for _, t := range suggestedTopics {
			if !seen[t] {
				out = append(out, topicRow{Topic: t, Count: 0})
			}
		}
		response.OK(w, out, "OK")
	}
}

var suggestedTopics = []string{
	"blog", "bodega-at-stock", "benta-at-koleksyon", "quotation-at-follow-up",
	"pagbili-at-supplier", "serial-at-warranty", "vat-at-resibo", "books-at-pagsara",
	"after-sales", "tindahan-pos", "withholding-at-2307",
}

func previewSecret() []byte {
	s := strings.TrimSpace(os.Getenv("CMS_PREVIEW_SECRET"))
	if s == "" {
		s = strings.TrimSpace(os.Getenv("SUPABASE_JWT_SECRET"))
	}
	if s == "" {
		s = "cms-preview-dev-only"
	}
	return []byte(s)
}

func signPreviewToken(pageID, tenantID int64, exp time.Time) string {
	payload := fmt.Sprintf("%d:%d:%d", tenantID, pageID, exp.Unix())
	mac := hmac.New(sha256.New, previewSecret())
	_, _ = mac.Write([]byte(payload))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + sig
}

func parsePreviewToken(raw string) (tenantID, pageID int64, ok bool) {
	parts := strings.Split(raw, ".")
	if len(parts) != 2 {
		return 0, 0, false
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return 0, 0, false
	}
	mac := hmac.New(sha256.New, previewSecret())
	_, _ = mac.Write(payload)
	want := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[1])) {
		return 0, 0, false
	}
	var exp int64
	if _, err := fmt.Sscanf(string(payload), "%d:%d:%d", &tenantID, &pageID, &exp); err != nil {
		return 0, 0, false
	}
	if time.Now().Unix() > exp {
		return 0, 0, false
	}
	return tenantID, pageID, true
}

func issuePreviewToken(pool *pgxpool.Pool) http.HandlerFunc {
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
		token := signPreviewToken(row.ID, tu.TenantID, time.Now().Add(30*time.Minute))
		response.OK(w, map[string]string{
			"token": token,
			"url":   articlePermalink(row.Topic, row.Slug) + "?preview=" + token,
		}, "OK")
	}
}

func publicPreview(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(r.URL.Query().Get("token"))
		tenantID, pageID, ok := parsePreviewToken(token)
		if !ok {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		pubID, found := publicTenantID(r, pool, cfg)
		if !found || pubID != tenantID {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		row, err := loadPage(r.Context(), pool, tenantID, pageID)
		if err != nil || row.Status == "archived" {
			response.Err(w, http.StatusNotFound, "Page not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, slugResolve{Page: &row}, "OK")
	}
}

func patchMedia(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			AltText *string `json:"alt_text"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.AltText == nil {
			response.Validation(w, map[string]string{"alt_text": "Required."})
			return
		}
		alt := strings.TrimSpace(*body.AltText)
		if len(alt) > 500 {
			alt = alt[:500]
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_media set alt_text=$1
			where id=$2 and tenant_id=$3 and deleted_at is null`, alt, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "File not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.media.update", "cms_media", &id, nil, nil)
		response.OK(w, Media{ID: id, AltText: alt}, "OK")
	}
}
