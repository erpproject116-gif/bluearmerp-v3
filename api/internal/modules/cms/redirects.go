package cms

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Redirect struct {
	ID        int64  `json:"id"`
	FromSlug  string `json:"from_slug"`
	ToSlug    string `json:"to_slug"`
	CreatedAt string `json:"created_at"`
}

type redirectBody struct {
	FromSlug string `json:"from_slug"`
	ToSlug   string `json:"to_slug"`
}

func listRedirects(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{
			"from_slug": "r.from_slug", "to_slug": "r.to_slug", "created_at": "r.created_at",
		})
		rows, err := pool.Query(r.Context(), `
			select r.id, r.from_slug, r.to_slug, r.created_at::text, count(*) over()
			from public.cms_redirects r
			where r.tenant_id=$1 and r.deleted_at is null
			order by `+p.Sort+` `+orderSQL(p.Order)+`
			limit $2 offset $3`, tu.TenantID, p.PageSize, httputil.Offset(p))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list redirects.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Redirect
		var total int64
		for rows.Next() {
			var row Redirect
			if err := rows.Scan(&row.ID, &row.FromSlug, &row.ToSlug, &row.CreatedAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read redirects.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Redirect{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createRedirect(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body redirectBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		from := normalizeSlug(body.FromSlug)
		to := normalizeSlug(body.ToSlug)
		if !validSlug(from) {
			response.Validation(w, map[string]string{"from_slug": "Use lowercase letters, numbers, and hyphens."})
			return
		}
		if !validSlug(to) {
			response.Validation(w, map[string]string{"to_slug": "Use lowercase letters, numbers, and hyphens."})
			return
		}
		if from == to {
			response.Validation(w, map[string]string{"to_slug": "Must differ from the old slug."})
			return
		}
		var id int64
		var created string
		err := pool.QueryRow(r.Context(), `
			insert into public.cms_redirects (tenant_id, from_slug, to_slug)
			values ($1,$2,$3)
			returning id, created_at::text`, tu.TenantID, from, to).Scan(&id, &created)
		if err != nil {
			if isUniqueViolation(err) {
				response.Validation(w, map[string]string{"from_slug": "A redirect from that slug already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create redirect.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.redirect.create", "cms_redirect", &id, nil, map[string]any{
			"from_slug": from, "to_slug": to,
		})
		response.OK(w, Redirect{ID: id, FromSlug: from, ToSlug: to, CreatedAt: created}, "Created")
	}
}

func deleteRedirect(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.cms_redirects set deleted_at=now()
			where id=$1 and tenant_id=$2 and deleted_at is null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Redirect not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "cms.redirect.delete", "cms_redirect", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func lookupRedirect(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from string) (string, bool) {
	var to string
	err := pool.QueryRow(ctx, `
		select to_slug from public.cms_redirects
		where tenant_id=$1 and from_slug=$2 and deleted_at is null`, tenantID, from).Scan(&to)
	if err != nil || to == "" {
		return "", false
	}
	return to, true
}

func upsertRedirectTx(ctx context.Context, tx pgx.Tx, tenantID int64, from, to string) error {
	if from == to || !validSlug(from) || !validSlug(to) {
		return nil
	}
	tag, err := tx.Exec(ctx, `
		update public.cms_redirects set to_slug=$3, deleted_at=null
		where tenant_id=$1 and from_slug=$2 and deleted_at is null`, tenantID, from, to)
	if err != nil {
		return err
	}
	if tag.RowsAffected() > 0 {
		return nil
	}
	_, err = tx.Exec(ctx, `
		insert into public.cms_redirects (tenant_id, from_slug, to_slug)
		values ($1,$2,$3)`, tenantID, from, to)
	return err
}
