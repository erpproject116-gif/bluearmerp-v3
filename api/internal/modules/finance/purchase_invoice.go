package finance

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

// inputVatCode is the GL account debited for input VAT paid to vendors.
const inputVatCode = "1359"

type purchaseInvoice struct {
	SupplierInvoiceID   int64   `json:"supplier_invoice_id"`
	InvoiceNo           string  `json:"invoice_no"`
	InvoiceDate         string  `json:"invoice_date"`
	PartnerName         string  `json:"partner_name"`
	Pretax              float64 `json:"pretax_amount"`
	Tax                 float64 `json:"tax"`
	GrandTotal          float64 `json:"grand_total"`
	Fees                float64 `json:"fees"`
	Remark              string  `json:"remark"`
	PurchaseAccountID   *int64  `json:"purchase_account_id"`
	PurchaseAccount     string  `json:"purchase_account"`
	WithdrawalAccountID *int64  `json:"withdrawal_account_id"`
	WithdrawalAccount   string  `json:"withdrawal_account"`
	JournalEntryID      *int64  `json:"journal_entry_id"`
	JournalEntryNo      string  `json:"journal_entry_no"`
	JournalStatus       string  `json:"journal_status"`
}

type purchaseInvoiceAudit struct {
	PurchaseAccountID   *int64  `json:"purchase_account_id"`
	WithdrawalAccountID *int64  `json:"withdrawal_account_id"`
	Fees                float64 `json:"fees"`
	Remark              string  `json:"remark"`
	JournalEntryID      *int64  `json:"journal_entry_id"`
}

func loadPurchaseInvoiceAudit(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (purchaseInvoiceAudit, error) {
	var snap purchaseInvoiceAudit
	err := pool.QueryRow(ctx, `
		select purchase_account_id, withdrawal_account_id, invoice_fees::float8,
		  coalesce(invoice_remark, ''), invoice_journal_entry_id
		from public.fin_supplier_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		id, tenantID).Scan(&snap.PurchaseAccountID, &snap.WithdrawalAccountID, &snap.Fees, &snap.Remark, &snap.JournalEntryID)
	return snap, err
}

func getPurchaseInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var inv purchaseInvoice
		var invoiceDate time.Time
		err = pool.QueryRow(r.Context(), `
			select si.id, si.invoice_no, si.invoice_date, p.company_name,
			  si.subtotal::float8, si.tax_total::float8, si.grand_total::float8,
			  si.invoice_fees::float8, coalesce(si.invoice_remark, ''),
			  si.purchase_account_id, coalesce(ai.account_code || ' ' || ai.account_name, ''),
			  si.withdrawal_account_id, coalesce(aii.account_code || ' ' || aii.account_name, ''),
			  si.invoice_journal_entry_id, coalesce(je.entry_no, ''), coalesce(je.status, '')
			from public.fin_supplier_invoices si
			join public.inv_partners p on p.id = si.partner_id
			left join public.fin_accounts ai on ai.id = si.purchase_account_id
			left join public.fin_accounts aii on aii.id = si.withdrawal_account_id
			left join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id
			where si.id = $1 and si.tenant_id = $2 and si.deleted_at is null`,
			id, tu.TenantID).Scan(
			&inv.SupplierInvoiceID, &inv.InvoiceNo, &invoiceDate, &inv.PartnerName,
			&inv.Pretax, &inv.Tax, &inv.GrandTotal,
			&inv.Fees, &inv.Remark,
			&inv.PurchaseAccountID, &inv.PurchaseAccount,
			&inv.WithdrawalAccountID, &inv.WithdrawalAccount,
			&inv.JournalEntryID, &inv.JournalEntryNo, &inv.JournalStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}
		inv.InvoiceDate = invoiceDate.Format("2006-01-02")
		response.OK(w, inv, "OK")
	}
}

func putPurchaseInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			PurchaseAccountID   int64   `json:"purchase_account_id"`
			WithdrawalAccountID int64   `json:"withdrawal_account_id"`
			Fees                float64 `json:"fees"`
			Remark              string  `json:"remark"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid request."})
			return
		}
		fields := map[string]string{}
		if body.PurchaseAccountID <= 0 {
			fields["purchase_account_id"] = "Purchase account is required."
		}
		if body.WithdrawalAccountID <= 0 {
			fields["withdrawal_account_id"] = "Withdrawal account is required."
		}
		if len(fields) > 0 {
			response.Validation(w, fields)
			return
		}

		var invoiceDate time.Time
		var partnerID int64
		var subtotal, taxTotal, grandTotal float64
		var invoiceNo string
		var existingJE *int64
		err = pool.QueryRow(r.Context(), `
			select invoice_date, partner_id, subtotal::float8, tax_total::float8, grand_total::float8, invoice_no, invoice_journal_entry_id
			from public.fin_supplier_invoices where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&invoiceDate, &partnerID, &subtotal, &taxTotal, &grandTotal, &invoiceNo, &existingJE)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase not found.", "ERR_NOT_FOUND")
			return
		}

		if !siAccountsExist(r.Context(), pool, tu.TenantID, body.PurchaseAccountID, body.WithdrawalAccountID) {
			response.Validation(w, map[string]string{"purchase_account_id": "Invalid account selected."})
			return
		}

		before, _ := loadPurchaseInvoiceAudit(r.Context(), pool, tu.TenantID, id)

		jeStatus, err := invoicejournal.EntryStatus(r.Context(), pool, tu.TenantID, existingJE)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load journal entry.", "ERR_INTERNAL")
			return
		}
		if jeStatus == "posted" {
			accountsChanged := before.PurchaseAccountID == nil || before.WithdrawalAccountID == nil ||
				*before.PurchaseAccountID != body.PurchaseAccountID || *before.WithdrawalAccountID != body.WithdrawalAccountID
			if accountsChanged {
				response.Validation(w, map[string]string{
					"journal_entry": "Accounts cannot be changed after the journal entry is posted. Update fees or remark only, or adjust the entry in Finance.",
				})
				return
			}
			if _, err := pool.Exec(r.Context(), `
				update public.fin_supplier_invoices
				set invoice_fees = $2, invoice_remark = $3, updated_at = now()
				where id = $1 and tenant_id = $4 and deleted_at is null`,
				id, body.Fees, siNullIfEmpty(body.Remark), tu.TenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save invoice.", "ERR_INTERNAL")
				return
			}
			after, _ := loadPurchaseInvoiceAudit(r.Context(), pool, tu.TenantID, id)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase.invoice.update", "fin_supplier_invoice", &id, before, after)
			response.OK(w, map[string]any{"journal_entry_id": existingJE}, "Invoice saved.")
			return
		}

		lines := []invoicejournal.Line{
			{AccountID: body.PurchaseAccountID, Debit: subtotal, Remark: "Purchase - " + invoiceNo},
		}
		if taxTotal > 0 {
			if taxAcct, e := invoicejournal.ResolveAccountID(r.Context(), pool, tu.TenantID, inputVatCode); e == nil {
				lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Debit: taxTotal, Remark: "Input VAT - " + invoiceNo})
			}
		}
		lines = append(lines, invoicejournal.Line{AccountID: body.WithdrawalAccountID, Credit: grandTotal, PartyID: &partnerID, Remark: "A/P - " + invoiceNo})

		autoPost := siReadAutoPost(r.Context(), pool, tu.TenantID, "accounts_auto_post_purchase")
		jeID, err := invoicejournal.Sync(r.Context(), pool, tu.TenantID, tu.AppUserID, invoiceDate, "Purchase "+invoiceNo, existingJE, lines, autoPost)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build journal entry.", "ERR_INTERNAL")
			return
		}

		if _, err := pool.Exec(r.Context(), `
			update public.fin_supplier_invoices
			set purchase_account_id = $2, withdrawal_account_id = $3, invoice_fees = $4,
			    invoice_remark = $5, invoice_journal_entry_id = $6, updated_at = now()
			where id = $1 and tenant_id = $7`,
			id, body.PurchaseAccountID, body.WithdrawalAccountID, body.Fees, siNullIfEmpty(body.Remark), jeID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save invoice.", "ERR_INTERNAL")
			return
		}

		after, _ := loadPurchaseInvoiceAudit(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase.invoice.update", "fin_supplier_invoice", &id, before, after)
		response.OK(w, map[string]any{"journal_entry_id": jeID}, "Invoice saved.")
	}
}

func siAccountsExist(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids ...int64) bool {
	for _, aid := range ids {
		var ok bool
		if err := pool.QueryRow(ctx, `select exists(select 1 from public.fin_accounts where id = $1 and tenant_id = $2 and is_active)`, aid, tenantID).Scan(&ok); err != nil || !ok {
			return false
		}
	}
	return true
}

func siReadAutoPost(ctx context.Context, pool *pgxpool.Pool, tenantID int64, column string) bool {
	var v bool
	err := pool.QueryRow(ctx, `select coalesce(`+column+`, false) from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&v)
	if err != nil && err != pgx.ErrNoRows {
		return false
	}
	return v
}
