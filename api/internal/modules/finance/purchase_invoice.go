package finance

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicevoid"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// inputVatCode is the GL account debited for input VAT paid to vendors.
const inputVatCode = "1359"

// ewtPayableCode is credited when supplier-invoice withholding is recognized at post
// (same GL as payment-voucher withholding in buildPVPostingEvent).
const ewtPayableCode = "2360"

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
					"journal_entry": "Accounts cannot be changed after the journal entry is posted. Update fees or remark only, or void and repost the invoice to change accounts.",
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

		var stockPretax float64
		err = pool.QueryRow(r.Context(), `
			select coalesce(sum(sil.non_vat_total), 0)::float8
			from public.fin_supplier_invoice_lines sil
			left join public.inv_items i on i.id = sil.item_id
			where sil.supplier_invoice_id = $1
			  and coalesce(i.track_inventory_qty, false)`, id).Scan(&stockPretax)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load invoice lines.", "ERR_INTERNAL")
			return
		}
		expensePretax := subtotal - stockPretax
		if expensePretax < 0 {
			expensePretax = 0
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		var lines []invoicejournal.Line
		if policy.InventoryGLHybridEnabled {
			if stockPretax > 0.0001 {
				grniID, err := financedefaults.ResolveByRole(r.Context(), pool, tu.TenantID, financedefaults.RoleGRNI)
				if err != nil {
					response.Validation(w, map[string]string{
						"grni_account_id": "Map GRNI under Chart of Accounts defaults before posting purchases with inventory items.",
					})
					return
				}
				lines = append(lines, invoicejournal.Line{
					AccountID: grniID, Debit: stockPretax, Remark: "GRNI - " + invoiceNo,
				})
			}
			if expensePretax > 0.0001 {
				lines = append(lines, invoicejournal.Line{
					AccountID: body.PurchaseAccountID, Debit: expensePretax, Remark: "Purchase - " + invoiceNo,
				})
			}
		} else {
			lines = append(lines, invoicejournal.Line{
				AccountID: body.PurchaseAccountID, Debit: subtotal, Remark: "Purchase - " + invoiceNo,
			})
		}
		if taxTotal > 0 {
			if taxAcct, e := invoicejournal.ResolveAccountID(r.Context(), pool, tu.TenantID, inputVatCode); e == nil {
				lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Debit: taxTotal, Remark: "Input VAT - " + invoiceNo})
			}
		}
		whtTotal, err := sumWithholdingTaxAmounts(r.Context(), pool, tu.TenantID, "supplier_invoice", id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load withholding lines.", "ERR_INTERNAL")
			return
		}
		apCredit := grandTotal - whtTotal
		if apCredit < 0 {
			apCredit = 0
		}
		// Net A/P: vendor is owed grand total minus EWT withheld at source (mirrors PV net-pay logic).
		lines = append(lines, invoicejournal.Line{AccountID: body.WithdrawalAccountID, Credit: apCredit, PartyID: &partnerID, Remark: "A/P - " + invoiceNo})
		if whtTotal > 0.0001 {
			if whtAcct, e := invoicejournal.ResolveAccountID(r.Context(), pool, tu.TenantID, ewtPayableCode); e == nil {
				lines = append(lines, invoicejournal.Line{AccountID: whtAcct, Credit: whtTotal, PartyID: &partnerID, Remark: "EWT payable - " + invoiceNo})
			}
		}

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

// voidPurchaseInvoice implements the v1 "delete invoice" rule for supplier invoices:
// void the accounting voucher (cancel a draft JE, reverse a posted one), soft-delete
// the invoice with a reason for audit, and leave goods-receipt stock, serials and
// lots untouched.
func voidPurchaseInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return invoicevoid.Handler(pool, invoicevoid.Config{
		Table:         "fin_supplier_invoices",
		NumberColumn:  "invoice_no",
		JournalColumn: "invoice_journal_entry_id",
		DocumentType:  "fin_supplier_invoice",
		DisplayName:   "Supplier invoice",
		AuditAction:   "purchase.invoice.void",
		AuditTarget:   "fin_supplier_invoice",
		JournalRemark: func(invoiceNo string) string { return "Void purchase " + invoiceNo },
		Payments: []invoicevoid.PaymentBlocker{{
			Label: "payment voucher applications",
			Query: `select count(*) from public.fin_payment_applications a
				join public.fin_payment_vouchers p on p.id = a.payment_voucher_id
				where p.tenant_id = $1 and a.supplier_invoice_id = $2 and p.deleted_at is null`,
		}},
		// Goods-receipt slips only track invoiced qty (same rows the invoice edit
		// path rewrites), so detaching them re-opens the receipt for billing
		// without touching GR stock movements.
		ReleaseSlipsSQL: `delete from public.gr_goods_receipt_slip_lines where supplier_invoice_id = $1`,
	})
}

// syncPurchaseInvoiceJournalAfterBill ensures CoA defaults and syncs the purchase invoice JE
// after a Bill is confirmed (completed / e_approval). Same posting rules as PUT …/invoice.
func syncPurchaseInvoiceJournalAfterBill(ctx context.Context, pool *pgxpool.Pool, tenantID, userID, id int64) error {
	var invoiceDate time.Time
	var partnerID int64
	var subtotal, taxTotal, grandTotal, fees float64
	var invoiceNo, remark string
	var existingJE *int64
	var purchaseAccountID, withdrawalAccountID *int64
	err := pool.QueryRow(ctx, `
		select invoice_date, partner_id, subtotal::float8, tax_total::float8, grand_total::float8,
		  invoice_no, invoice_fees::float8, coalesce(invoice_remark, ''),
		  invoice_journal_entry_id, purchase_account_id, withdrawal_account_id
		from public.fin_supplier_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`,
		id, tenantID).Scan(
		&invoiceDate, &partnerID, &subtotal, &taxTotal, &grandTotal,
		&invoiceNo, &fees, &remark, &existingJE, &purchaseAccountID, &withdrawalAccountID)
	if err != nil {
		return errors.New("bill not found for invoice journal sync")
	}

	jeStatus, err := invoicejournal.EntryStatus(ctx, pool, tenantID, existingJE)
	if err != nil {
		return errors.New("failed to load journal entry status")
	}
	if jeStatus == "posted" {
		return nil
	}

	if purchaseAccountID == nil || *purchaseAccountID <= 0 {
		aid, e := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RolePurchase)
		if e != nil {
			return errors.New("map Purchase account under Chart of Accounts defaults before confirming a Bill")
		}
		purchaseAccountID = &aid
	}
	if withdrawalAccountID == nil || *withdrawalAccountID <= 0 {
		aid, e := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RolePayable)
		if e != nil {
			return errors.New("map Accounts Payable under Chart of Accounts defaults before confirming a Bill")
		}
		withdrawalAccountID = &aid
	}
	if !siAccountsExist(ctx, pool, tenantID, *purchaseAccountID, *withdrawalAccountID) {
		return errors.New("invalid purchase or payable account for Bill invoice journal")
	}

	var stockPretax float64
	if err := pool.QueryRow(ctx, `
		select coalesce(sum(sil.non_vat_total), 0)::float8
		from public.fin_supplier_invoice_lines sil
		left join public.inv_items i on i.id = sil.item_id
		where sil.supplier_invoice_id = $1
		  and coalesce(i.track_inventory_qty, false)`, id).Scan(&stockPretax); err != nil {
		return errors.New("failed to load invoice lines for journal")
	}
	expensePretax := subtotal - stockPretax
	if expensePretax < 0 {
		expensePretax = 0
	}

	policy, err := processpolicy.Load(ctx, pool, tenantID)
	if err != nil {
		return errors.New("failed to load process policies")
	}

	var lines []invoicejournal.Line
	if policy.InventoryGLHybridEnabled {
		if stockPretax > 0.0001 {
			grniID, e := financedefaults.ResolveByRole(ctx, pool, tenantID, financedefaults.RoleGRNI)
			if e != nil {
				return errors.New("map GRNI under Chart of Accounts defaults before posting purchases with inventory items")
			}
			lines = append(lines, invoicejournal.Line{
				AccountID: grniID, Debit: stockPretax, Remark: "GRNI - " + invoiceNo,
			})
		}
		if expensePretax > 0.0001 {
			lines = append(lines, invoicejournal.Line{
				AccountID: *purchaseAccountID, Debit: expensePretax, Remark: "Purchase - " + invoiceNo,
			})
		}
	} else {
		lines = append(lines, invoicejournal.Line{
			AccountID: *purchaseAccountID, Debit: subtotal, Remark: "Purchase - " + invoiceNo,
		})
	}
	if taxTotal > 0 {
		if taxAcct, e := invoicejournal.ResolveAccountID(ctx, pool, tenantID, inputVatCode); e == nil {
			lines = append(lines, invoicejournal.Line{AccountID: taxAcct, Debit: taxTotal, Remark: "Input VAT - " + invoiceNo})
		}
	}
	whtTotal, err := sumWithholdingTaxAmounts(ctx, pool, tenantID, "supplier_invoice", id)
	if err != nil {
		return errors.New("failed to load withholding lines")
	}
	apCredit := grandTotal - whtTotal
	if apCredit < 0 {
		apCredit = 0
	}
	lines = append(lines, invoicejournal.Line{AccountID: *withdrawalAccountID, Credit: apCredit, PartyID: &partnerID, Remark: "A/P - " + invoiceNo})
	if whtTotal > 0.0001 {
		if whtAcct, e := invoicejournal.ResolveAccountID(ctx, pool, tenantID, ewtPayableCode); e == nil {
			lines = append(lines, invoicejournal.Line{AccountID: whtAcct, Credit: whtTotal, PartyID: &partnerID, Remark: "EWT payable - " + invoiceNo})
		}
	}

	autoPost := siReadAutoPost(ctx, pool, tenantID, "accounts_auto_post_purchase")
	jeID, err := invoicejournal.Sync(ctx, pool, tenantID, userID, invoiceDate, "Purchase "+invoiceNo, existingJE, lines, autoPost)
	if err != nil {
		return errors.New("failed to build purchase invoice journal entry")
	}

	if _, err := pool.Exec(ctx, `
		update public.fin_supplier_invoices
		set purchase_account_id = $2, withdrawal_account_id = $3,
		    invoice_journal_entry_id = $4, updated_at = now()
		where id = $1 and tenant_id = $5`,
		id, *purchaseAccountID, *withdrawalAccountID, jeID, tenantID); err != nil {
		return errors.New("failed to save invoice journal link")
	}
	return nil
}

func siAccountsExist(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids ...int64) bool {
	for _, aid := range ids {
		var ok bool
		if err := pool.QueryRow(ctx, `select exists(select 1 from public.fin_accounts where id = $1 and tenant_id = $2 and is_active and deleted_at is null)`, aid, tenantID).Scan(&ok); err != nil || !ok {
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
