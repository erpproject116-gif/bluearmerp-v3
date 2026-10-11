package services

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func getSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := ensureFoundation(r.Context(), tx, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to prepare service settings.", "ERR_INTERNAL")
			return
		}
		var mode, prefix string
		if err := tx.QueryRow(r.Context(), `
			select integration_mode, number_prefix from public.svc_settings where tenant_id = $1`, tu.TenantID).
			Scan(&mode, &prefix); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"integration_mode": mode,
			"number_prefix":    prefix,
		}, "OK")
	}
}

func patchSettings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			IntegrationMode string `json:"integration_mode"`
			NumberPrefix    string `json:"number_prefix"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if body.IntegrationMode != "" && body.IntegrationMode != "A" {
			response.Validation(w, map[string]string{"integration_mode": "Only mode A is available."})
			return
		}
		prefix := strings.TrimSpace(body.NumberPrefix)
		if prefix == "" {
			prefix = "SJO"
		}
		if len(prefix) > 12 {
			response.Validation(w, map[string]string{"number_prefix": "Prefix is too long."})
			return
		}
		if _, err := pool.Exec(r.Context(), `
			insert into public.svc_settings (tenant_id, integration_mode, number_prefix)
			values ($1, 'A', $2)
			on conflict (tenant_id) do update
			set number_prefix = excluded.number_prefix, integration_mode = 'A', updated_at = now()`,
			tu.TenantID, prefix); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save settings.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"integration_mode": "A", "number_prefix": prefix}, "Saved.")
	}
}

func listTypes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		if !tu.HasPermission("services.jobs", auth.AccessRead) && !tu.HasPermission("services.settings", auth.AccessRead) {
			response.Err(w, http.StatusForbidden, "You do not have permission for this action.", "ERR_FORBIDDEN")
			return
		}
		if err := ensureFoundation(r.Context(), pool, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to prepare service types.", "ERR_INTERNAL")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, code, name, config, is_active
			from public.svc_service_types
			where tenant_id = $1
			order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list service types.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var code, name string
			var raw []byte
			var active bool
			if err := rows.Scan(&id, &code, &name, &raw, &active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list service types.", "ERR_INTERNAL")
				return
			}
			var cfg any
			_ = json.Unmarshal(raw, &cfg)
			out = append(out, map[string]any{"id": id, "code": code, "name": name, "config": cfg, "is_active": active})
		}
		response.OK(w, out, "OK")
	}
}

func createType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			Code   string     `json:"code"`
			Name   string     `json:"name"`
			Config TypeConfig `json:"config"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		body.Code = strings.TrimSpace(body.Code)
		body.Name = strings.TrimSpace(body.Name)
		if body.Code == "" || body.Name == "" {
			response.Validation(w, map[string]string{"name": "Code and name are required."})
			return
		}
		raw, _ := json.Marshal(body.Config)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_service_types (tenant_id, code, name, config)
			values ($1, $2, $3, $4) returning id`, tu.TenantID, body.Code, body.Name, raw).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not create that service type.", "ERR_VALIDATION")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func patchType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			Name     string     `json:"name"`
			Config   TypeConfig `json:"config"`
			IsActive *bool      `json:"is_active"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		raw, _ := json.Marshal(body.Config)
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_service_types
			set name = $3, config = $4, is_active = $5, updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, strings.TrimSpace(body.Name), raw, active)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Service type not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved. Existing jobs keep their original type snapshot.")
	}
}

func listTransitions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, from_status, to_status from public.svc_status_transitions
			where tenant_id = $1 order by from_status, to_status`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list transitions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var from, to string
			if err := rows.Scan(&id, &from, &to); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list transitions.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "from_status": from, "to_status": to})
		}
		response.OK(w, out, "OK")
	}
}

func createTransition(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			From string `json:"from_status"`
			To   string `json:"to_status"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if strings.EqualFold(body.To, "approved") || strings.EqualFold(body.From, "approved") {
			response.Validation(w, map[string]string{"to_status": "Approved is an approval state, not a workflow label."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_status_transitions (tenant_id, from_status, to_status)
			values ($1, $2, $3) returning id`, tu.TenantID, body.From, body.To).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not save that transition.", "ERR_VALIDATION")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func listChecklistTemplates(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, name, items from public.svc_checklist_templates
			where tenant_id = $1 order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list checklists.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var name string
			var items []byte
			if err := rows.Scan(&id, &name, &items); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list checklists.", "ERR_INTERNAL")
				return
			}
			var parsed any
			_ = json.Unmarshal(items, &parsed)
			out = append(out, map[string]any{"id": id, "name": name, "items": parsed})
		}
		response.OK(w, out, "OK")
	}
}

func createChecklistTemplate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			Name  string `json:"name"`
			Items []struct {
				Key   string `json:"key"`
				Label string `json:"label"`
			} `json:"items"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		raw, _ := json.Marshal(body.Items)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.svc_checklist_templates (tenant_id, name, items)
			values ($1, $2, $3) returning id`, tu.TenantID, strings.TrimSpace(body.Name), raw).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Could not save the checklist.", "ERR_VALIDATION")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}
