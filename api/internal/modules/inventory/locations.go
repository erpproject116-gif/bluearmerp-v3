package inventory

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

type Location struct {
	ID                int64  `json:"id"`
	LocationCode      string `json:"location_code"`
	LocationName      string `json:"location_name"`
	LocationType      string `json:"location_type"`
	ProductionProcess string `json:"production_process"`
	Status            string         `json:"status"`
	CustomValues      map[string]any `json:"custom_values,omitempty"`
}

type locationBody struct {
	LocationName      string         `json:"location_name"`
	LocationType      string         `json:"location_type"`
	ProductionProcess string         `json:"production_process"`
	Status            string         `json:"status"`
	CustomValues      map[string]any `json:"custom_values"`
}

func registerLocationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/locations/next-code", nextCodeHandler(pool, "location"))
	r.Get("/locations", listLocations(pool))
	r.Post("/locations", createLocation(pool))
	r.Post("/locations/actions/bulk-delete", bulkSoftDeleteHandler(pool, "inv_locations", "inventory.location.delete", "inv_location"))
	r.Post("/locations/actions/bulk-restore", bulkSoftRestoreHandler(pool, "inv_locations", "inventory.location.restore", "inv_location"))
	r.Patch("/locations/{id}", updateLocation(pool))
	r.Post("/locations/{id}/restore", softRestoreHandler(pool, "inv_locations", "inventory.location.restore", "inv_location"))
	r.Delete("/locations/{id}", deleteLocation(pool))
}

func listLocations(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"location_code":      "location_code",
		"location_name":      "location_name",
		"location_type":      "location_type",
		"production_process": "production_process",
		"status":             "status",
		"created_at":         "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "location_code", allowed)
		offset := httputil.Offset(p)
		lc, err := parseMasterLifecycle(r)
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		where, args := buildWhere(tu.TenantID, p, "location_name", "location_code", deletedAtPredicate(lc))
		order := orderSQL(p.Order)
		q := fmt.Sprintf(`select id, location_code, location_name, location_type, production_process, status, count(*) over() as total_count
			from public.inv_locations where %s order by %s %s limit $%d offset $%d`,
			where, p.Sort, order, len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Location
		var total int64
		for rows.Next() {
			var row Location
			if err := rows.Scan(&row.ID, &row.LocationCode, &row.LocationName, &row.LocationType, &row.ProductionProcess, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Location{}
		}
		attachListCustom(r.Context(), pool, tu.TenantID, entityLocation, out, func(l Location) int64 { return l.ID }, func(l *Location, v map[string]any) { l.CustomValues = v })
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createLocation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body locationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateLocation(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		id, row, err := createWithCode(r.Context(), pool, tu, "location", func(ctx context.Context, tx pgxpoolConn, code string) (int64, Location, error) {
			var id int64
			var row Location
			err := tx.QueryRow(ctx, `
				insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process, status)
				values ($1,$2,$3,$4,$5,$6) returning id, location_code, location_name, location_type, production_process, status`,
				tu.TenantID, code, strings.TrimSpace(body.LocationName), body.LocationType, body.ProductionProcess, defaultStatus(body.Status)).
				Scan(&id, &row.LocationCode, &row.LocationName, &row.LocationType, &row.ProductionProcess, &row.Status)
			row.ID = id
			return id, row, err
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		if errs := persistCustom(r.Context(), pool, tu.TenantID, entityLocation, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, entityLocation, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.location.create", "inv_location", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func updateLocation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body locationBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		if errs := validateLocation(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.inv_locations set location_name=$1, location_type=$2, production_process=$3, status=$4, updated_at=now()
			where id=$5 and tenant_id=$6 and deleted_at is null`,
			strings.TrimSpace(body.LocationName), body.LocationType, body.ProductionProcess, defaultStatus(body.Status), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityLocation, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.location.update", "inv_location", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "custom_values": attachCustom(r.Context(), pool, tu.TenantID, entityLocation, id)}, "Updated.")
	}
}

func deleteLocation(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_locations", "inventory.location.delete", "inv_location")
}

func validateLocation(b locationBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(b.LocationName) == "" {
		errs["location_name"] = "Location name is required."
	}
	if b.LocationType != "location" && b.LocationType != "factory" && b.LocationType != "factory_oe_manage" {
		errs["location_type"] = "Invalid location type."
	}
	if b.ProductionProcess != "bundle" && b.ProductionProcess != "service" {
		errs["production_process"] = "Must be bundle or service."
	}
	return errs
}
