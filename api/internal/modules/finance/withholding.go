package finance

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

type WithholdingTaxCode struct {
	ID          int64   `json:"id"`
	Code        string  `json:"code"`
	Description string  `json:"description"`
	RatePct     float64 `json:"rate_pct"`
	Active      bool    `json:"active"`
}

type withholdingCodeBody struct {
	Code        string  `json:"code"`
	Description string  `json:"description"`
	RatePct     float64 `json:"rate_pct"`
	Active      *bool   `json:"active"`
}

func registerWithholdingRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.withholding_read", auth.AccessRead)).Get("/withholding-codes", listWithholdingCodes(pool))
	r.With(auth.RequirePermission("finance.withholding_write", auth.AccessWrite)).Post("/withholding-codes", createWithholdingCode(pool))
}

func listWithholdingCodes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, description, rate_pct::float8, active
			from public.fin_withholding_tax_codes
			where tenant_id = $1
			order by code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list withholding codes.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []WithholdingTaxCode
		for rows.Next() {
			var row WithholdingTaxCode
			if err := rows.Scan(&row.ID, &row.Code, &row.Description, &row.RatePct, &row.Active); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read withholding codes.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []WithholdingTaxCode{}
		}
		response.OK(w, out, "OK")
	}
}

func createWithholdingCode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body withholdingCodeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		desc := strings.TrimSpace(body.Description)
		if code == "" || desc == "" {
			response.Validation(w, map[string]string{"code": "Code and description are required."})
			return
		}
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_withholding_tax_codes (tenant_id, code, description, rate_pct, active)
			values ($1, $2, $3, $4, $5)
			returning id`,
			tu.TenantID, code, desc, body.RatePct, active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create withholding code.", "ERR_INTERNAL")
			return
		}
		row := WithholdingTaxCode{ID: id, Code: code, Description: desc, RatePct: body.RatePct, Active: active}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.withholding.create", "fin_withholding_tax_code", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}
