package sales

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// salesTaxPayableCode is the GL account credited for output VAT on a sale.
const salesTaxPayableCode = "2559"

type salesInvoice struct {
	SalesID          int64    `json:"sales_id"`
	SalesNo          string   `json:"sales_no"`
	OrderDate        string   `json:"order_date"`
	PartnerName      string   `json:"partner_name"`
	TaxTypeName      string   `json:"tax_type_name"`
	Pretax           float64  `json:"pretax_amount"`
	Tax              float64  `json:"tax"`
	GrandTotal       float64  `json:"grand_total"`
	Fees             float64  `json:"fees"`
	Remark           string   `json:"remark"`
	SalesAccountID   *int64   `json:"sales_account_id"`
	SalesAccount     string   `json:"sales_account"`
	DepositAccountID *int64   `json:"deposit_account_id"`
	DepositAccount   string   `json:"deposit_account"`
	JournalEntryID   *int64   `json:"journal_entry_id"`
	JournalEntryNo   string   `json:"journal_entry_no"`
	JournalStatus    string   `json:"journal_status"`
}

type salesInvoiceAudit struct {
	SalesAccountID   *int64  `json:"sales_account_id"`
	DepositAccountID *int64  `json:"deposit_account_id"`
	Fees             float64 `json:"fees"`
	Remark           string  `json:"remark"`
	JournalEntryID   *int64  `json:"journal_entry_id"`
}

func loadSalesInvoiceAudit(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (salesInvoiceAudit, error) {
	var snap salesInvoiceAudit
	err := pool.QueryRow(ctx, `
		select sales_account_id, deposit_account_id, invoice_fees::float8,
		  coalesce(invoice_remark, ''), invoice_journal_entry_id
		from public.sa_sales
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		id, tenantID).Scan(&snap.SalesAccountID, &snap.DepositAccountID, &snap.Fees, &snap.Remark, &snap.JournalEntryID)
	return snap, err
}

func getSalesInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var inv salesInvoice
		var orderDate time.Time
		err = pool.QueryRow(r.Context(), `
			select s.id, s.sales_no, s.order_date, p.company_name, tt.name,
			  s.subtotal::float8, s.tax_total::float8, s.grand_total::float8,
			  s.invoice_fees::float8, coalesce(s.invoice_remark, ''),
			  s.sales_account_id, coalesce(ai.account_code || ' ' || ai.account_name, ''),
			  s.deposit_account_id, coalesce(aii.account_code || ' ' || aii.account_name, ''),
			  s.invoice_journal_entry_id, coalesce(je.entry_no, ''), coalesce(je.status, '')
			from public.sa_sales s
			join public.inv_partners p on p.id = s.partner_id
			join public.quo_tax_types tt on tt.id = s.tax_type_id
			left join public.fin_accounts ai on ai.id = s.sales_account_id
			left join public.fin_accounts aii on aii.id = s.deposit_account_id
			left join public.fin_journal_entries je on je.id = s.invoice_journal_entry_id
			where s.id = $1 and s.tenant_id = $2 and s.deleted_at is null`,
			id, tu.TenantID).Scan(
			&inv.SalesID, &inv.SalesNo, &orderDate, &inv.PartnerName, &inv.TaxTypeName,
			&inv.Pretax, &inv.Tax, &inv.GrandTotal,
			&inv.Fees, &inv.Remark,
			&inv.SalesAccountID, &inv.SalesAccount,
			&inv.DepositAccountID, &inv.DepositAccount,
			&inv.JournalEntryID, &inv.JournalEntryNo, &inv.JournalStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sale not found.", "ERR_NOT_FOUND")
			return
		}
		inv.OrderDate = orderDate.Format("2006-01-02")
		response.OK(w, inv, "OK")
	}
}

func putSalesInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			SalesAccountID   int64   `json:"sales_account_id"`
			DepositAccountID int64   `json:"deposit_account_id"`
			Fees             float64 `json:"fees"`
			Remark           string  `json:"remark"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid request."})
			return
		}
		fields := map[string]string{}
		if body.SalesAccountID <= 0 {
			fields["sales_account_id"] = "Sales account is required."
		}
		if body.DepositAccountID <= 0 {
			fields["deposit_account_id"] = "Deposit account is required."
		}
		if len(fields) > 0 {
			response.Validation(w, fields)
			return
		}

		var orderDate time.Time
		var partnerID int64
		var subtotal, taxTotal, grandTotal float64
		var salesNo string
		var existingJE *int64
		err = pool.QueryRow(r.Context(), `
			select order_date, partner_id, subtotal::float8, tax_total::float8, grand_total::float8, sales_no, invoice_journal_entry_id
			from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&orderDate, &partnerID, &subtotal, &taxTotal, &grandTotal, &salesNo, &existingJE)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sale not found.", "ERR_NOT_FOUND")
			return
		}

		if !accountsExist(r.Context(), pool, tu.TenantID, body.SalesAccountID, body.DepositAccountID) {
			response.Validation(w, map[string]string{"sales_account_id": "Invalid account selected."})
			return
		}

		before, _ := loadSalesInvoiceAudit(r.Context(), pool, tu.TenantID, id)

		jeStatus, err := invoicejournal.EntryStatus(r.Context(), pool, tu.TenantID, existingJE)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load journal entry.", "ERR_INTERNAL")
			return
		}
		if jeStatus == "posted" {
			accountsChanged := before.SalesAccountID == nil || before.DepositAccountID == nil ||
				*before.SalesAccountID != body.SalesAccountID || *before.DepositAccountID != body.DepositAccountID
			if accountsChanged {
				response.Validation(w, map[string]string{
					"journal_entry": "Accounts cannot be changed after the journal entry is posted. Update fees or remark only, or adjust the entry in Finance.",
				})
				return
			}
			if _, err := pool.Exec(r.Context(), `
				update public.sa_sales
				set invoice_fees = $2, invoice_remark = $3, updated_at = now()
				where id = $1 and tenant_id = $4 and deleted_at is null`,
				id, body.Fees, nullIfEmpty(body.Remark), tu.TenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save invoice.", "ERR_INTERNAL")
				return
			}
			after, _ := loadSalesInvoiceAudit(r.Context(), pool, tu.TenantID, id)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.invoice.update", "sa_sales", &id, before, after)
			response.OK(w, map[string]any{"journal_entry_id": existingJE}, "Invoice saved.")
			return
		}

		lines := []invoicejournal.Line{
			{AccountID: body.DepositAccountID, Debit: grandTotal, PartyID: &partnerID, Remark: "A/R - " + salesNo},
			{AccountID: body.SalesAccountID, Credit: subtotal, Remark: "Sales - " + salesNo},
		}
		if taxTotal > 0 {
			if taxAcct, e := invoicejournal.ResolveAccountID(r.Context(), pool, tu.TenantID, salesTaxPayableCode); e == nil {
				lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Credit: taxTotal, Remark: "Output VAT - " + salesNo})
			}
		}

		autoPost := readAutoPost(r.Context(), pool, tu.TenantID, "accounts_auto_post_sales")
		jeID, err := invoicejournal.Sync(r.Context(), pool, tu.TenantID, tu.AppUserID, orderDate, "Sales "+salesNo, existingJE, lines, autoPost)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build journal entry.", "ERR_INTERNAL")
			return
		}

		if _, err := pool.Exec(r.Context(), `
			update public.sa_sales
			set sales_account_id = $2, deposit_account_id = $3, invoice_fees = $4,
			    invoice_remark = $5, invoice_journal_entry_id = $6, updated_at = now()
			where id = $1 and tenant_id = $7`,
			id, body.SalesAccountID, body.DepositAccountID, body.Fees, nullIfEmpty(body.Remark), jeID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save invoice.", "ERR_INTERNAL")
			return
		}

		after, _ := loadSalesInvoiceAudit(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.invoice.update", "sa_sales", &id, before, after)
		response.OK(w, map[string]any{"journal_entry_id": jeID}, "Invoice saved.")
	}
}

func accountsExist(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids ...int64) bool {
	for _, aid := range ids {
		var ok bool
		if err := pool.QueryRow(ctx, `select exists(select 1 from public.fin_accounts where id = $1 and tenant_id = $2 and is_active and deleted_at is null)`, aid, tenantID).Scan(&ok); err != nil || !ok {
			return false
		}
	}
	return true
}

func readAutoPost(ctx context.Context, pool *pgxpool.Pool, tenantID int64, column string) bool {
	var v bool
	// column is a trusted internal constant, not user input.
	err := pool.QueryRow(ctx, `select coalesce(`+column+`, false) from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&v)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return v
}
