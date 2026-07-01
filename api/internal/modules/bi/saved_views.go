package bi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SavedView struct {
	ID        int64           `json:"id"`
	Name      string          `json:"name"`
	ReportKey string          `json:"report_key"`
	ReportLabel string        `json:"report_label,omitempty"`
	Filters   json.RawMessage `json:"filters"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

type savedViewBody struct {
	Name      string          `json:"name"`
	ReportKey string          `json:"report_key"`
	Filters   json.RawMessage `json:"filters"`
}

type savedViewPatch struct {
	Name    *string          `json:"name"`
	Filters *json.RawMessage `json:"filters"`
}

func listSavedViews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "name", map[string]string{"name": "v.name", "report_key": "v.report_key"})
		offset := httputil.Offset(p)
		where := "v.tenant_id = $1 and v.user_id = $2"
		args := []any{tu.TenantID, tu.AppUserID}
		n := 3
		if rk := strings.TrimSpace(r.URL.Query().Get("report_key")); rk != "" {
			where += fmt.Sprintf(" and v.report_key = $%d", n)
			args = append(args, rk)
			n++
		}
		q := fmt.Sprintf(`
			select v.id, v.name, v.report_key, v.filters, v.created_at::text, v.updated_at::text,
			  count(*) over()
			from public.bi_saved_views v
			where %s
			order by v.updated_at desc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list saved views.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SavedView
		var total int64
		for rows.Next() {
			var row SavedView
			if err := rows.Scan(&row.ID, &row.Name, &row.ReportKey, &row.Filters, &row.CreatedAt, &row.UpdatedAt, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read saved views.", "ERR_INTERNAL")
				return
			}
			if def, ok := reports.FindByKey(row.ReportKey); ok {
				row.ReportLabel = def.Label
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getSavedView(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid id.", "ERR_BAD_REQUEST")
			return
		}
		row, err := loadSavedView(r, pool, tu.TenantID, tu.AppUserID, id)
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusNotFound, "Saved view not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load saved view.", "ERR_INTERNAL")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createSavedView(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body savedViewBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		name := strings.TrimSpace(body.Name)
		reportKey := strings.TrimSpace(body.ReportKey)
		errs := map[string]string{}
		if name == "" {
			errs["name"] = "Name is required."
		}
		if reportKey == "" {
			errs["report_key"] = "Report key is required."
		} else if _, ok := reports.FindByKey(reportKey); !ok {
			errs["report_key"] = "Unknown report key."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		filters := body.Filters
		if len(filters) == 0 {
			filters = json.RawMessage(`{}`)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.bi_saved_views (tenant_id, user_id, name, report_key, filters)
			values ($1, $2, $3, $4, $5)
			returning id`,
			tu.TenantID, tu.AppUserID, name, reportKey, filters).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create saved view.", "ERR_INTERNAL")
			return
		}
		row, err := loadSavedView(r, pool, tu.TenantID, tu.AppUserID, id)
		if err != nil {
			response.OK(w, map[string]int64{"id": id}, "Created.")
			return
		}
		response.OK(w, row, "Created.")
	}
}

func patchSavedView(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid id.", "ERR_BAD_REQUEST")
			return
		}
		var body savedViewPatch
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON body.", "ERR_BAD_REQUEST")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.bi_saved_views set
			  name = coalesce($4, name),
			  filters = coalesce($5, filters),
			  updated_at = now()
			where id = $1 and tenant_id = $2 and user_id = $3`,
			id, tu.TenantID, tu.AppUserID, body.Name, body.Filters)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update saved view.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Saved view not found.", "ERR_NOT_FOUND")
			return
		}
		row, err := loadSavedView(r, pool, tu.TenantID, tu.AppUserID, id)
		if err != nil {
			response.OK(w, nil, "Updated.")
			return
		}
		response.OK(w, row, "Updated.")
	}
}

func deleteSavedView(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid id.", "ERR_BAD_REQUEST")
			return
		}
		tag, err := pool.Exec(r.Context(),
			`delete from public.bi_saved_views where id = $1 and tenant_id = $2 and user_id = $3`,
			id, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete saved view.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Saved view not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Deleted.")
	}
}

func loadSavedView(r *http.Request, pool *pgxpool.Pool, tenantID, userID, id int64) (SavedView, error) {
	var row SavedView
	err := pool.QueryRow(r.Context(), `
		select id, name, report_key, filters, created_at::text, updated_at::text
		from public.bi_saved_views
		where id = $1 and tenant_id = $2 and user_id = $3`,
		id, tenantID, userID).Scan(&row.ID, &row.Name, &row.ReportKey, &row.Filters, &row.CreatedAt, &row.UpdatedAt)
	if err != nil {
		return row, err
	}
	if def, ok := reports.FindByKey(row.ReportKey); ok {
		row.ReportLabel = def.Label
	}
	return row, nil
}

func parseID(s string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(s), 10, 64)
	if err != nil || id <= 0 {
		return 0, fmt.Errorf("invalid id")
	}
	return id, nil
}
