package hr

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var publicCareersSlugRE = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

var reservedPublicCareersSlugs = map[string]struct{}{
	"apply": {}, "careers": {}, "app": {}, "api": {}, "admin": {}, "signin": {}, "sign-in": {},
	"login": {}, "logout": {}, "portal": {}, "www": {}, "static": {}, "assets": {}, "health": {},
	"bluearm": {}, "platform": {}, "support": {}, "help": {}, "null": {}, "undefined": {},
}

func registerPublicLinksRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/public-links", getPublicLinks(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Put("/public-links", putPublicLinks(pool))
}

type publicLinksPayload struct {
	CompanyCode       string `json:"company_code"`
	PublicCareersSlug string `json:"public_careers_slug"`
	ApplyPath         string `json:"apply_path"`
	CareersPath       string `json:"careers_path"`
}

func publicPathSegment(companyCode, slug string) string {
	if s := strings.TrimSpace(slug); s != "" {
		return s
	}
	return strings.TrimSpace(companyCode)
}

func getPublicLinks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || tu.TenantID <= 0 {
			response.Err(w, http.StatusUnauthorized, "Sign in required.", "ERR_UNAUTHORIZED")
			return
		}
		row, err := loadPublicLinks(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load public links.", "ERR_INTERNAL")
			return
		}
		response.OK(w, row, "OK")
	}
}

func putPublicLinks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || tu.TenantID <= 0 {
			response.Err(w, http.StatusUnauthorized, "Sign in required.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			PublicCareersSlug *string `json:"public_careers_slug"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_VALIDATION")
			return
		}
		if body.PublicCareersSlug == nil {
			response.Err(w, http.StatusBadRequest, "public_careers_slug is required (use empty string to clear).", "ERR_VALIDATION")
			return
		}
		slug, err := normalizePublicCareersSlug(*body.PublicCareersSlug)
		if err != nil {
			response.Err(w, http.StatusBadRequest, err.Error(), "ERR_VALIDATION")
			return
		}
		if slug != "" {
			if err := assertPublicCareersSlugAvailable(r.Context(), pool, tu.TenantID, slug); err != nil {
				response.Err(w, http.StatusConflict, err.Error(), "ERR_CONFLICT")
				return
			}
		}
		var stored any
		if slug == "" {
			stored = nil
		} else {
			stored = slug
		}
		_, err = pool.Exec(r.Context(), `
			update public.tenants
			set public_careers_slug = $2
			where id = $1`, tu.TenantID, stored)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save public URL.", "ERR_INTERNAL")
			return
		}
		row, err := loadPublicLinks(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Saved, but failed to reload.", "ERR_INTERNAL")
			return
		}
		response.OK(w, row, "Public careers URL saved.")
	}
}

func loadPublicLinks(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (publicLinksPayload, error) {
	var companyCode, slug string
	err := pool.QueryRow(ctx, `
		select company_code,
		       coalesce(nullif(btrim(public_careers_slug), ''), '')
		from public.tenants
		where id = $1`, tenantID).Scan(&companyCode, &slug)
	if err != nil {
		return publicLinksPayload{}, err
	}
	seg := publicPathSegment(companyCode, slug)
	return publicLinksPayload{
		CompanyCode:       companyCode,
		PublicCareersSlug: slug,
		ApplyPath:         "/apply/" + seg,
		CareersPath:       "/careers/" + seg,
	}, nil
}

func normalizePublicCareersSlug(raw string) (string, error) {
	slug := strings.ToLower(strings.TrimSpace(raw))
	slug = strings.ReplaceAll(slug, "_", "-")
	slug = strings.Trim(slug, "-")
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}
	if slug == "" {
		return "", nil
	}
	if len(slug) < 2 || len(slug) > 80 {
		return "", errors.New("Public URL must be 2–80 characters.")
	}
	if !publicCareersSlugRE.MatchString(slug) {
		return "", errors.New("Use lowercase letters, numbers, and hyphens only (e.g. jf-hardware).")
	}
	if _, reserved := reservedPublicCareersSlugs[slug]; reserved {
		return "", errors.New("That public URL is reserved. Pick another name.")
	}
	return slug, nil
}

func assertPublicCareersSlugAvailable(ctx context.Context, pool *pgxpool.Pool, tenantID int64, slug string) error {
	var taken bool
	err := pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.tenants
		  where id <> $1
		    and (
		      lower(company_code) = lower($2)
		      or lower(coalesce(nullif(btrim(public_careers_slug), ''), '')) = lower($2)
		    )
		)`, tenantID, slug).Scan(&taken)
	if err != nil {
		return errors.New("Could not check public URL availability.")
	}
	if taken {
		return errors.New("That public URL is already in use.")
	}
	return nil
}

// tenantByPublicCode resolves an active tenant by company_code or public_careers_slug.
func tenantByPublicCode(ctx context.Context, pool *pgxpool.Pool, code string) (int64, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return 0, pgx.ErrNoRows
	}
	var id int64
	err := pool.QueryRow(ctx, `
		select id from public.tenants
		where status = 'active'
		  and (
		    lower(company_code) = lower($1)
		    or lower(coalesce(nullif(btrim(public_careers_slug), ''), '')) = lower($1)
		  )
		order by
		  case when lower(coalesce(nullif(btrim(public_careers_slug), ''), '')) = lower($1) then 0 else 1 end,
		  id asc
		limit 1`, code).Scan(&id)
	return id, err
}
