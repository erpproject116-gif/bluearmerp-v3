package quotation

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Currency struct {
	ID           int64  `json:"id"`
	CurrencyCode string `json:"currency_code"`
	Name         string `json:"name"`
	Symbol       string `json:"symbol"`
	IsDefault    bool   `json:"is_default"`
	Status       string `json:"status"`
}

type currencyBody struct {
	CurrencyCode string `json:"currency_code"`
	Name         string `json:"name"`
	Symbol       string `json:"symbol"`
	IsDefault    bool   `json:"is_default"`
	Status       string `json:"status"`
}

const defaultPesoSign = "₱"

func registerCurrencyRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/currencies", listCurrencies(pool))
	r.Post("/currencies", createCurrency(pool))
	r.Patch("/currencies/{id}", updateCurrency(pool))
	r.Delete("/currencies/{id}", deleteCurrency(pool))
}

func resolveCurrencySymbol(code, symbol string) string {
	s := strings.TrimSpace(symbol)
	if s != "" {
		return s
	}
	if strings.EqualFold(strings.TrimSpace(code), "PHP") || strings.EqualFold(strings.TrimSpace(code), "DOMESTIC") {
		return defaultPesoSign
	}
	code = strings.ToUpper(strings.TrimSpace(code))
	if code != "" {
		return code
	}
	return defaultPesoSign
}

func listCurrencies(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"currency_code": "currency_code",
		"name":          "name",
		"symbol":        "symbol",
		"is_default":    "is_default",
		"status":        "status",
		"created_at":    "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "name", allowed)
		offset := httputil.Offset(p)

		where := "tenant_id = $1 and deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (name ilike $%d or currency_code ilike $%d or coalesce(symbol,'') ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "active" || p.Status == "inactive" {
			where += fmt.Sprintf(" and status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		q := fmt.Sprintf(`
			select id, currency_code, name, coalesce(nullif(trim(symbol), ''), currency_code), is_default, status, count(*) over()
			from public.quo_currencies
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list currencies.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Currency
		var total int64
		for rows.Next() {
			var row Currency
			if err := rows.Scan(&row.ID, &row.CurrencyCode, &row.Name, &row.Symbol, &row.IsDefault, &row.Status, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read currencies.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Currency{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createCurrency(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body currencyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateCurrencyBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create currency.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		code := strings.ToUpper(strings.TrimSpace(body.CurrencyCode))
		symbol := resolveCurrencySymbol(code, body.Symbol)
		if body.IsDefault {
			if _, err := tx.Exec(r.Context(),
				`update public.quo_currencies set is_default = false, updated_at = now()
				 where tenant_id = $1 and deleted_at is null`, tu.TenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update defaults.", "ERR_INTERNAL")
				return
			}
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.quo_currencies (tenant_id, currency_code, name, symbol, is_default, status)
			values ($1,$2,$3,$4,$5,$6)
			returning id`,
			tu.TenantID, code, strings.TrimSpace(body.Name), symbol, body.IsDefault, defaultStatus(body.Status)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create currency.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save currency.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.currency.create", "quo_currency", &id, nil, body)
		row, _ := getCurrency(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func updateCurrency(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body currencyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateCurrencyBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update currency.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if body.IsDefault {
			if _, err := tx.Exec(r.Context(),
				`update public.quo_currencies set is_default = false, updated_at = now()
				 where tenant_id = $1 and deleted_at is null and id <> $2`, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update defaults.", "ERR_INTERNAL")
				return
			}
		}

		code := strings.ToUpper(strings.TrimSpace(body.CurrencyCode))
		symbol := resolveCurrencySymbol(code, body.Symbol)
		tag, err := tx.Exec(r.Context(), `
			update public.quo_currencies set
			  currency_code = $1, name = $2, symbol = $3, is_default = $4, status = $5, updated_at = now()
			where id = $6 and tenant_id = $7 and deleted_at is null`,
			code, strings.TrimSpace(body.Name), symbol, body.IsDefault, defaultStatus(body.Status), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Currency not found.", "ERR_NOT_FOUND")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save currency.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quotation.currency.update", "quo_currency", &id, nil, body)
		row, _ := getCurrency(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func deleteCurrency(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "quo_currencies", "quotation.currency.delete", "quo_currency")
	}
}

func getCurrency(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Currency, error) {
	var row Currency
	err := pool.QueryRow(ctx, `
		select id, currency_code, name, coalesce(nullif(trim(symbol), ''), currency_code), is_default, status
		from public.quo_currencies
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).
		Scan(&row.ID, &row.CurrencyCode, &row.Name, &row.Symbol, &row.IsDefault, &row.Status)
	return row, err
}

func validateCurrencyBody(b currencyBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.CurrencyCode) == "" {
		errs["currency_code"] = "Currency code is required."
	}
	if create && strings.TrimSpace(b.Name) == "" {
		errs["name"] = "Name is required."
	}
	sym := strings.TrimSpace(b.Symbol)
	if utf8.RuneCountInString(sym) > 8 {
		errs["symbol"] = "Currency sign must be at most 8 characters."
	}
	if b.Status != "" && b.Status != "active" && b.Status != "inactive" {
		errs["status"] = "Must be active or inactive."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}
