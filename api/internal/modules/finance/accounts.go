package finance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type finAccount struct {
	ID          int64  `json:"id"`
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id,omitempty"`
	ParentCode  string `json:"parent_code,omitempty"`
	ParentName  string `json:"parent_name,omitempty"`
	IsGroup     bool   `json:"is_group"`
	IsActive    bool   `json:"is_active"`
	IsSystem    bool   `json:"is_system"`
	SortOrder   int    `json:"sort_order"`
	ChildCount  int64  `json:"child_count"`
}

type finAccountBody struct {
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id"`
	IsGroup     *bool  `json:"is_group"`
	IsActive    *bool  `json:"is_active"`
	SortOrder   *int   `json:"sort_order"`
}

var allowedAccountTypes = map[string]struct{}{
	"asset":     {},
	"liability": {},
	"equity":    {},
	"income":    {},
	"expense":   {},
}

func registerAccountRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/accounts", listAccounts(pool))
	r.Post("/accounts", createAccount(pool))
	r.Post("/accounts/import-template", importAccountTemplate(pool))
	r.Post("/accounts/ensure-purchase-cogs", ensurePurchaseCogsAccount(pool))
	r.Get("/accounts/defaults", getFinanceDefaults(pool))
	r.Patch("/accounts/defaults", saveFinanceDefaults(pool))
	registerCoaReplaceRoutes(r, pool)
	r.Get("/accounts/{id}", getAccount(pool))
	r.Patch("/accounts/{id}", updateAccount(pool))
	r.Delete("/accounts/{id}", deleteAccount(pool))
	r.Post("/accounts/{id}/restore", restoreAccount(pool))
}

func listAccounts(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"account_code": "a.account_code",
		"account_name": "a.account_name",
		"account_type": "a.account_type",
		"sort_order":   "a.sort_order",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sort_order", allowed)
		// Mapping dropdowns / parent pickers need the full active chart (often >100 rows).
		// Global list clamp is 100; allow up to 2000 for this endpoint only.
		if raw := strings.TrimSpace(r.URL.Query().Get("pageSize")); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > p.PageSize {
				if n > 2000 {
					n = 2000
				}
				p.PageSize = n
			}
		}
		offset := httputil.Offset(p)
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		accountType := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("account_type")))
		status := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))

		where := "a.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q != "" {
			where += fmt.Sprintf(" and (a.account_code ilike $%d or a.account_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if accountType != "" {
			where += fmt.Sprintf(" and a.account_type = $%d", n)
			args = append(args, accountType)
			n++
		}
		switch status {
		case "deleted":
			where += " and a.deleted_at is not null"
		case "active":
			where += " and a.deleted_at is null and a.is_active = true"
		case "inactive":
			where += " and a.deleted_at is null and a.is_active = false"
		default:
			where += " and a.deleted_at is null"
		}

		countQ := fmt.Sprintf(`select count(*) from public.fin_accounts a where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count accounts.", "ERR_INTERNAL")
			return
		}

		listQ := fmt.Sprintf(`
			select a.id, a.account_code, a.account_name, a.account_type, a.parent_id,
			  coalesce(p.account_code, ''), coalesce(p.account_name, ''), a.is_group, a.is_active, a.is_system, a.sort_order,
			  coalesce((select count(*) from public.fin_accounts c where c.parent_id = a.id and c.tenant_id = a.tenant_id and c.deleted_at is null), 0)
			from public.fin_accounts a
			left join public.fin_accounts p on p.id = a.parent_id and p.tenant_id = a.tenant_id
			where %s
			order by %s %s, a.account_code asc
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), listQ, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load accounts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []finAccount
		for rows.Next() {
			var row finAccount
			if err := rows.Scan(
				&row.ID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.ParentID,
				&row.ParentCode, &row.ParentName, &row.IsGroup, &row.IsActive, &row.IsSystem, &row.SortOrder, &row.ChildCount,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read accounts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []finAccount{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body finAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		cleaned, errs := validateAccountBody(r, pool, tu.TenantID, body, nil)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_accounts (
			  tenant_id, account_code, account_name, account_type, parent_id, is_group, is_active, sort_order
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, cleaned.AccountCode, cleaned.AccountName, cleaned.AccountType,
			cleaned.ParentID, cleaned.IsGroup, cleaned.IsActive, cleaned.SortOrder,
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"account_code": "Account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create account.", "ERR_INTERNAL")
			return
		}

		created, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Account created but failed to load record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.create", "fin_account", &id, nil, body)
		response.OK(w, created, "Created.")
	}
}

func getAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}
		row, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func updateAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}
		var body finAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		existing, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		cleaned, errs := validateAccountBody(r, pool, tu.TenantID, body, &existing)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.fin_accounts
			set account_code = $1,
			  account_name = $2,
			  account_type = $3,
			  parent_id = $4,
			  is_group = $5,
			  is_active = $6,
			  sort_order = $7
			where id = $8 and tenant_id = $9 and deleted_at is null`,
			cleaned.AccountCode, cleaned.AccountName, cleaned.AccountType, cleaned.ParentID,
			cleaned.IsGroup, cleaned.IsActive, cleaned.SortOrder, id, tu.TenantID,
		)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"account_code": "Account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to update account.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}

		updated, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Account updated but failed to load record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.update", "fin_account", &id, nil, body)
		response.OK(w, updated, "Updated.")
	}
}

func deleteAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}

		var isSystem bool
		if err := pool.QueryRow(r.Context(), `
			select coalesce(is_system, false) from public.fin_accounts
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&isSystem); err != nil {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		if isSystem {
			response.Validation(w, map[string]string{"id": "System accounts cannot be deleted. Deactivate instead."})
			return
		}

		var childCount int64
		if err := pool.QueryRow(r.Context(), `
			select count(*) from public.fin_accounts
			where tenant_id = $1 and parent_id = $2 and deleted_at is null`, tu.TenantID, id).Scan(&childCount); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate account deletion.", "ERR_INTERNAL")
			return
		}
		if childCount > 0 {
			response.Validation(w, map[string]string{"id": "Cannot delete account with child accounts."})
			return
		}

		used, err := accountUsedInPostedEntries(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate account usage.", "ERR_INTERNAL")
			return
		}
		if used {
			response.Validation(w, map[string]string{"id": "Account is used in posted entries. Deactivate instead."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.fin_accounts
			set deleted_at = now(), is_active = false
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete account.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.delete", "fin_account", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func restoreAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_accounts
			set deleted_at = null, is_active = true
			where id = $1 and tenant_id = $2 and deleted_at is not null`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to restore account.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Deleted account not found.", "ERR_NOT_FOUND")
			return
		}
		row, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Restored but failed to load account.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.restore", "fin_account", &id, nil, nil)
		response.OK(w, row, "Restored.")
	}
}

type importTemplateBody struct {
	Template string `json:"template"`
	Replace  bool   `json:"replace"`
}

func importAccountTemplate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body importTemplateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			body.Template = "ph_sme"
		}
		template := strings.TrimSpace(strings.ToLower(body.Template))
		if template == "" {
			template = "ph_sme"
		}
		if template != "ph_sme" {
			response.Validation(w, map[string]string{"template": "Supported templates: ph_sme."})
			return
		}

		var existing int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.fin_accounts
			where tenant_id = $1 and deleted_at is null`, tu.TenantID).Scan(&existing)
		if existing > 0 && !body.Replace {
			response.Validation(w, map[string]string{
				"template": "Chart already has accounts. Import PH template only works on an empty chart, or request Replace (needs approval with a note).",
			})
			return
		}

		if body.Replace && existing > 0 {
			response.Err(w, http.StatusForbidden,
				"Replacing the chart needs approval. Use Request replace chart, add a note, and wait for another owner (or Platform) to approve.",
				"ERR_COA_REPLACE_NEEDS_APPROVAL")
			return
		}

		if _, err := pool.Exec(r.Context(), `select public.seed_ph_sme_chart_of_accounts($1)`, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to import template.", "ERR_INTERNAL")
			return
		}
		// Zoho-style group headers (migration 226); ignore if function not yet applied.
		_, _ = pool.Exec(r.Context(), `select public.apply_ph_sme_coa_hierarchy($1)`, tu.TenantID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.import_template", "fin_account", nil, nil, body)

		var total int64
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.fin_accounts
			where tenant_id = $1 and deleted_at is null`, tu.TenantID).Scan(&total)
		msg := "Template imported."
		if body.Replace {
			msg = "Legacy accounts soft-deleted; PH SME template imported."
		}
		response.OK(w, map[string]any{"imported": total, "template": template, "replaced": body.Replace}, msg)
	}
}

// ensurePurchaseCogsAccount creates (or reuses) an active expense posting account for Purchases/COGS
// and always maps it as the tenant purchase_account_id default.
func ensurePurchaseCogsAccount(pool *pgxpool.Pool) http.HandlerFunc {
	const code = "5010"
	const name = "Purchases / Cost of Goods Sold"

	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())

		resolveExpense := func() (int64, bool, error) {
			var id int64
			// Prefer active expense 5010.
			err := pool.QueryRow(r.Context(), `
				select id from public.fin_accounts
				where tenant_id = $1 and deleted_at is null and is_active
				  and account_type = 'expense' and coalesce(is_group, false) = false
				  and account_code = $2
				order by id asc limit 1`, tu.TenantID, code).Scan(&id)
			if err == nil && id > 0 {
				return id, false, nil
			}

			// Reactivate soft-deleted / inactive 5010 and coerce to expense posting.
			err = pool.QueryRow(r.Context(), `
				update public.fin_accounts
				set deleted_at = null, is_active = true, is_group = false,
				    account_type = 'expense', account_name = $3
				where tenant_id = $1 and account_code = $2
				returning id`, tu.TenantID, code, name).Scan(&id)
			if err == nil && id > 0 {
				return id, true, nil
			}

			// Insert 5010 (or next free 50xx on unique conflict).
			err = pool.QueryRow(r.Context(), `
				insert into public.fin_accounts (
				  tenant_id, account_code, account_name, account_type,
				  parent_id, is_group, is_active, is_system, sort_order
				) values ($1, $2, $3, 'expense', null, false, true, false, 5010)
				returning id`, tu.TenantID, code, name).Scan(&id)
			if err == nil {
				return id, true, nil
			}
			if !strings.Contains(strings.ToLower(err.Error()), "unique") {
				return 0, false, err
			}
			for i := 5011; i <= 5099; i++ {
				alt := fmt.Sprintf("%d", i)
				err = pool.QueryRow(r.Context(), `
					insert into public.fin_accounts (
					  tenant_id, account_code, account_name, account_type,
					  parent_id, is_group, is_active, is_system, sort_order
					) values ($1, $2, $3, 'expense', null, false, true, false, $4)
					returning id`, tu.TenantID, alt, name, i).Scan(&id)
				if err == nil {
					return id, true, nil
				}
				if !strings.Contains(strings.ToLower(err.Error()), "unique") {
					return 0, false, err
				}
			}
			return 0, false, fmt.Errorf("could not allocate expense account code")
		}

		accountID, created, err := resolveExpense()
		if err != nil || accountID <= 0 {
			msg := "Failed to create Purchases / COGS account."
			if err != nil && strings.Contains(strings.ToLower(err.Error()), "allocate") {
				response.Err(w, http.StatusConflict, "Could not allocate an expense account code for Purchases / COGS.", "ERR_CONFLICT")
				return
			}
			response.Err(w, http.StatusInternalServerError, msg, "ERR_INTERNAL")
			return
		}

		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load defaults.", "ERR_INTERNAL")
			return
		}
		// Always map Purchases / COGS to the ensured expense account when the user clicks Create.
		prev := d.PurchaseAccountID
		mapped := prev == nil || *prev != accountID
		d.PurchaseAccountID = &accountID
		if err := financedefaults.Save(r.Context(), pool, tu.TenantID, d); err != nil {
			response.Err(w, http.StatusInternalServerError, "Account ready but failed to save mapping.", "ERR_INTERNAL")
			return
		}

		acct, err := fetchAccount(r, pool, tu.TenantID, accountID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Account created but failed to load record.", "ERR_INTERNAL")
			return
		}
		outDefaults, _ := financedefaults.Load(r.Context(), pool, tu.TenantID)
		outDefaults.TenantID = tu.TenantID
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.ensure_purchase_cogs", "fin_account", &accountID, nil, map[string]any{
			"created": created,
			"mapped":  mapped,
		})
		response.OK(w, map[string]any{
			"account":  acct,
			"created":  created,
			"mapped":   mapped,
			"defaults": outDefaults,
		}, "Purchases / COGS account ready.")
	}
}

func getFinanceDefaults(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load defaults.", "ERR_INTERNAL")
			return
		}
		d.TenantID = tu.TenantID
		response.OK(w, d, "OK")
	}
}

func saveFinanceDefaults(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body financedefaults.Defaults
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		body.DisabledAccountTypes = sanitizeDisabledAccountTypes(body.DisabledAccountTypes)
		if errs := validateFinanceDefaults(r, pool, tu.TenantID, body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		if err := financedefaults.Save(r.Context(), pool, tu.TenantID, body); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save defaults.", "ERR_INTERNAL")
			return
		}
		d, _ := financedefaults.Load(r.Context(), pool, tu.TenantID)
		d.TenantID = tu.TenantID
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.defaults", "tenant_finance_defaults", nil, nil, body)
		response.OK(w, d, "Saved.")
	}
}

func sanitizeDisabledAccountTypes(raw []string) []string {
	allowed := map[string]struct{}{
		"asset": {}, "liability": {}, "equity": {}, "income": {}, "expense": {},
	}
	seen := map[string]struct{}{}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		t := strings.ToLower(strings.TrimSpace(item))
		if _, ok := allowed[t]; !ok {
			continue
		}
		if _, dup := seen[t]; dup {
			continue
		}
		seen[t] = struct{}{}
		out = append(out, t)
	}
	return out
}

func validateFinanceDefaults(r *http.Request, pool *pgxpool.Pool, tenantID int64, body financedefaults.Defaults) map[string]string {
	errs := map[string]string{}
	disabled := map[string]struct{}{}
	for _, t := range body.DisabledAccountTypes {
		disabled[t] = struct{}{}
	}
	for _, required := range []string{"asset", "liability", "income", "expense"} {
		if _, off := disabled[required]; off {
			errs["disabled_account_types"] = "Asset, liability, income, and expense cannot be disabled (needed for posting)."
			break
		}
	}
	checks := []struct {
		field string
		id    *int64
		types []string
	}{
		{"cash_account_id", body.CashAccountID, []string{"asset"}},
		{"receivable_account_id", body.ReceivableAccountID, []string{"asset"}},
		{"payable_account_id", body.PayableAccountID, []string{"liability"}},
		{"sales_account_id", body.SalesAccountID, []string{"income"}},
		{"purchase_account_id", body.PurchaseAccountID, []string{"expense"}},
		{"input_vat_account_id", body.InputVATAccountID, []string{"asset"}},
		{"output_vat_account_id", body.OutputVATAccountID, []string{"liability"}},
		{"commission_expense_account_id", body.CommissionExpenseAccountID, []string{"expense"}},
		{"commission_payable_account_id", body.CommissionPayableAccountID, []string{"liability"}},
		{"ewt_payable_account_id", body.EWTPayableAccountID, []string{"liability"}},
		{"fwt_payable_account_id", body.FWTPayableAccountID, []string{"liability"}},
		{"compensation_wht_payable_account_id", body.CompensationWHTPayableAccountID, []string{"liability"}},
		{"ewt_receivable_account_id", body.EWTReceivableAccountID, []string{"asset"}},
		{"inventory_account_id", body.InventoryAccountID, []string{"asset"}},
		{"grni_account_id", body.GRNIAccountID, []string{"liability"}},
		{"cogs_account_id", body.COGSAccountID, []string{"expense"}},
	}
	for _, c := range checks {
		if c.id == nil || *c.id <= 0 {
			continue
		}
		var acctType string
		err := pool.QueryRow(r.Context(), `
			select account_type from public.fin_accounts
			where id = $1 and tenant_id = $2 and is_active and deleted_at is null`,
			*c.id, tenantID).Scan(&acctType)
		if err != nil {
			errs[c.field] = "Account not found or inactive."
			continue
		}
		ok := false
		for _, t := range c.types {
			if acctType == t {
				ok = true
				break
			}
		}
		if !ok {
			errs[c.field] = fmt.Sprintf("Account must be type %s.", strings.Join(c.types, " or "))
		}
	}
	return errs
}

type normalizedFinAccount struct {
	AccountCode string
	AccountName string
	AccountType string
	ParentID    *int64
	IsGroup     bool
	IsActive    bool
	SortOrder   int
}

func validateAccountBody(r *http.Request, pool *pgxpool.Pool, tenantID int64, body finAccountBody, existing *finAccount) (normalizedFinAccount, map[string]string) {
	errs := map[string]string{}
	out := normalizedFinAccount{}

	out.AccountCode = strings.TrimSpace(body.AccountCode)
	out.AccountName = strings.TrimSpace(body.AccountName)
	out.AccountType = strings.ToLower(strings.TrimSpace(body.AccountType))
	if existing != nil {
		if out.AccountCode == "" {
			out.AccountCode = existing.AccountCode
		}
		if out.AccountName == "" {
			out.AccountName = existing.AccountName
		}
		if out.AccountType == "" {
			out.AccountType = existing.AccountType
		}
	}
	if out.AccountCode == "" {
		errs["account_code"] = "Account code is required."
	}
	if out.AccountName == "" {
		errs["account_name"] = "Account name is required."
	}
	if _, ok := allowedAccountTypes[out.AccountType]; !ok {
		errs["account_type"] = "Account type must be one of: asset, liability, equity, income, expense."
	}

	if existing == nil {
		if msg := validatePHCodeBand(out.AccountCode, out.AccountType); msg != "" {
			errs["account_code"] = msg
		}
	} else {
		used, _ := accountUsedInPostedEntries(r, pool, tenantID, existing.ID)
		if used {
			if out.AccountCode != existing.AccountCode {
				errs["account_code"] = "Account code cannot change after posted entries exist."
			}
			if out.AccountType != existing.AccountType {
				errs["account_type"] = "Account type cannot change after posted entries exist."
			}
		} else if out.AccountCode != existing.AccountCode || out.AccountType != existing.AccountType {
			if msg := validatePHCodeBand(out.AccountCode, out.AccountType); msg != "" {
				errs["account_code"] = msg
			}
		}
	}

	out.ParentID = body.ParentID
	if existing != nil && body.ParentID == nil {
		out.ParentID = existing.ParentID
	}
	out.IsGroup = false
	if body.IsGroup != nil {
		out.IsGroup = *body.IsGroup
	} else if existing != nil {
		out.IsGroup = existing.IsGroup
	}
	out.IsActive = true
	if body.IsActive != nil {
		out.IsActive = *body.IsActive
	} else if existing != nil {
		out.IsActive = existing.IsActive
	}
	out.SortOrder = 0
	if body.SortOrder != nil {
		out.SortOrder = *body.SortOrder
	} else if existing != nil {
		out.SortOrder = existing.SortOrder
	}
	if out.SortOrder < 0 {
		errs["sort_order"] = "Sort order cannot be negative."
	}

	if out.ParentID != nil {
		if existing != nil && *out.ParentID == existing.ID {
			errs["parent_id"] = "Account cannot be its own parent."
		} else {
			var parentExists bool
			if err := pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.fin_accounts where id = $1 and tenant_id = $2 and deleted_at is null
				)`, *out.ParentID, tenantID).Scan(&parentExists); err != nil || !parentExists {
				errs["parent_id"] = "Parent account not found."
			}
		}
	}
	return out, errs
}

func validatePHCodeBand(code, accountType string) string {
	if len(code) < 4 {
		return ""
	}
	prefix, err := strconv.Atoi(code[:4])
	if err != nil {
		return ""
	}
	var lo, hi int
	switch accountType {
	case "asset":
		lo, hi = 1000, 1999
	case "liability":
		lo, hi = 2000, 2999
	case "equity":
		lo, hi = 3000, 3999
	case "income":
		lo, hi = 4000, 4999
	case "expense":
		lo, hi = 5000, 5999
	default:
		return ""
	}
	if prefix < lo || prefix > hi {
		return fmt.Sprintf("For %s accounts, use codes %d–%d (Philippine SME chart).", accountType, lo, hi)
	}
	return ""
}

func accountUsedInPostedEntries(r *http.Request, pool *pgxpool.Pool, tenantID, accountID int64) (bool, error) {
	var exists bool
	err := pool.QueryRow(r.Context(), `
		select exists(
		  select 1
		  from public.fin_journal_entry_lines l
		  join public.fin_journal_entries e on e.id = l.journal_entry_id
		  where e.tenant_id = $1 and l.account_id = $2 and e.status = 'posted'
		)`, tenantID, accountID).Scan(&exists)
	return exists, err
}

func fetchAccount(r *http.Request, pool *pgxpool.Pool, tenantID, id int64) (finAccount, error) {
	var row finAccount
	err := pool.QueryRow(r.Context(), `
		select a.id, a.account_code, a.account_name, a.account_type, a.parent_id,
		  coalesce(p.account_code, ''), coalesce(p.account_name, ''), a.is_group, a.is_active, a.is_system, a.sort_order,
		  coalesce((select count(*) from public.fin_accounts c where c.parent_id = a.id and c.tenant_id = a.tenant_id and c.deleted_at is null), 0)
		from public.fin_accounts a
		left join public.fin_accounts p on p.id = a.parent_id and p.tenant_id = a.tenant_id
		where a.id = $1 and a.tenant_id = $2 and a.deleted_at is null`, id, tenantID).Scan(
		&row.ID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.ParentID,
		&row.ParentCode, &row.ParentName, &row.IsGroup, &row.IsActive, &row.IsSystem, &row.SortOrder, &row.ChildCount,
	)
	return row, err
}
