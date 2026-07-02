package datacenter

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type IngestionRule struct {
	ID           int64           `json:"id"`
	Name         string          `json:"name"`
	TargetEntity string          `json:"target_entity"`
	MatchFields  json.RawMessage `json:"match_fields"`
	Active       bool            `json:"active"`
	UpdatedAt    string          `json:"updated_at"`
}

type ingestionRuleBody struct {
	Name         string          `json:"name"`
	TargetEntity string          `json:"target_entity"`
	MatchFields  json.RawMessage `json:"match_fields"`
	Active       *bool           `json:"active"`
}

func listIngestionRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, target_entity, match_fields, active, updated_at
			from public.ingestion_rules
			where tenant_id = $1
			order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list ingestion rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []IngestionRule
		for rows.Next() {
			var row IngestionRule
			var updatedAt time.Time
			if err := rows.Scan(&row.ID, &row.Name, &row.TargetEntity, &row.MatchFields, &row.Active, &updatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read ingestion rules.", "ERR_INTERNAL")
				return
			}
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []IngestionRule{}
		}
		response.OK(w, out, "OK")
	}
}

func getIngestionRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row IngestionRule
		var updatedAt time.Time
		err = pool.QueryRow(r.Context(), `
			select id, name, target_entity, match_fields, active, updated_at
			from public.ingestion_rules
			where id = $1 and tenant_id = $2`, id, tu.TenantID,
		).Scan(&row.ID, &row.Name, &row.TargetEntity, &row.MatchFields, &row.Active, &updatedAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		row.UpdatedAt = updatedAt.Format(time.RFC3339)
		response.OK(w, row, "OK")
	}
}

func createIngestionRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ingestionRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		target := strings.TrimSpace(body.TargetEntity)
		if name == "" || target == "" {
			response.Validation(w, map[string]string{"name": "Name and target entity are required."})
			return
		}
		matchFields := body.MatchFields
		if matchFields == nil {
			matchFields = json.RawMessage("[]")
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		var id int64
		var updatedAt time.Time
		err := pool.QueryRow(r.Context(), `
			insert into public.ingestion_rules (tenant_id, name, target_entity, match_fields, active)
			values ($1, $2, $3, $4, $5)
			returning id, updated_at`, tu.TenantID, name, target, matchFields, active,
		).Scan(&id, &updatedAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create rule.", "ERR_INTERNAL")
			return
		}
		row := IngestionRule{ID: id, Name: name, TargetEntity: target, MatchFields: matchFields, Active: active, UpdatedAt: updatedAt.Format(time.RFC3339)}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "data_center.rule.create", "ingestion_rule", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchIngestionRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body ingestionRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		matchFields := body.MatchFields
		if matchFields == nil {
			matchFields = json.RawMessage("[]")
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		tag, err := pool.Exec(r.Context(), `
			update public.ingestion_rules set
			  name = $1, target_entity = $2, match_fields = $3, active = $4, updated_at = now()
			where id = $5 and tenant_id = $6`,
			strings.TrimSpace(body.Name), strings.TrimSpace(body.TargetEntity), matchFields, active, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		getIngestionRule(pool)(w, r)
	}
}

func deleteIngestionRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.ingestion_rules where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "data_center.rule.delete", "ingestion_rule", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
