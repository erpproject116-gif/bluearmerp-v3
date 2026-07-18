package hr

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ImportProfile struct {
	ID        int64             `json:"id"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	ColumnMap map[string]string `json:"column_map"`
	CreatedAt string            `json:"created_at,omitempty"`
	UpdatedAt string            `json:"updated_at,omitempty"`
}

var errImportProfileKindMismatch = errors.New("import profile kind does not match")

func registerImportProfileRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.employees", auth.AccessRead)).Get("/import-profiles", listImportProfiles(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Put("/import-profiles", upsertImportProfile(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Delete("/import-profiles/{id}", deleteImportProfile(pool))
}

func listImportProfiles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		kind := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("kind")))
		if kind != "" && kind != "employees" && kind != "dtr" {
			response.Validation(w, map[string]string{"kind": "kind must be employees or dtr."})
			return
		}
		q := `
			select id, kind, name, column_map, created_at::text, updated_at::text
			from public.hr_import_profiles
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if kind != "" {
			q += ` and kind = $2`
			args = append(args, kind)
		}
		q += ` order by kind, name`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list import profiles.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ImportProfile
		for rows.Next() {
			row, err := scanImportProfile(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read import profile.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ImportProfile{}
		}
		response.OK(w, out, "OK")
	}
}

func upsertImportProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			Kind      string            `json:"kind"`
			Name      string            `json:"name"`
			ColumnMap map[string]string `json:"column_map"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		kind := strings.TrimSpace(strings.ToLower(body.Kind))
		if kind != "employees" && kind != "dtr" {
			response.Validation(w, map[string]string{"kind": "kind must be employees or dtr."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		if len(name) > 120 {
			response.Validation(w, map[string]string{"name": "Name is too long."})
			return
		}
		colMap := body.ColumnMap
		if colMap == nil {
			colMap = map[string]string{}
		}
		mapJSON, err := json.Marshal(colMap)
		if err != nil {
			response.Validation(w, map[string]string{"column_map": "Invalid column_map."})
			return
		}
		row, scanErr := scanImportProfile(pool.QueryRow(r.Context(), `
			insert into public.hr_import_profiles (tenant_id, kind, name, column_map)
			values ($1,$2,$3,$4::jsonb)
			on conflict (tenant_id, kind, name) do update set
			  column_map = excluded.column_map,
			  updated_at = now()
			returning id, kind, name, column_map, created_at::text, updated_at::text`,
			tu.TenantID, kind, name, mapJSON,
		))
		if scanErr != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save import profile.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.import_profile.upsert", "hr_import_profile", &row.ID, nil, body)
		response.OK(w, row, "Import profile saved.")
	}
}

func deleteImportProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.hr_import_profiles where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Import profile not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

type scannable interface {
	Scan(dest ...any) error
}

func scanImportProfile(row scannable) (ImportProfile, error) {
	var p ImportProfile
	var raw []byte
	if err := row.Scan(&p.ID, &p.Kind, &p.Name, &raw, &p.CreatedAt, &p.UpdatedAt); err != nil {
		return p, err
	}
	p.ColumnMap = map[string]string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &p.ColumnMap)
	}
	return p, nil
}

func loadImportProfileColumnMap(ctx context.Context, pool *pgxpool.Pool, tenantID, profileID int64, expectKind string) (map[string]string, error) {
	var kind string
	var raw []byte
	err := pool.QueryRow(ctx, `
		select kind, column_map from public.hr_import_profiles
		where id=$1 and tenant_id=$2`, profileID, tenantID).Scan(&kind, &raw)
	if err != nil {
		return nil, err
	}
	if expectKind != "" && kind != expectKind {
		return nil, errImportProfileKindMismatch
	}
	out := map[string]string{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &out)
	}
	return out, nil
}
