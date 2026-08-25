package migration

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ImportProfile struct {
	ID        int64             `json:"id"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	ColumnMap map[string]string `json:"column_map"`
	UpdatedAt string            `json:"updated_at"`
}

type profileBody struct {
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	ColumnMap map[string]string `json:"column_map"`
}

type importRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type importResult struct {
	Created   int              `json:"created"`
	Updated   int              `json:"updated,omitempty"`
	Failed    int              `json:"failed"`
	RowErrors []importRowError `json:"row_errors,omitempty"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/migration", func(mr chi.Router) {
		mr.Use(auth.RequirePermission("migration.center", auth.AccessRead))
		mr.Get("/import-profiles", listProfiles(pool))
		mr.Get("/items/import-template", importTemplateHandler("items"))
		mr.Get("/partners/import-template", importTemplateHandler("partners"))
		mr.Get("/accounts/import-template", importTemplateHandler("accounts"))
		mr.Get("/opening-stock/import-template", importTemplateHandler("opening_stock"))
		mr.Get("/open-si/import-template", importTemplateHandler("open_si"))
		mr.Get("/open-ap/import-template", importTemplateHandler("open_ap"))
		mr.Get("/open-po/import-template", importTemplateHandler("open_po"))
		mr.Get("/open-quo/import-template", importTemplateHandler("open_quo"))
		mr.Get("/open-so/import-template", importTemplateHandler("open_so"))
		mr.Get("/open-pr/import-template", importTemplateHandler("open_pr"))
		mr.Get("/open-rfq/import-template", importTemplateHandler("open_rfq"))
		mr.Get("/in-transit/import-template", importTemplateHandler("in_transit"))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Put("/import-profiles", upsertProfile(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Delete("/import-profiles/{id}", deleteProfile(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/items/import-mapped", importItemsMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/items/preview-mapped", previewItemsMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/partners/import-mapped", importPartnersMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/partners/preview-mapped", previewPartnersMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/accounts/import-mapped", importAccountsMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/accounts/preview-mapped", previewAccountsMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/opening-stock/import-mapped", importOpeningStockMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/opening-stock/preview-mapped", previewOpeningStockMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-si/import-mapped", importOpenSIMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-si/preview-mapped", previewOpenSIMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-ap/import-mapped", importOpenAPMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-ap/preview-mapped", previewOpenAPMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-po/import-mapped", importOpenPOMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-po/preview-mapped", previewOpenPOMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-quo/import-mapped", importOpenQuoMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-quo/preview-mapped", previewOpenQuoMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-so/import-mapped", importOpenSOMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-so/preview-mapped", previewOpenSOMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-pr/import-mapped", importOpenPRMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-pr/preview-mapped", previewOpenPRMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-rfq/import-mapped", importOpenRFQMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/open-rfq/preview-mapped", previewOpenRFQMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/in-transit/import-mapped", importInTransitMapped(pool))
		mr.With(auth.RequirePermission("migration.center", auth.AccessWrite)).Post("/in-transit/preview-mapped", previewInTransitMapped(pool))
	})
}

func listProfiles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		q := `
			select id, kind, name, column_map, updated_at
			from public.mig_import_profiles
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if kind != "" {
			q += ` and kind = $2`
			args = append(args, kind)
		}
		q += ` order by name`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list profiles.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ImportProfile
		for rows.Next() {
			var p ImportProfile
			var raw []byte
			var updated time.Time
			if err := rows.Scan(&p.ID, &p.Kind, &p.Name, &raw, &updated); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read profiles.", "ERR_INTERNAL")
				return
			}
			_ = json.Unmarshal(raw, &p.ColumnMap)
			if p.ColumnMap == nil {
				p.ColumnMap = map[string]string{}
			}
			p.UpdatedAt = updated.UTC().Format(time.RFC3339)
			out = append(out, p)
		}
		if out == nil {
			out = []ImportProfile{}
		}
		response.OK(w, out, "OK")
	}
}

func upsertProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body profileBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		kind := strings.TrimSpace(body.Kind)
		name := strings.TrimSpace(body.Name)
		if !allowedKinds[kind] {
			response.Validation(w, map[string]string{"kind": "Unknown import kind."})
			return
		}
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		if body.ColumnMap == nil {
			body.ColumnMap = map[string]string{}
		}
		raw, _ := json.Marshal(body.ColumnMap)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.mig_import_profiles (tenant_id, kind, name, column_map)
			values ($1, $2, $3, $4::jsonb)
			on conflict (tenant_id, kind, name) do update
			  set column_map = excluded.column_map, updated_at = now()
			returning id`,
			tu.TenantID, kind, name, raw).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save profile.", "ERR_INTERNAL")
			return
		}
		response.OK(w, ImportProfile{ID: id, Kind: kind, Name: name, ColumnMap: body.ColumnMap}, "Saved.")
	}
}

func deleteProfile(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.mig_import_profiles where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete profile.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Profile not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func loadProfileColumnMap(ctx context.Context, pool *pgxpool.Pool, tenantID, profileID int64, expectKind string) (map[string]string, error) {
	var kind string
	var raw []byte
	err := pool.QueryRow(ctx, `
		select kind, column_map from public.mig_import_profiles
		where id = $1 and tenant_id = $2`, profileID, tenantID).Scan(&kind, &raw)
	if err != nil {
		return nil, err
	}
	if kind != expectKind {
		return nil, errKindMismatch
	}
	var colMap map[string]string
	_ = json.Unmarshal(raw, &colMap)
	if colMap == nil {
		colMap = map[string]string{}
	}
	return colMap, nil
}

type kindMismatchError struct{}

func (kindMismatchError) Error() string { return "kind mismatch" }

var errKindMismatch = kindMismatchError{}
