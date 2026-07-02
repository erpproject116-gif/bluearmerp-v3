package shipping

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ShippingRule struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Zone         *string `json:"zone,omitempty"`
	Carrier      *string `json:"carrier,omitempty"`
	MinWeight    *float64 `json:"min_weight,omitempty"`
	MaxWeight    *float64 `json:"max_weight,omitempty"`
	FreightItemID *int64  `json:"freight_item_id,omitempty"`
	FlatAmount   *float64 `json:"flat_amount,omitempty"`
	Active       bool    `json:"active"`
}

type shippingRuleBody struct {
	Name          string   `json:"name"`
	Zone          *string  `json:"zone"`
	Carrier       *string  `json:"carrier"`
	MinWeight     *float64 `json:"min_weight"`
	MaxWeight     *float64 `json:"max_weight"`
	FreightItemID *int64   `json:"freight_item_id"`
	FlatAmount    *float64 `json:"flat_amount"`
	Active        *bool    `json:"active"`
}

func registerShippingRuleRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("shipping_order.read", auth.AccessRead)).Get("/shipping-rules", listShippingRules(pool))
	r.With(auth.RequirePermission("shipping_order.write", auth.AccessWrite)).Post("/shipping-rules", createShippingRule(pool))
	r.With(auth.RequirePermission("shipping_order.write", auth.AccessWrite)).Patch("/shipping-rules/{id}", patchShippingRule(pool))
}

func listShippingRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, zone, carrier, min_weight::float8, max_weight::float8, freight_item_id, flat_amount::float8, active
			from public.sh_shipping_rules
			where tenant_id = $1
			order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list shipping rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []ShippingRule
		for rows.Next() {
			var row ShippingRule
			if err := rows.Scan(&row.ID, &row.Name, &row.Zone, &row.Carrier, &row.MinWeight, &row.MaxWeight, &row.FreightItemID, &row.FlatAmount, &row.Active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read rules.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ShippingRule{}
		}
		response.OK(w, out, "OK")
	}
}

func createShippingRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body shippingRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.sh_shipping_rules (tenant_id, name, zone, carrier, min_weight, max_weight, freight_item_id, flat_amount, active)
			values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			returning id`,
			tu.TenantID, name, body.Zone, body.Carrier, body.MinWeight, body.MaxWeight, body.FreightItemID, body.FlatAmount, active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create rule.", "ERR_INTERNAL")
			return
		}
		row := ShippingRule{ID: id, Name: name, Zone: body.Zone, Carrier: body.Carrier, MinWeight: body.MinWeight, MaxWeight: body.MaxWeight, FreightItemID: body.FreightItemID, FlatAmount: body.FlatAmount, Active: active}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.rule.create", "sh_shipping_rule", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchShippingRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body shippingRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.sh_shipping_rules set
			  name = coalesce(nullif(trim($1), ''), name),
			  zone = coalesce($2, zone),
			  carrier = coalesce($3, carrier),
			  min_weight = coalesce($4, min_weight),
			  max_weight = coalesce($5, max_weight),
			  freight_item_id = coalesce($6, freight_item_id),
			  flat_amount = coalesce($7, flat_amount),
			  active = coalesce($8, active),
			  updated_at = now()
			where id = $9 and tenant_id = $10`,
			body.Name, body.Zone, body.Carrier, body.MinWeight, body.MaxWeight, body.FreightItemID, body.FlatAmount, body.Active, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Rule not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.rule.update", "sh_shipping_rule", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

// ResolveFlatFreight returns the first matching active rule flat amount for a zone/carrier.
func ResolveFlatFreight(ctx context.Context, pool *pgxpool.Pool, tenantID int64, zone, carrier *string) (*float64, error) {
	var amount *float64
	err := pool.QueryRow(ctx, `
		select flat_amount::float8 from public.sh_shipping_rules
		where tenant_id = $1 and active = true and flat_amount is not null
		  and (zone is null or zone = coalesce($2, ''))
		  and (carrier is null or carrier = coalesce($3, ''))
		order by id limit 1`, tenantID, zone, carrier).Scan(&amount)
	if err != nil {
		return nil, nil
	}
	return amount, nil
}
