package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
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
	RuleName          *string `json:"rule_name,omitempty"`
	SalesID           int64   `json:"sales_id"`
	SalesNo           string  `json:"sales_no"`
	OrderDate         string  `json:"order_date,omitempty"`
	SalespersonUserID *int64  `json:"salesperson_user_id,omitempty"`
	BeneficiaryName   string  `json:"beneficiary_name"`
	BaseAmount        float64 `json:"base_amount"`
	CommissionAmount  float64 `json:"commission_amount"`
	Status            string  `json:"status"`
	JournalEntryID    *int64  `json:"journal_entry_id,omitempty"`
	JournalEntryNo    *string `json:"journal_entry_no,omitempty"`
	PaidAt            *string `json:"paid_at,omitempty"`
	CreatedAt         string  `json:"created_at,omitempty"`
	Source            string  `json:"source"` // rule | line
}

type CommissionAccountingSettings struct {
	CommissionExpenseAccountID *int64  `json:"commission_expense_account_id,omitempty"`
	CommissionExpenseLabel     string  `json:"commission_expense_label,omitempty"`
	CommissionPayableAccountID *int64  `json:"commission_payable_account_id,omitempty"`
	CommissionPayableLabel     string  `json:"commission_payable_label,omitempty"`
	AutoPostCommissionJournal  bool    `json:"auto_post_commission_journal"`
	AccountsMapped             bool    `json:"accounts_mapped"`
}

type commissionRuleBody struct {
	Name              string  `json:"name"`
	SalespersonUserID *int64  `json:"salesperson_user_id"`
	ItemCategoryID    *int64  `json:"item_category_id"`
	RatePct           float64 `json:"rate_pct"`
	Active            *bool   `json:"active"`
}

type commissionAccountingBody struct {
	CommissionExpenseAccountID *int64 `json:"commission_expense_account_id"`
	CommissionPayableAccountID *int64 `json:"commission_payable_account_id"`
	AutoPostCommissionJournal  *bool  `json:"auto_post_commission_journal"`
}

func registerCommissionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales.commission_read", auth.AccessRead)).Get("/commission-rules", listCommissionRules(pool))
	r.With(auth.RequirePermission("sales.commission_write", auth.AccessWrite)).Post("/commission-rules", createCommissionRule(pool))
	r.With(auth.RequirePermission("sales.commission_read", auth.AccessRead)).Get("/commission-accruals", listCommissionAccruals(pool))
	r.With(auth.RequirePermission("sales.commission_write", auth.AccessWrite)).Post("/commission-accruals/{id}/mark-paid", markCommissionPaid(pool))
	r.With(auth.RequirePermission("sales.commission_write", auth.AccessWrite)).Post("/commission-accruals/post-gl", postCommissionGL(pool))
	r.With(auth.RequirePermission("sales.commission_read", auth.AccessRead)).Get("/commission-accounting", getCommissionAccounting(pool))
	r.With(auth.RequirePermission("sales.commission_write", auth.AccessWrite)).Put("/commission-accounting", putCommissionAccounting(pool))
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
		where := `a.tenant_id = $1`
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" && st != "all" {
			where += ` and a.status = $` + strconv.Itoa(n)
			args = append(args, st)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += ` and (s.sales_no ilike $` + strconv.Itoa(n) + ` or coalesce(a.beneficiary_name,'') ilike $` + strconv.Itoa(n) + ` or coalesce(u.full_name,'') ilike $` + strconv.Itoa(n) + `)`
			args = append(args, "%"+q+"%")
			n++
		}
		if gl := strings.TrimSpace(r.URL.Query().Get("gl")); gl == "pending" {
			where += ` and a.journal_entry_id is null and a.status = 'accrued'`
		} else if gl == "posted" {
			where += ` and a.journal_entry_id is not null`
		}

		rows, err := pool.Query(r.Context(), `
			select a.id, a.rule_id, r.name, a.sales_id, coalesce(s.sales_no,''),
			  to_char(s.order_date, 'YYYY-MM-DD'),
			  a.salesperson_user_id,
			  coalesce(nullif(trim(a.beneficiary_name),''), nullif(trim(u.full_name),''), coalesce(scl.tic_name,''), ''),
			  a.base_amount::float8, a.commission_amount::float8, a.status,
			  a.journal_entry_id, je.entry_no,
			  case when a.paid_at is null then null else to_char(a.paid_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end,
			  to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
			  case when a.sale_commission_line_id is not null then 'line' else 'rule' end
			from public.sa_commission_accruals a
			join public.sa_sales s on s.id = a.sales_id
			left join public.sa_commission_rules r on r.id = a.rule_id
			left join public.users u on u.id = a.salesperson_user_id
			left join public.sa_sales_commission_lines scl on scl.id = a.sale_commission_line_id
			left join public.fin_journal_entries je on je.id = a.journal_entry_id
			where `+where+`
			order by a.id desc
			limit 500`, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list commission accruals.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CommissionAccrual
		for rows.Next() {
			var row CommissionAccrual
			var paidAt, createdAt *string
			var orderDate *string
			if err := rows.Scan(
				&row.ID, &row.RuleID, &row.RuleName, &row.SalesID, &row.SalesNo,
				&orderDate, &row.SalespersonUserID, &row.BeneficiaryName,
				&row.BaseAmount, &row.CommissionAmount, &row.Status,
				&row.JournalEntryID, &row.JournalEntryNo, &paidAt, &createdAt, &row.Source,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read commission accruals.", "ERR_INTERNAL")
				return
			}
			if orderDate != nil {
				row.OrderDate = *orderDate
			}
			row.PaidAt = paidAt
			if createdAt != nil {
				row.CreatedAt = *createdAt
			}
			out = append(out, row)
		}
		if out == nil {
			out = []CommissionAccrual{}
		}
		response.OK(w, out, "OK")
	}
}

func markCommissionPaid(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.sa_commission_accruals
			set status = 'paid', paid_at = now()
			where id = $1 and tenant_id = $2 and status <> 'paid'`,
			id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Accrual not found or already paid.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.commission_accrual.paid", "sa_commission_accrual", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "status": "paid"}, "Marked paid.")
	}
}

func postCommissionGL(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			SalesID int64 `json:"sales_id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.SalesID <= 0 {
			if sid := strings.TrimSpace(r.URL.Query().Get("sales_id")); sid != "" {
				body.SalesID, _ = strconv.ParseInt(sid, 10, 64)
			}
		}
		if body.SalesID <= 0 {
			response.Validation(w, map[string]string{"sales_id": "sales_id is required."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		_, _, mapped, err := resolveCommissionAccounts(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load commission accounts.", "ERR_INTERNAL")
			return
		}
		if !mapped {
			response.Validation(w, map[string]string{
				"accounts": "Map commission expense and payable accounts under Commissions → Accounting first.",
			})
			return
		}
		if err := postCommissionJournalForSale(r.Context(), tx, tu.TenantID, tu.AppUserID, body.SalesID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post commission journal.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.commission_accrual.post_gl", "sa_sales", &body.SalesID, nil, nil)
		response.OK(w, map[string]any{"sales_id": body.SalesID}, "Commission journal created.")
	}
}

func accountLabel(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID int64, id *int64) string {
	if id == nil || *id <= 0 {
		return ""
	}
	var code, name string
	err := q.QueryRow(ctx, `
		select account_code, account_name from public.fin_accounts
		where id = $1 and tenant_id = $2 and deleted_at is null`, *id, tenantID).Scan(&code, &name)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(code + " " + name)
}

func getCommissionAccounting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			if strings.Contains(err.Error(), "commission_expense_account_id") {
				response.OK(w, CommissionAccountingSettings{}, "OK")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
			return
		}
		out := CommissionAccountingSettings{
			CommissionExpenseAccountID: d.CommissionExpenseAccountID,
			CommissionPayableAccountID: d.CommissionPayableAccountID,
			AutoPostCommissionJournal:  d.AutoPostCommissionJournal,
			CommissionExpenseLabel:     accountLabel(r.Context(), pool, tu.TenantID, d.CommissionExpenseAccountID),
			CommissionPayableLabel:     accountLabel(r.Context(), pool, tu.TenantID, d.CommissionPayableAccountID),
		}
		out.AccountsMapped = d.CommissionExpenseAccountID != nil && *d.CommissionExpenseAccountID > 0 &&
			d.CommissionPayableAccountID != nil && *d.CommissionPayableAccountID > 0
		response.OK(w, out, "OK")
	}
}

func putCommissionAccounting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body commissionAccountingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		d, err := financedefaults.Load(r.Context(), pool, tu.TenantID)
		if err != nil && !strings.Contains(err.Error(), "no rows") {
			if !strings.Contains(err.Error(), "commission_expense_account_id") {
				response.Err(w, http.StatusInternalServerError, "Failed to load settings.", "ERR_INTERNAL")
				return
			}
			d = financedefaults.Defaults{TenantID: tu.TenantID}
		}
		d.TenantID = tu.TenantID
		d.CommissionExpenseAccountID = body.CommissionExpenseAccountID
		d.CommissionPayableAccountID = body.CommissionPayableAccountID
		if body.AutoPostCommissionJournal != nil {
			d.AutoPostCommissionJournal = *body.AutoPostCommissionJournal
		}

		// Validate account types when set.
		if body.CommissionExpenseAccountID != nil && *body.CommissionExpenseAccountID > 0 {
			var t string
			err := pool.QueryRow(r.Context(), `
				select account_type from public.fin_accounts
				where id=$1 and tenant_id=$2 and is_active and deleted_at is null`,
				*body.CommissionExpenseAccountID, tu.TenantID).Scan(&t)
			if err != nil || t != "expense" {
				response.Validation(w, map[string]string{"commission_expense_account_id": "Must be an active expense account."})
				return
			}
		}
		if body.CommissionPayableAccountID != nil && *body.CommissionPayableAccountID > 0 {
			var t string
			err := pool.QueryRow(r.Context(), `
				select account_type from public.fin_accounts
				where id=$1 and tenant_id=$2 and is_active and deleted_at is null`,
				*body.CommissionPayableAccountID, tu.TenantID).Scan(&t)
			if err != nil || t != "liability" {
				response.Validation(w, map[string]string{"commission_payable_account_id": "Must be an active liability account."})
				return
			}
		}

		if err := financedefaults.Save(r.Context(), pool, tu.TenantID, d); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save settings. Apply migration 176 if not yet run.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.commission_accounting.save", "tenant_finance_defaults", nil, nil, body)

		// Return refreshed view via get handler logic
		out := CommissionAccountingSettings{
			CommissionExpenseAccountID: d.CommissionExpenseAccountID,
			CommissionPayableAccountID: d.CommissionPayableAccountID,
			AutoPostCommissionJournal:  d.AutoPostCommissionJournal,
			CommissionExpenseLabel:     accountLabel(r.Context(), pool, tu.TenantID, d.CommissionExpenseAccountID),
			CommissionPayableLabel:     accountLabel(r.Context(), pool, tu.TenantID, d.CommissionPayableAccountID),
		}
		out.AccountsMapped = d.CommissionExpenseAccountID != nil && *d.CommissionExpenseAccountID > 0 &&
			d.CommissionPayableAccountID != nil && *d.CommissionPayableAccountID > 0
		response.OK(w, out, "Saved.")
	}
}