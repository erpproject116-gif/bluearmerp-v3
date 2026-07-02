package sales

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type CommissionRule struct {
	ID                int64   `json:"id"`
	Name              string  `json:"name"`
	SalespersonUserID *int64  `json:"salesperson_user_id,omitempty"`
	ItemCategoryID    *int64  `json:"item_category_id,omitempty"`
	ItemCategoryName  *string `json:"item_category_name,omitempty"`
	RatePct           float64 `json:"rate_pct"`
	Active            bool    `json:"active"`
}

type CommissionAccrual struct {
	ID                int64   `json:"id"`
	RuleID            *int64  `json:"rule_id,omitempty"`
	SalesID           int64   `json:"sales_id"`
	SalespersonUserID *int64  `json:"salesperson_user_id,omitempty"`
	BaseAmount        float64 `json:"base_amount"`
	CommissionAmount  float64 `json:"commission_amount"`
	Status            string  `json:"status"`
}

type commissionRuleBody struct {
	Name              string  `json:"name"`
	SalespersonUserID *int64  `json:"salesperson_user_id"`
	ItemCategoryID    *int64  `json:"item_category_id"`
	RatePct           float64 `json:"rate_pct"`
	Active            *bool   `json:"active"`
}

func registerCommissionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales.commission_read", auth.AccessRead)).Get("/commission-rules", listCommissionRules(pool))
	r.With(auth.RequirePermission("sales.commission_write", auth.AccessWrite)).Post("/commission-rules", createCommissionRule(pool))
	r.With(auth.RequirePermission("sales.commission_read", auth.AccessRead)).Get("/commission-accruals", listCommissionAccruals(pool))
}

func listCommissionRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select r.id, r.name, r.salesperson_user_id, r.item_category_id, c.name, r.rate_pct::float8, r.active
			from public.sa_commission_rules r
			left join public.inv_item_categories c on c.id = r.item_category_id
			where r.tenant_id = $1
			order by r.name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list commission rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CommissionRule
		for rows.Next() {
			var row CommissionRule
			if err := rows.Scan(&row.ID, &row.Name, &row.SalespersonUserID, &row.ItemCategoryID, &row.ItemCategoryName, &row.RatePct, &row.Active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read commission rules.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []CommissionRule{}
		}
		response.OK(w, out, "OK")
	}
}

func createCommissionRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body commissionRuleBody
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
			insert into public.sa_commission_rules (tenant_id, name, salesperson_user_id, item_category_id, rate_pct, active)
			values ($1, $2, $3, $4, $5, $6)
			returning id`,
			tu.TenantID, name, body.SalespersonUserID, body.ItemCategoryID, body.RatePct, active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create commission rule.", "ERR_INTERNAL")
			return
		}
		row := CommissionRule{ID: id, Name: name, SalespersonUserID: body.SalespersonUserID, ItemCategoryID: body.ItemCategoryID, RatePct: body.RatePct, Active: active}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.commission_rule.create", "sa_commission_rule", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func listCommissionAccruals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, rule_id, sales_id, salesperson_user_id, base_amount::float8, commission_amount::float8, status
			from public.sa_commission_accruals
			where tenant_id = $1
			order by id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list commission accruals.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CommissionAccrual
		for rows.Next() {
			var row CommissionAccrual
			if err := rows.Scan(&row.ID, &row.RuleID, &row.SalesID, &row.SalespersonUserID, &row.BaseAmount, &row.CommissionAmount, &row.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read commission accruals.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []CommissionAccrual{}
		}
		response.OK(w, out, "OK")
	}
}
