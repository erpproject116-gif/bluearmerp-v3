package pos

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ModifierGroup struct {
	ID         int64      `json:"id"`
	Name       string     `json:"name"`
	Scope      string     `json:"scope"`
	ItemID     *int64     `json:"item_id,omitempty"`
	CategoryID *int64     `json:"category_id,omitempty"`
	MinSelect  int        `json:"min_select"`
	MaxSelect  int        `json:"max_select"`
	Required   bool       `json:"required"`
	SortOrder  int        `json:"sort_order"`
	Active     bool       `json:"active"`
	Modifiers  []Modifier `json:"modifiers"`
}

type Modifier struct {
	ID         int64   `json:"id"`
	GroupID    int64   `json:"group_id"`
	Name       string  `json:"name"`
	PriceDelta float64 `json:"price_delta"`
	SortOrder  int     `json:"sort_order"`
	Active     bool    `json:"active"`
}

type modifierGroupBody struct {
	Name       string `json:"name"`
	Scope      string `json:"scope"`
	ItemID     *int64 `json:"item_id"`
	CategoryID *int64 `json:"category_id"`
	MinSelect  *int   `json:"min_select"`
	MaxSelect  *int   `json:"max_select"`
	Required   *bool  `json:"required"`
	SortOrder  *int   `json:"sort_order"`
	Active     *bool  `json:"active"`
}

type modifierBody struct {
	Name       string   `json:"name"`
	PriceDelta *float64 `json:"price_delta"`
	SortOrder  *int     `json:"sort_order"`
	Active     *bool    `json:"active"`
}

func registerModifierRoutes(r chi.Router, pool *pgxpool.Pool) {
	// Terminal read: modifiers applicable to a specific item.
	r.Get("/catalog/items/{id}/modifiers", listItemModifiers(pool))

	// Management (pos.manage).
	r.With(auth.RequirePermission("pos.manage", auth.AccessRead)).Get("/modifier-groups", listModifierGroups(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Post("/modifier-groups", createModifierGroup(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Patch("/modifier-groups/{id}", updateModifierGroup(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Delete("/modifier-groups/{id}", deleteModifierGroup(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Post("/modifier-groups/{id}/modifiers", createModifier(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Patch("/modifiers/{id}", updateModifier(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessWrite)).Delete("/modifiers/{id}", deleteModifier(pool))
}

func attachModifiers(ctx context.Context, pool *pgxpool.Pool, groups []ModifierGroup) error {
	if len(groups) == 0 {
		return nil
	}
	ids := make([]int64, len(groups))
	idx := map[int64]int{}
	for i, g := range groups {
		ids[i] = g.ID
		idx[g.ID] = i
	}
	rows, err := pool.Query(ctx, `select id, group_id, name, price_delta::float8, sort_order, active from public.pos_modifiers where group_id = any($1) order by sort_order, id`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var m Modifier
		if err := rows.Scan(&m.ID, &m.GroupID, &m.Name, &m.PriceDelta, &m.SortOrder, &m.Active); err != nil {
			return err
		}
		if i, ok := idx[m.GroupID]; ok {
			groups[i].Modifiers = append(groups[i].Modifiers, m)
		}
	}
	return rows.Err()
}

func scanGroups(rows pgx.Rows) ([]ModifierGroup, error) {
	var out []ModifierGroup
	for rows.Next() {
		var g ModifierGroup
		g.Modifiers = []Modifier{}
		if err := rows.Scan(&g.ID, &g.Name, &g.Scope, &g.ItemID, &g.CategoryID, &g.MinSelect, &g.MaxSelect, &g.Required, &g.SortOrder, &g.Active); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	if out == nil {
		out = []ModifierGroup{}
	}
	return out, rows.Err()
}

func listItemModifiers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var categoryID *int64
		_ = pool.QueryRow(r.Context(), `select item_category_id from public.inv_items where id=$1 and tenant_id=$2 and deleted_at is null`, itemID, tu.TenantID).Scan(&categoryID)
		rows, err := pool.Query(r.Context(), `
			select id, name, scope, item_id, category_id, min_select, max_select, required, sort_order, active
			from public.pos_modifier_groups
			where tenant_id = $1 and active = true
			  and ((scope = 'item' and item_id = $2)
			    or (scope = 'category' and category_id is not distinct from $3))
			order by sort_order, id`, tu.TenantID, itemID, categoryID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load modifiers.", "ERR_INTERNAL")
			return
		}
		groups, err := scanGroups(rows)
		rows.Close()
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read modifiers.", "ERR_INTERNAL")
			return
		}
		if err := attachModifiers(r.Context(), pool, groups); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load options.", "ERR_INTERNAL")
			return
		}
		// Only expose groups that actually have options.
		filtered := make([]ModifierGroup, 0, len(groups))
		for _, g := range groups {
			if len(g.Modifiers) > 0 {
				filtered = append(filtered, g)
			}
		}
		response.OK(w, filtered, "OK")
	}
}

func listModifierGroups(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, scope, item_id, category_id, min_select, max_select, required, sort_order, active
			from public.pos_modifier_groups where tenant_id = $1 order by sort_order, id`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load groups.", "ERR_INTERNAL")
			return
		}
		groups, err := scanGroups(rows)
		rows.Close()
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read groups.", "ERR_INTERNAL")
			return
		}
		if err := attachModifiers(r.Context(), pool, groups); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load options.", "ERR_INTERNAL")
			return
		}
		response.OK(w, groups, "OK")
	}
}

func createModifierGroup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body modifierGroupBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		scope := body.Scope
		if scope != "item" && scope != "category" {
			scope = "item"
		}
		var id int64
		if err := pool.QueryRow(r.Context(), `
			insert into public.pos_modifier_groups (tenant_id, name, scope, item_id, category_id, min_select, max_select, required, sort_order, active)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
			tu.TenantID, body.Name, scope, body.ItemID, body.CategoryID,
			intOr(body.MinSelect, 0), intOr(body.MaxSelect, 1), boolOr(body.Required, false), intOr(body.SortOrder, 0), boolOr(body.Active, true)).Scan(&id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create group.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier_group.create", "pos_modifier_group", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func updateModifierGroup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body modifierGroupBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		scope := body.Scope
		if scope != "item" && scope != "category" {
			scope = "item"
		}
		tag, err := pool.Exec(r.Context(), `
			update public.pos_modifier_groups
			set name=$1, scope=$2, item_id=$3, category_id=$4, min_select=$5, max_select=$6, required=$7, sort_order=$8, active=$9, updated_at=now()
			where id=$10 and tenant_id=$11`,
			body.Name, scope, body.ItemID, body.CategoryID, intOr(body.MinSelect, 0), intOr(body.MaxSelect, 1), boolOr(body.Required, false), intOr(body.SortOrder, 0), boolOr(body.Active, true), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Group not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier_group.update", "pos_modifier_group", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func deleteModifierGroup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.pos_modifier_groups where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Group not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier_group.delete", "pos_modifier_group", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func createModifier(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		groupID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists bool
		_ = pool.QueryRow(r.Context(), `select exists(select 1 from public.pos_modifier_groups where id=$1 and tenant_id=$2)`, groupID, tu.TenantID).Scan(&exists)
		if !exists {
			response.Err(w, http.StatusNotFound, "Group not found.", "ERR_NOT_FOUND")
			return
		}
		var body modifierBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		var id int64
		if err := pool.QueryRow(r.Context(), `
			insert into public.pos_modifiers (group_id, name, price_delta, sort_order, active)
			values ($1,$2,$3,$4,$5) returning id`,
			groupID, body.Name, floatOr(body.PriceDelta, 0), intOr(body.SortOrder, 0), boolOr(body.Active, true)).Scan(&id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create option.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier.create", "pos_modifier", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Created.")
	}
}

func updateModifier(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body modifierBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.pos_modifiers m set name=$1, price_delta=$2, sort_order=$3, active=$4, updated_at=now()
			from public.pos_modifier_groups g
			where m.id=$5 and m.group_id=g.id and g.tenant_id=$6`,
			body.Name, floatOr(body.PriceDelta, 0), intOr(body.SortOrder, 0), boolOr(body.Active, true), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Option not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier.update", "pos_modifier", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func deleteModifier(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.pos_modifiers m using public.pos_modifier_groups g
			where m.id=$1 and m.group_id=g.id and g.tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Option not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.modifier.delete", "pos_modifier", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func intOr(p *int, def int) int {
	if p != nil {
		return *p
	}
	return def
}

func boolOr(p *bool, def bool) bool {
	if p != nil {
		return *p
	}
	return def
}

func floatOr(p *float64, def float64) float64 {
	if p != nil {
		return *p
	}
	return def
}
