package finance

import (
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

type WithholdingTaxCode struct {
	ID                int64    `json:"id"`
	Code              string   `json:"code"`
	Description       string   `json:"description"`
	RatePct           float64  `json:"rate_pct"`
	Active            bool     `json:"active"`
	ATCCode           *string  `json:"atc_code,omitempty"`
	TaxType           *string  `json:"tax_type,omitempty"`
	IncomePaymentType *string  `json:"income_payment_type,omitempty"`
	RRReference       *string  `json:"rr_reference,omitempty"`
	EffectiveFrom     *string  `json:"effective_from,omitempty"`
	EffectiveTo       *string  `json:"effective_to,omitempty"`
}

type withholdingCodeBody struct {
	Code              string   `json:"code"`
	Description       string   `json:"description"`
	RatePct           float64  `json:"rate_pct"`
	Active            *bool    `json:"active"`
	ATCCode           *string  `json:"atc_code"`
	TaxType           *string  `json:"tax_type"`
	IncomePaymentType *string  `json:"income_payment_type"`
	RRReference       *string  `json:"rr_reference"`
	EffectiveFrom     *string  `json:"effective_from"`
	EffectiveTo       *string  `json:"effective_to"`
}

func registerWithholdingRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.withholding_read", auth.AccessRead)).Get("/withholding-codes", listWithholdingCodes(pool))
	r.With(auth.RequirePermission("finance.withholding_write", auth.AccessWrite)).Post("/withholding-codes", createWithholdingCode(pool))
	r.With(auth.RequirePermission("finance.withholding_write", auth.AccessWrite)).Patch("/withholding-codes/{id}", patchWithholdingCode(pool))
	r.With(auth.RequirePermission("finance.withholding_write", auth.AccessWrite)).Delete("/withholding-codes/{id}", deactivateWithholdingCode(pool))
}

const withholdingCodeSelect = `
	select id, code, description, rate_pct::float8, active,
	  atc_code, tax_type, income_payment_type, rr_reference,
	  effective_from::text, effective_to::text
	from public.fin_withholding_tax_codes`

func scanWithholdingCode(row interface {
	Scan(dest ...any) error
}) (WithholdingTaxCode, error) {
	var out WithholdingTaxCode
	err := row.Scan(
		&out.ID, &out.Code, &out.Description, &out.RatePct, &out.Active,
		&out.ATCCode, &out.TaxType, &out.IncomePaymentType, &out.RRReference,
		&out.EffectiveFrom, &out.EffectiveTo,
	)
	return out, err
}

func listWithholdingCodes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), withholdingCodeSelect+`
			where tenant_id = $1
			order by coalesce(atc_code, code), code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list withholding codes.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []WithholdingTaxCode
		for rows.Next() {
			row, err := scanWithholdingCode(rows)
			if err != nil {
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

func validateWithholdingBody(body withholdingCodeBody) map[string]string {
	errs := map[string]string{}
	code := strings.TrimSpace(body.Code)
	desc := strings.TrimSpace(body.Description)
	if code == "" {
		errs["code"] = "Code is required."
	}
	if desc == "" {
		errs["description"] = "Description is required."
	}
	if body.TaxType != nil {
		t := strings.ToUpper(strings.TrimSpace(*body.TaxType))
		if t != "EWT" && t != "FWT" && t != "COMPENSATION" {
			errs["tax_type"] = "Must be EWT, FWT, or compensation."
		}
	}
	return errs
}

func normalizeTaxType(raw *string) *string {
	if raw == nil {
		return nil
	}
	t := strings.TrimSpace(*raw)
	if t == "" {
		return nil
	}
	t = strings.ToUpper(t)
	if t == "COMPENSATION" {
		t = "compensation"
	}
	return &t
}

func createWithholdingCode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body withholdingCodeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateWithholdingBody(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		code := strings.TrimSpace(body.Code)
		desc := strings.TrimSpace(body.Description)
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		taxType := normalizeTaxType(body.TaxType)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_withholding_tax_codes (
			  tenant_id, code, description, rate_pct, active,
			  atc_code, tax_type, income_payment_type, rr_reference, effective_from, effective_to
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11::date)
			returning id`,
			tu.TenantID, code, desc, body.RatePct, active,
			nullableTrim(body.ATCCode), taxType, nullableTrim(body.IncomePaymentType),
			nullableTrim(body.RRReference), nullableDate(body.EffectiveFrom), nullableDate(body.EffectiveTo),
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create withholding code.", "ERR_INTERNAL")
			return
		}
		row, _ := scanWithholdingCode(pool.QueryRow(r.Context(), withholdingCodeSelect+` where id = $1`, id))
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.withholding.create", "fin_withholding_tax_code", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchWithholdingCode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body withholdingCodeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateWithholdingBody(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		code := strings.TrimSpace(body.Code)
		desc := strings.TrimSpace(body.Description)
		active := true
		if body.Active != nil {
			active = *body.Active
		}
		taxType := normalizeTaxType(body.TaxType)
		tag, err := pool.Exec(r.Context(), `
			update public.fin_withholding_tax_codes set
			  code = $3, description = $4, rate_pct = $5, active = $6,
			  atc_code = $7, tax_type = $8, income_payment_type = $9,
			  rr_reference = $10, effective_from = $11::date, effective_to = $12::date
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, code, desc, body.RatePct, active,
			nullableTrim(body.ATCCode), taxType, nullableTrim(body.IncomePaymentType),
			nullableTrim(body.RRReference), nullableDate(body.EffectiveFrom), nullableDate(body.EffectiveTo),
		)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := scanWithholdingCode(pool.QueryRow(r.Context(), withholdingCodeSelect+` where id = $1`, id))
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.withholding.update", "fin_withholding_tax_code", &id, nil, body)
		response.OK(w, row, "Updated.")
	}
}

func deactivateWithholdingCode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_withholding_tax_codes set active = false
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.withholding.deactivate", "fin_withholding_tax_code", &id, nil, nil)
		response.OK(w, nil, "Deactivated.")
	}
}

func nullableTrim(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

func nullableDate(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}
