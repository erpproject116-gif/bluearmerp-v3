package finance

import (
	"context"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type booksHealthException struct {
	Code     string `json:"code"`
	Severity string `json:"severity"` // block | warn
	Count    int64  `json:"count"`
	Label    string `json:"label"`
	Href     string `json:"href"`
}

type booksHealthPolicies struct {
	AccountsAutoPostOR       bool `json:"accounts_auto_post_or"`
	AccountsAutoPostPV       bool `json:"accounts_auto_post_pv"`
	AccountsAutoPostSales    bool `json:"accounts_auto_post_sales"`
	AccountsAutoPostPurchase bool `json:"accounts_auto_post_purchase"`
	InventoryGLHybridEnabled bool `json:"inventory_gl_hybrid_enabled"`
}

type booksHealthFiscal struct {
	PeriodID   *int64  `json:"period_id,omitempty"`
	PeriodCode string  `json:"period_code,omitempty"`
	IsClosed   bool    `json:"is_closed"`
	YearCode   string  `json:"year_code,omitempty"`
}

type booksHealthSignoffLinks struct {
	TrialBalance              string `json:"trial_balance"`
	ProfitAndLoss             string `json:"profit_and_loss"`
	BalanceSheet              string `json:"balance_sheet"`
	BankReconciliation        string `json:"bank_reconciliation"`
	ArByCustomer              string `json:"ar_by_customer"`
	ApByVendor                string `json:"ap_by_vendor"`
	AcctInventoryReconciliation string `json:"acct_inventory_reconciliation"`
	JournalEntries            string `json:"journal_entries"`
	CreditNotes               string `json:"credit_notes"`
	VendorCredits             string `json:"vendor_credits"`
	SalesPreInvoicing         string `json:"sales_pre_invoicing"`
	PurchasePreInvoicing      string `json:"purchase_pre_invoicing"`
	ChartOfAccountsDefaults   string `json:"chart_of_accounts"`
	FinanceSetup              string `json:"finance_setup"`
}

type booksHealthResponse struct {
	AsOf                       string                  `json:"as_of"`
	ReadyToClose               bool                    `json:"ready_to_close"`
	DraftJournalEntries        int64                   `json:"draft_journal_entries"`
	ConfirmedSalesDraftOrMissingJE int64               `json:"confirmed_sales_draft_or_missing_je"`
	ConfirmedBillsDraftOrMissingJE int64               `json:"confirmed_bills_draft_or_missing_je"`
	UnmatchedBankLines         int64                   `json:"unmatched_bank_lines"`
	AuditOnlyPending           int64                   `json:"audit_only_pending"`
	CreditsMissingJE           int64                   `json:"credits_missing_je"`
	CreditNotesMissingJE       int64                   `json:"credit_notes_missing_je"`
	VendorCreditsMissingJE     int64                   `json:"vendor_credits_missing_je"`
	ArCustomers                int64                   `json:"ar_customers"`
	UnpaidSupplierInvoices     int64                   `json:"unpaid_supplier_invoices"`
	ApOverApplication          int64                   `json:"ap_over_application"`
	SalesUnbilledLines         int64                   `json:"sales_unbilled_lines"`
	PurchaseUnbilledGRLines    int64                   `json:"purchase_unbilled_gr_lines"`
	InventoryClosingDifference float64                 `json:"inventory_closing_difference"`
	HybridInventoryUnmapped    bool                    `json:"hybrid_inventory_unmapped"`
	Policies                   booksHealthPolicies     `json:"policies"`
	Fiscal                     booksHealthFiscal       `json:"fiscal"`
	Exceptions                 []booksHealthException  `json:"exceptions"`
	SignoffLinks               booksHealthSignoffLinks `json:"signoff_links"`
	// SignoffChecklist is the Sale/PR → books verification matrix for operators.
	SignoffChecklist           []string                `json:"signoff_checklist"`
}

func registerBooksHealthRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/books-health", booksHealthHandler(pool))
}

func booksHealthHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOfStr := strings.TrimSpace(r.URL.Query().Get("as_of"))
		asOf := time.Now().UTC()
		if asOfStr != "" {
			d, err := time.Parse("2006-01-02", asOfStr)
			if err != nil {
				response.Validation(w, map[string]string{"as_of": "Invalid date. Use YYYY-MM-DD."})
				return
			}
			asOf = d
		}
		out, err := loadBooksHealth(r.Context(), pool, tu.TenantID, asOf)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load books health: "+err.Error(), "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

func loadBooksHealth(ctx context.Context, pool *pgxpool.Pool, tenantID int64, asOf time.Time) (booksHealthResponse, error) {
	asOfDay := asOf.UTC().Truncate(24 * time.Hour)
	out := booksHealthResponse{
		AsOf: asOfDay.Format("2006-01-02"),
		SignoffLinks: booksHealthSignoffLinks{
			TrialBalance:                "/app/finance/acct-i/reports/trial-balance",
			ProfitAndLoss:               "/app/finance/acct-i/reports/profit-and-loss",
			BalanceSheet:                "/app/finance/acct-i/reports/balance-sheet",
			BankReconciliation:          "/app/finance/acct-i/bank-reconciliation",
			ArByCustomer:                "/app/finance/reports/ar-by-customer",
			ApByVendor:                  "/app/finance/reports/ap-by-vendor",
			AcctInventoryReconciliation: "/app/finance/reports/acct-inventory-reconciliation",
			JournalEntries:              "/app/finance/acct-i/journal-entries?status=draft",
			CreditNotes:                 "/app/sales/credit-notes",
			VendorCredits:               "/app/purchases/vendor-credits",
			SalesPreInvoicing:           "/app/sales/sales/pre-invoicing",
			PurchasePreInvoicing:        "/app/buying/reports/pre-invoicing",
			ChartOfAccountsDefaults:     "/app/finance/acct-i/chart-of-accounts",
			FinanceSetup:                "/app/finance/setup",
		},
	}

	_ = pool.QueryRow(ctx, `
		select count(*) from public.fin_journal_entries
		where tenant_id = $1 and status = 'draft'`, tenantID).Scan(&out.DraftJournalEntries)

	// Confirmed sales whose A/R journal is missing or still draft — BS/P&L/Ledger won't move.
	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.sa_sales s
		left join public.fin_journal_entries je on je.id = s.invoice_journal_entry_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.grand_total > 0.0001
		  and coalesce(s.progress_status, '') in ('completed', 'confirm', 'e_approval', 'confirmed', 'approved', 'released', 'shipped')
		  and (s.invoice_journal_entry_id is null or coalesce(je.status, 'draft') = 'draft')`,
		tenantID).Scan(&out.ConfirmedSalesDraftOrMissingJE)

	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.fin_supplier_invoices si
		left join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id
		where si.tenant_id = $1 and si.deleted_at is null
		  and si.grand_total > 0.0001
		  and coalesce(si.progress_status, '') in ('completed', 'confirm', 'e_approval')
		  and (si.invoice_journal_entry_id is null or coalesce(je.status, 'draft') = 'draft')`,
		tenantID).Scan(&out.ConfirmedBillsDraftOrMissingJE)

	_ = pool.QueryRow(ctx, `
		select count(*) from public.fin_bank_statement_lines
		where tenant_id = $1 and matched_payment_id is null`, tenantID).Scan(&out.UnmatchedBankLines)

	if n, err := countAuditOnlyPending(ctx, pool, tenantID); err == nil {
		out.AuditOnlyPending = n
	}

	_ = pool.QueryRow(ctx, `
		select count(*) from public.fin_credit_notes
		where tenant_id = $1 and deleted_at is null and status = 'open'
		  and journal_entry_id is null and amount_total > 0.0001`, tenantID).Scan(&out.CreditNotesMissingJE)
	_ = pool.QueryRow(ctx, `
		select count(*) from public.fin_vendor_credits
		where tenant_id = $1 and deleted_at is null and status = 'open'
		  and journal_entry_id is null and amount_total > 0.0001`, tenantID).Scan(&out.VendorCreditsMissingJE)
	out.CreditsMissingJE = out.CreditNotesMissingJE + out.VendorCreditsMissingJE

	_ = pool.QueryRow(ctx, `
		select count(*) from (
		  select s.partner_id
		  from public.sa_sales s
		  left join lateral (
		    select coalesce(sum(a.applied_amount), 0)::float8 as received
		    from public.fin_receipt_applications a
		    join public.fin_official_receipts r on r.id = a.official_receipt_id
		    where a.sales_id = s.id and r.deleted_at is null
		  ) recv on true
		  where s.tenant_id = $1 and s.deleted_at is null
		  group by s.partner_id
		  having coalesce(sum(s.grand_total), 0) - coalesce(sum(recv.received), 0) > 0
		) ar`, tenantID).Scan(&out.ArCustomers)

	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.fin_supplier_invoices si
		`+supplierInvoiceAppliedLateralSQLAsOf("si", "")+`
		where si.tenant_id = $1
		  and si.deleted_at is null
		  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`, tenantID).Scan(&out.UnpaidSupplierInvoices)

	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.fin_supplier_invoices si
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as paid
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  where a.supplier_invoice_id = si.id and pv.deleted_at is null
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null
		  and coalesce(paid.paid, 0) > si.grand_total + 0.0001`, tenantID).Scan(&out.ApOverApplication)

	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.sa_sales s
		where s.tenant_id = $1 and s.deleted_at is null
		  and coalesce(s.invoicing_status, false) = false
		  and s.progress_status in ('confirmed', 'approved', 'released', 'shipped', 'completed')`, tenantID).Scan(&out.SalesUnbilledLines)

	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		left join (
		  select goods_receipt_line_id, sum(qty) as billed
		  from public.gr_goods_receipt_slip_lines
		  where slip_type = 'supplier_invoice'
		  group by goods_receipt_line_id
		) sl on sl.goods_receipt_line_id = grl.id
		where gr.tenant_id = $1 and gr.status = 'posted'
		  and gr.receipt_date <= $2::date
		  and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001`,
		tenantID, asOfDay.Format("2006-01-02")).Scan(&out.PurchaseUnbilledGRLines)

	policy, err := processpolicy.Load(ctx, pool, tenantID)
	if err == nil {
		out.Policies = booksHealthPolicies{
			AccountsAutoPostOR:       policy.AccountsAutoPostOR,
			AccountsAutoPostPV:       policy.AccountsAutoPostPV,
			AccountsAutoPostSales:    policy.AccountsAutoPostSales,
			AccountsAutoPostPurchase: policy.AccountsAutoPostPurchase,
			InventoryGLHybridEnabled: policy.InventoryGLHybridEnabled,
		}
	}

	if out.Policies.InventoryGLHybridEnabled {
		_, errInv := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RoleInventory)
		_, errGRNI := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RoleGRNI)
		_, errCOGS := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RoleCOGS)
		out.HybridInventoryUnmapped = errInv != nil || errGRNI != nil || errCOGS != nil

		from := time.Date(asOfDay.Year(), asOfDay.Month(), 1, 0, 0, 0, 0, time.UTC)
		payload, err := loadAcctInventoryReconciliation(ctx, pool, tenantID, from, asOfDay)
		if err == nil {
			out.InventoryClosingDifference = payload.Summary.ClosingDifference
		}
	}

	var periodID int64
	var periodCode, yearCode string
	var isClosed bool
	err = pool.QueryRow(ctx, `
		select fp.id, fp.period_code, fp.is_closed, fy.year_code
		from public.fin_fiscal_periods fp
		join public.fin_fiscal_years fy on fy.id = fp.fiscal_year_id
		where fy.tenant_id = $1
		  and fp.start_date <= $2::date and fp.end_date >= $2::date
		order by fp.start_date desc
		limit 1`, tenantID, asOfDay.Format("2006-01-02")).Scan(&periodID, &periodCode, &isClosed, &yearCode)
	if err == nil {
		pid := periodID
		out.Fiscal = booksHealthFiscal{
			PeriodID:   &pid,
			PeriodCode: periodCode,
			IsClosed:   isClosed,
			YearCode:   yearCode,
		}
	}

	out.Exceptions = buildBooksHealthExceptions(out)
	out.SignoffChecklist = accountingSignoffChecklist()
	out.ReadyToClose = booksHealthReady(out)
	return out, nil
}

func accountingSignoffChecklist() []string {
	return []string{
		"After confirmed Sale / Purchase Receive: Inv. Book by Location shows the movement for item + location",
		"Find Stock shows qty in the document location column (item track inventory / lot / serial)",
		"Receivables or Payables hub shows an open partner balance",
		"Journal Entries: linked JE exists and status is posted (not draft)",
		"General Ledger moves for Receivable/Payable/Sales/Purchase (and Inventory/GRNI/COGS if hybrid GL on)",
		"Customer/Vendor Book (SOA) invoice and accounting sides agree",
		"Balance Sheet / Profit & Loss reflect the posted amounts for the period",
	}
}

func buildBooksHealthExceptions(h booksHealthResponse) []booksHealthException {
	var ex []booksHealthException
	add := func(code, severity string, count int64, label, href string) {
		if count <= 0 && code != "hybrid_inventory_unmapped" {
			return
		}
		ex = append(ex, booksHealthException{Code: code, Severity: severity, Count: count, Label: label, Href: href})
	}
	draftLabel := "Draft journal entries need review/post — Ledger / BS / P&L only include posted JEs"
	if !h.Policies.AccountsAutoPostSales || !h.Policies.AccountsAutoPostPurchase {
		draftLabel += " (accounts auto-post sales/purchase is off for this tenant)"
	}
	add("draft_journals", "block", h.DraftJournalEntries, draftLabel, h.SignoffLinks.JournalEntries)
	add("confirmed_sales_unposted_je", "block", h.ConfirmedSalesDraftOrMissingJE,
		"Confirmed sales with missing or draft A/R journals", h.SignoffLinks.JournalEntries)
	add("confirmed_bills_unposted_je", "block", h.ConfirmedBillsDraftOrMissingJE,
		"Confirmed Purchase Receives with missing or draft A/P journals", h.SignoffLinks.JournalEntries)
	if !h.Policies.AccountsAutoPostSales {
		ex = append(ex, booksHealthException{
			Code: "auto_post_sales_off", Severity: "warn", Count: 1,
			Label: "accounts_auto_post_sales is off — confirmed sales may leave draft JEs until posted",
			Href:  h.SignoffLinks.FinanceSetup,
		})
	}
	if !h.Policies.AccountsAutoPostPurchase {
		ex = append(ex, booksHealthException{
			Code: "auto_post_purchase_off", Severity: "warn", Count: 1,
			Label: "accounts_auto_post_purchase is off — confirmed bills may leave draft JEs until posted",
			Href:  h.SignoffLinks.FinanceSetup,
		})
	}
	add("audit_only", "block", h.AuditOnlyPending, "OR/PV recorded but not on Trial Balance (audit-only)", "/app/finance/official-receipts")
	add("unmatched_bank", "block", h.UnmatchedBankLines, "Unmatched bank statement lines", h.SignoffLinks.BankReconciliation)
	add("credits_missing_je", "block", h.CreditsMissingJE, "Open credit notes/vendor credits missing journals", h.SignoffLinks.CreditNotes)
	add("ap_over_application", "block", h.ApOverApplication, "Supplier invoices with over-applied payments", "/app/finance/payment-vouchers")
	if h.Policies.InventoryGLHybridEnabled && h.HybridInventoryUnmapped {
		ex = append(ex, booksHealthException{
			Code: "hybrid_inventory_unmapped", Severity: "block", Count: 1,
			Label: "Hybrid inventory GL on but Inventory/GRNI/COGS defaults unmapped",
			Href:  h.SignoffLinks.ChartOfAccountsDefaults,
		})
	}
	if h.Policies.InventoryGLHybridEnabled && math.Abs(h.InventoryClosingDifference) > 0.01 {
		ex = append(ex, booksHealthException{
			Code: "inventory_vs_gl", Severity: "block", Count: 1,
			Label: "Accounting vs inventory valuation difference",
			Href:  h.SignoffLinks.AcctInventoryReconciliation,
		})
	}
	add("sales_pre_invoicing", "warn", h.SalesUnbilledLines, "Sales not yet invoiced", h.SignoffLinks.SalesPreInvoicing)
	add("purchase_pre_invoicing", "warn", h.PurchaseUnbilledGRLines, "Goods received not yet billed", h.SignoffLinks.PurchasePreInvoicing)
	return ex
}

func booksHealthReady(h booksHealthResponse) bool {
	if h.Fiscal.IsClosed {
		return false
	}
	for _, ex := range h.Exceptions {
		if ex.Severity == "block" {
			return false
		}
	}
	return true
}
