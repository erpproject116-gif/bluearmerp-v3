package finance

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
)

type BankAccount struct {
	ID                  int64   `json:"id"`
	BankAccountCode     string  `json:"bank_account_code"`
	BankAccountName     string  `json:"bank_account_name"`
	AccountType         string  `json:"account_type"`
	InstitutionName     string  `json:"institution_name"`
	AccountNumber       string  `json:"account_number"`
	GLAccountCode       string  `json:"gl_account_code"`
	GLAccountName       string  `json:"gl_account_name,omitempty"`
	Keyword             *string `json:"keyword,omitempty"`
	Remark              *string `json:"remark,omitempty"`
	ForeignCurrencyCode *string `json:"foreign_currency_code,omitempty"`
	OpeningBalance      float64 `json:"opening_balance"`
	OpeningBalanceDate  *string `json:"opening_balance_date,omitempty"`
	IsActive            bool    `json:"is_active"`
}

type GLAccount struct {
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
}

type bankAccountBody struct {
	BankAccountCode     string   `json:"bank_account_code"`
	BankAccountName     string   `json:"bank_account_name"`
	AccountType         string   `json:"account_type"`
	InstitutionName     string   `json:"institution_name"`
	AccountNumber       string   `json:"account_number"`
	GLAccountCode       string   `json:"gl_account_code"`
	Keyword             *string  `json:"keyword"`
	Remark              *string  `json:"remark"`
	ForeignCurrencyCode *string  `json:"foreign_currency_code"`
	OpeningBalance      *float64 `json:"opening_balance"`
	OpeningBalanceDate  *string  `json:"opening_balance_date"`
	IsActive            *bool    `json:"is_active"`
}

func normalizeBankAccountType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "credit_card", "credit-card", "card":
		return "credit_card"
	case "e_wallet", "ewallet", "e-wallet", "wallet":
		return "e_wallet"
	default:
		return "bank"
	}
}

func registerBankAccountRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/gl-accounts", listGLAccounts(pool))
	r.Get("/bank-accounts", listBankAccounts(pool))
	r.Post("/bank-accounts", createBankAccount(pool))
	r.Patch("/bank-accounts/{id}", updateBankAccount(pool))
	registerBankRegisterRoutes(r, pool)
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
		"account_type":      "b.account_type",
		"institution_name":  "b.institution_name",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "bank_account_name", allowed)
		offset := httputil.Offset(p)
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		accountType := normalizeBankAccountType(r.URL.Query().Get("account_type"))
		filterType := strings.TrimSpace(r.URL.Query().Get("account_type")) != ""

		where := "b.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if showInactive := strings.TrimSpace(r.URL.Query().Get("include_inactive")); showInactive != "1" && showInactive != "true" {
			where += " and b.is_active = true"
		}
		if q != "" {
			where += fmt.Sprintf(` and (
			  b.bank_account_code ilike $%d or b.bank_account_name ilike $%d
			  or coalesce(b.keyword, '') ilike $%d
			  or coalesce(b.institution_name, '') ilike $%d
			  or coalesce(b.account_number, '') ilike $%d
			)`, n, n, n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if filterType {
			where += fmt.Sprintf(" and b.account_type = $%d", n)
			args = append(args, accountType)
			n++
		}

		countQ := fmt.Sprintf(`select count(*) from public.fin_bank_accounts b where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count bank accounts.", "ERR_INTERNAL")
			return
		}

		listQ := fmt.Sprintf(`
			select b.id, b.bank_account_code, b.bank_account_name,
			  coalesce(b.account_type, 'bank'), coalesce(b.institution_name, ''), coalesce(b.account_number, ''),
			  b.gl_account_code, g.account_name,
			  b.keyword, b.remark, b.foreign_currency_code,
			  coalesce(b.opening_balance, 0)::float8, b.opening_balance_date::text,
			  b.is_active
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
				&row.ID, &row.BankAccountCode, &row.BankAccountName,
				&row.AccountType, &row.InstitutionName, &row.AccountNumber,
				&row.GLAccountCode, &row.GLAccountName,
				&row.Keyword, &row.Remark, &row.ForeignCurrencyCode,
				&row.OpeningBalance, &row.OpeningBalanceDate,
				&row.IsActive,
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
		accountType := normalizeBankAccountType(body.AccountType)
		institution := strings.TrimSpace(body.InstitutionName)
		accountNo := strings.TrimSpace(body.AccountNumber)
		if code == "" {
			errs["bank_account_code"] = "Account code is required."
		}
		if name == "" {
			errs["bank_account_name"] = "Account name is required."
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
		openingBal := 0.0
		if body.OpeningBalance != nil {
			openingBal = *body.OpeningBalance
		}
		var openingDate any
		if body.OpeningBalanceDate != nil && strings.TrimSpace(*body.OpeningBalanceDate) != "" {
			openingDate = strings.TrimSpace(*body.OpeningBalanceDate)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_bank_accounts (
			  tenant_id, bank_account_code, bank_account_name, account_type, institution_name, account_number,
			  gl_account_code, keyword, remark, foreign_currency_code, opening_balance, opening_balance_date
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			returning id`,
			tu.TenantID, code, name, accountType, institution, accountNo, gl, body.Keyword, body.Remark, body.ForeignCurrencyCode,
			openingBal, openingDate,
		).Scan(&id)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"bank_account_code": "Account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create bank account.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_account.create", "fin_bank_account", &id, nil, body)
		var openDatePtr *string
		if body.OpeningBalanceDate != nil && strings.TrimSpace(*body.OpeningBalanceDate) != "" {
			d := strings.TrimSpace(*body.OpeningBalanceDate)
			openDatePtr = &d
		}
		response.OK(w, BankAccount{
			ID: id, BankAccountCode: code, BankAccountName: name,
			AccountType: accountType, InstitutionName: institution, AccountNumber: accountNo,
			GLAccountCode: gl, GLAccountName: glName,
			Keyword: body.Keyword, Remark: body.Remark, ForeignCurrencyCode: body.ForeignCurrencyCode,
			OpeningBalance: openingBal, OpeningBalanceDate: openDatePtr, IsActive: true,
		}, "Created.")
	}
}

func updateBankAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body bankAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, err := lookupBankAccount(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Bank account not found.", "ERR_NOT_FOUND")
			return
		}
		name := strings.TrimSpace(body.BankAccountName)
		if name == "" {
			name = before.BankAccountName
		}
		gl := strings.TrimSpace(body.GLAccountCode)
		if gl == "" {
			gl = before.GLAccountCode
		}
		accountType := normalizeBankAccountType(body.AccountType)
		if strings.TrimSpace(body.AccountType) == "" {
			accountType = before.AccountType
		}
		institution := strings.TrimSpace(body.InstitutionName)
		accountNo := strings.TrimSpace(body.AccountNumber)
		active := before.IsActive
		if body.IsActive != nil {
			active = *body.IsActive
		}
		openingBal := before.OpeningBalance
		if body.OpeningBalance != nil {
			openingBal = *body.OpeningBalance
		}
		var openingDate any
		if body.OpeningBalanceDate != nil {
			if strings.TrimSpace(*body.OpeningBalanceDate) == "" {
				openingDate = nil
			} else {
				openingDate = strings.TrimSpace(*body.OpeningBalanceDate)
			}
		} else if before.OpeningBalanceDate != nil {
			openingDate = *before.OpeningBalanceDate
		}
		var glName string
		if err := pool.QueryRow(r.Context(), `select account_name from public.fin_gl_accounts where account_code = $1`, gl).Scan(&glName); err != nil {
			response.Validation(w, map[string]string{"gl_account_code": "GL account not found."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_bank_accounts set
			  bank_account_name = $3,
			  account_type = $4,
			  institution_name = $5,
			  account_number = $6,
			  gl_account_code = $7,
			  keyword = $8,
			  remark = $9,
			  foreign_currency_code = $10,
			  opening_balance = $11,
			  opening_balance_date = $12,
			  is_active = $13,
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, name, accountType, institution, accountNo, gl,
			body.Keyword, body.Remark, body.ForeignCurrencyCode, openingBal, openingDate, active)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusInternalServerError, "Failed to update bank account.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_account.update", "fin_bank_account", &id, before, body)
		var openDatePtr *string
		if openingDate != nil {
			if s, ok := openingDate.(string); ok {
				openDatePtr = &s
			}
		}
		response.OK(w, BankAccount{
			ID: id, BankAccountCode: before.BankAccountCode, BankAccountName: name,
			AccountType: accountType, InstitutionName: institution, AccountNumber: accountNo,
			GLAccountCode: gl, GLAccountName: glName,
			Keyword: body.Keyword, Remark: body.Remark, ForeignCurrencyCode: body.ForeignCurrencyCode,
			OpeningBalance: openingBal, OpeningBalanceDate: openDatePtr, IsActive: active,
		}, "Updated.")
	}
}

func lookupBankAccount(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (BankAccount, error) {
	var row BankAccount
	err := pool.QueryRow(ctx, `
		select b.id, b.bank_account_code, b.bank_account_name,
		  coalesce(b.account_type, 'bank'), coalesce(b.institution_name, ''), coalesce(b.account_number, ''),
		  b.gl_account_code, g.account_name,
		  b.keyword, b.remark, b.foreign_currency_code,
		  coalesce(b.opening_balance, 0)::float8, b.opening_balance_date::text,
		  b.is_active
		from public.fin_bank_accounts b
		join public.fin_gl_accounts g on g.account_code = b.gl_account_code
		where b.id = $1 and b.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.BankAccountCode, &row.BankAccountName,
		&row.AccountType, &row.InstitutionName, &row.AccountNumber,
		&row.GLAccountCode, &row.GLAccountName,
		&row.Keyword, &row.Remark, &row.ForeignCurrencyCode,
		&row.OpeningBalance, &row.OpeningBalanceDate,
		&row.IsActive,
	)
	return row, err
}
