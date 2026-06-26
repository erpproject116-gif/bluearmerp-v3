package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type BankAccount struct {
	ID                 int64   `json:"id"`
	BankAccountCode    string  `json:"bank_account_code"`
	BankAccountName    string  `json:"bank_account_name"`
	GLAccountCode      string  `json:"gl_account_code"`
	GLAccountName      string  `json:"gl_account_name,omitempty"`
	Keyword            *string `json:"keyword,omitempty"`
	Remark             *string `json:"remark,omitempty"`
	ForeignCurrencyCode *string `json:"foreign_currency_code,omitempty"`
	IsActive           bool    `json:"is_active"`
}

type GLAccount struct {
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
}

type bankAccountBody struct {
	BankAccountCode     string  `json:"bank_account_code"`
	BankAccountName     string  `json:"bank_account_name"`
	GLAccountCode       string  `json:"gl_account_code"`
	Keyword             *string `json:"keyword"`
	Remark              *string `json:"remark"`
	ForeignCurrencyCode *string `json:"foreign_currency_code"`
}

func registerBankAccountRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/gl-accounts", listGLAccounts(pool))
	r.Get("/bank-accounts", listBankAccounts(pool))
	r.Post("/bank-accounts", createBankAccount(pool))
}

func listGLAccounts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := pool.Query(r.Context(), `
			select account_code, account_name
			from public.fin_gl_accounts
			order by sort_order, account_code`)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load GL accounts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []GLAccount
		for rows.Next() {
			var row GLAccount
			if err := rows.Scan(&row.AccountCode, &row.AccountName); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read GL accounts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []GLAccount{}
		}
		response.OK(w, out, "OK")
	}
}

func listBankAccounts(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"bank_account_code": "b.bank_account_code",
		"bank_account_name": "b.bank_account_name",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "bank_account_name", allowed)
		offset := httputil.Offset(p)
		q := strings.TrimSpace(r.URL.Query().Get("q"))

		where := "b.tenant_id = $1 and b.is_active = true"
		args := []any{tu.TenantID}
		n := 2
		if q != "" {
			where += fmt.Sprintf(" and (b.bank_account_code ilike $%d or b.bank_account_name ilike $%d or coalesce(b.keyword, '') ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}

		countQ := fmt.Sprintf(`select count(*) from public.fin_bank_accounts b where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count bank accounts.", "ERR_INTERNAL")
			return
		}

		listQ := fmt.Sprintf(`
			select b.id, b.bank_account_code, b.bank_account_name, b.gl_account_code, g.account_name,
			  b.keyword, b.remark, b.foreign_currency_code, b.is_active
			from public.fin_bank_accounts b
			join public.fin_gl_accounts g on g.account_code = b.gl_account_code
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), listQ, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load bank accounts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []BankAccount
		for rows.Next() {
			var row BankAccount
			if err := rows.Scan(
				&row.ID, &row.BankAccountCode, &row.BankAccountName, &row.GLAccountCode, &row.GLAccountName,
				&row.Keyword, &row.Remark, &row.ForeignCurrencyCode, &row.IsActive,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read bank accounts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []BankAccount{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createBankAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bankAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		errs := map[string]string{}
		code := strings.TrimSpace(body.BankAccountCode)
		name := strings.TrimSpace(body.BankAccountName)
		gl := strings.TrimSpace(body.GLAccountCode)
		if code == "" {
			errs["bank_account_code"] = "Bank account code is required."
		}
		if name == "" {
			errs["bank_account_name"] = "Bank account name is required."
		}
		if gl == "" {
			errs["gl_account_code"] = "GL account is required."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		var glName string
		if err := pool.QueryRow(r.Context(), `select account_name from public.fin_gl_accounts where account_code = $1`, gl).Scan(&glName); err != nil {
			response.Validation(w, map[string]string{"gl_account_code": "GL account not found."})
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_bank_accounts (
			  tenant_id, bank_account_code, bank_account_name, gl_account_code, keyword, remark, foreign_currency_code
			) values ($1,$2,$3,$4,$5,$6,$7)
			returning id`,
			tu.TenantID, code, name, gl, body.Keyword, body.Remark, body.ForeignCurrencyCode,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"bank_account_code": "Bank account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create bank account.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_account.create", "fin_bank_account", &id, nil, body)
		response.OK(w, BankAccount{
			ID: id, BankAccountCode: code, BankAccountName: name,
			GLAccountCode: gl, GLAccountName: glName,
			Keyword: body.Keyword, Remark: body.Remark, ForeignCurrencyCode: body.ForeignCurrencyCode, IsActive: true,
		}, "Created.")
	}
}

func lookupBankAccount(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (BankAccount, error) {
	var row BankAccount
	err := pool.QueryRow(ctx, `
		select b.id, b.bank_account_code, b.bank_account_name, b.gl_account_code, g.account_name,
		  b.keyword, b.remark, b.foreign_currency_code, b.is_active
		from public.fin_bank_accounts b
		join public.fin_gl_accounts g on g.account_code = b.gl_account_code
		where b.id = $1 and b.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.BankAccountCode, &row.BankAccountName, &row.GLAccountCode, &row.GLAccountName,
		&row.Keyword, &row.Remark, &row.ForeignCurrencyCode, &row.IsActive,
	)
	return row, err
}
