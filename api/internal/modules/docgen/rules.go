package docgen

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

type Rule struct {
	ID                      int64           `json:"id"`
	Name                    string          `json:"name"`
	Active                  bool            `json:"active"`
	SourceEntity            string          `json:"source_entity"`
	TargetEntity            string          `json:"target_entity"`
	FieldMap                json.RawMessage `json:"field_map"`
	SummarizeBy             []string        `json:"summarize_by"`
	RequireConfirmedSource  bool            `json:"require_confirmed_source"`
	UpdatedAt               string          `json:"updated_at"`
}

type ruleBody struct {
	Name                   string          `json:"name"`
	Active                 *bool           `json:"active"`
	SourceEntity           string          `json:"source_entity"`
	TargetEntity           string          `json:"target_entity"`
	FieldMap               json.RawMessage `json:"field_map"`
	SummarizeBy            []string        `json:"summarize_by"`
	RequireConfirmedSource *bool           `json:"require_confirmed_source"`
}

func listRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, active, source_entity, target_entity, field_map, summarize_by,
			  require_confirmed_source, updated_at
			from public.doc_generation_rules
			where tenant_id = $1
			order by source_entity, target_entity, name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Rule
		for rows.Next() {
			var row Rule
			var updatedAt time.Time
			if err := rows.Scan(&row.ID, &row.Name, &row.Active, &row.SourceEntity, &row.TargetEntity,
				&row.FieldMap, &row.SummarizeBy, &row.RequireConfirmedSource, &updatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read rules.", "ERR_INTERNAL")
				return
			}
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []Rule{}
		}
		response.OK(w, out, "OK")
	}
}

func createRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ruleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if strings.TrimSpace(body.Name) == "" || body.SourceEntity == "" || body.TargetEntity == "" {
			response.Validation(w, map[string]string{"name": "Name, source and target are required."})
			return
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		reqConfirmed := true
		if body.RequireConfirmedSource != nil {
			reqConfirmed = *body.RequireConfirmedSource
		}
		fieldMap := body.FieldMap
		if len(fieldMap) == 0 {
			fieldMap = json.RawMessage(`{}`)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.doc_generation_rules
			  (tenant_id, name, active, source_entity, target_entity, field_map, summarize_by, require_confirmed_source, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.Name), active, body.SourceEntity, body.TargetEntity,
			fieldMap, body.SummarizeBy, reqConfirmed, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create rule.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func patchRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body ruleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.doc_generation_rules set
			  name = coalesce(nullif($3, ''), name),
			  active = coalesce($4, active),
			  field_map = coalesce($5, field_map),
			  summarize_by = coalesce($6, summarize_by),
			  require_confirmed_source = coalesce($7, require_confirmed_source),
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, strings.TrimSpace(body.Name), body.Active, body.FieldMap, body.SummarizeBy, body.RequireConfirmedSource)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func deleteRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.doc_generation_rules where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func resolveRule(ctx context.Context, pool *pgxpool.Pool, tenantID int64, sourceEntity, targetEntity string, ruleID *int64) (Rule, error) {
	var row Rule
	var updatedAt time.Time
	var q string
	var args []any
	if ruleID != nil && *ruleID > 0 {
		q = `select id, name, active, source_entity, target_entity, field_map, summarize_by, require_confirmed_source, updated_at
			from public.doc_generation_rules where id = $1 and tenant_id = $2 and active`
		args = []any{*ruleID, tenantID}
	} else {
		q = `select id, name, active, source_entity, target_entity, field_map, summarize_by, require_confirmed_source, updated_at
			from public.doc_generation_rules
			where tenant_id = $1 and source_entity = $2 and target_entity = $3 and active
			order by id asc limit 1`
		args = []any{tenantID, sourceEntity, targetEntity}
	}
	err := pool.QueryRow(ctx, q, args...).Scan(
		&row.ID, &row.Name, &row.Active, &row.SourceEntity, &row.TargetEntity,
		&row.FieldMap, &row.SummarizeBy, &row.RequireConfirmedSource, &updatedAt)
	row.UpdatedAt = updatedAt.Format(time.RFC3339)
	return row, err
}
