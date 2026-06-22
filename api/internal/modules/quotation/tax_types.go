package quotation

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

type TaxType struct {
	ID          int64          `json:"id"`
	TaxCode     string         `json:"tax_code"`
	Name        string         `json:"name"`
	TaxMode     string         `json:"tax_mode"`
	RatePercent float64        `json:"rate_percent"`
	FormulaJSON map[string]any `json:"formula_json,omitempty"`
	SortOrder   int            `json:"sort_order"`
	Status      string         `json:"status"`
}

type taxTypeBody struct {
	Name        string         `json:"name"`
	TaxMode     string         `json:"tax_mode"`
	RatePercent float64        `json:"rate_percent"`
	FormulaJSON map[string]any `json:"formula_json"`
	SortOrder   int            `json:"sort_order"`
	Status      string         `json:"status"`
}

type taxPreviewBody struct {
	UnitPrice  float64 `json:"unit_price"`
	Qty        float64 `json:"qty"`
	InputBasis string  `json:"input_basis"`
}

func registerTaxTypeRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/tax-types/next-code", nextTaxTypeCode(pool))
	r.Get("/tax-types", listTaxTypes(pool))
	r.Post("/tax-types", createTaxType(pool))
	r.Post("/tax-types/{id}/preview", previewTaxType(pool))
	r.Patch("/tax-types/{id}", updateTaxType(pool))
	r.Delete("/tax-types/{id}", deleteTaxType(pool))
}

func nextTaxTypeCode(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var code string
		err := pool.QueryRow(r.Context(),
			`select public.preview_next_tenant_code($1, 'tax_type')`, tu.TenantID).Scan(&code)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview code.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]string{"next_code": code}, "OK")
	}
}

func listTaxTypes(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"tax_code":     "tax_code",
		"name":         "name",
		"tax_mode":     "tax_mode",
		"rate_percent": "rate_percent",
		"sort_order":   "sort_order",
		"status":       "status",
		"created_at":   "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sort_order", allowed)
		offset := httputil.Offset(p)

		where := "tenant_id = $1 and deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (name ilike $%d or tax_code ilike $%d)", argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "active" || p.Status == "inactive" {
			where += fmt.Sprintf(" and status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		q := fmt.Sprintf(`
			select id, tax_code, name, tax_mode, rate_percent::float8, formula_json, sort_order, status,
			       count(*) over()
			from public.quo_tax_types
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list tax types.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []TaxType
		var total int64
		for rows.Next() {
			var row TaxType
			if err := rows.Scan(&row.ID, &row.TaxCode, &row.Name, &row.TaxMode, &row.RatePercent,
				&row.FormulaJSON, &row.SortOrder, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read tax types.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []TaxType{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createTaxType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body taxTypeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateTaxTypeBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create tax type.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var code string
		if err := tx.QueryRow(r.Context(),
			`select public.allocate_tenant_code($1, 'tax_type')`, tu.TenantID).Scan(&code); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate code.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.quo_tax_types
			  (tenant_id, tax_code, name, tax_mode, rate_percent, formula_json, sort_order, status)
			values ($1,$2,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, code, strings.TrimSpace(body.Name), body.TaxMode, body.RatePercent,
			body.FormulaJSON, body.SortOrder, defaultStatus(body.Status)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create tax type.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save tax type.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.tax_type.create", "quo_tax_type", &id, nil, body)
		row, _ := getTaxType(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func updateTaxType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body taxTypeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateTaxTypeBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.quo_tax_types set
			  name = $1, tax_mode = $2, rate_percent = $3, formula_json = $4,
			  sort_order = $5, status = $6, updated_at = now()
			where id = $7 and tenant_id = $8 and deleted_at is null`,
			strings.TrimSpace(body.Name), body.TaxMode, body.RatePercent, body.FormulaJSON,
			body.SortOrder, defaultStatus(body.Status), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Tax type not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.tax_type.update", "quo_tax_type", &id, nil, body)
		row, _ := getTaxType(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func deleteTaxType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "quo_tax_types", "quotation.tax_type.delete", "quo_tax_type")
	}
}

func previewTaxType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body taxPreviewBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Qty <= 0 {
			response.Validation(w, map[string]string{"qty": "Quantity must be greater than zero."})
			return
		}
		inputBasis := body.InputBasis
		if inputBasis == "" {
			inputBasis = taxcalc.InputVatIncUnit
		}
		if inputBasis != taxcalc.InputVatIncUnit && inputBasis != taxcalc.InputNonVatUnit {
			response.Validation(w, map[string]string{"input_basis": "Must be vat_inc_unit or non_vat_unit."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Tax type not found.", "ERR_NOT_FOUND")
			return
		}
		amounts := taxcalc.ComputeLine(tt, body.UnitPrice, body.Qty, inputBasis)
		response.OK(w, amounts, "OK")
	}
}

func getTaxType(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (TaxType, error) {
	var row TaxType
	err := pool.QueryRow(ctx, `
		select id, tax_code, name, tax_mode, rate_percent::float8, formula_json, sort_order, status
		from public.quo_tax_types
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).
		Scan(&row.ID, &row.TaxCode, &row.Name, &row.TaxMode, &row.RatePercent,
			&row.FormulaJSON, &row.SortOrder, &row.Status)
	return row, err
}

func loadTaxCalcType(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (taxcalc.TaxType, error) {
	var tt taxcalc.TaxType
	err := pool.QueryRow(ctx, `
		select tax_mode, rate_percent::float8
		from public.quo_tax_types
		where id = $1 and tenant_id = $2 and deleted_at is null and status = 'active'`,
		id, tenantID).Scan(&tt.TaxMode, &tt.RatePercent)
	return tt, err
}

func validateTaxTypeBody(b taxTypeBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.Name) == "" {
		errs["name"] = "Name is required."
	}
	if b.TaxMode != "" && b.TaxMode != "included" && b.TaxMode != "excluded" && b.TaxMode != "none" {
		errs["tax_mode"] = "Must be included, excluded, or none."
	}
	if create && b.TaxMode == "" {
		errs["tax_mode"] = "Tax mode is required."
	}
	if b.Status != "" && b.Status != "active" && b.Status != "inactive" {
		errs["status"] = "Must be active or inactive."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultStatus(s string) string {
	if s == "inactive" {
		return "inactive"
	}
	return "active"
}
