package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type vendorCreditLine struct {
	ID        int64   `json:"id,omitempty"`
	LineNo    int     `json:"line_no"`
	ItemID    *int64  `json:"item_id,omitempty"`
	ItemCode  string  `json:"item_code"`
	ItemName  string  `json:"item_name"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	TaxAmount float64 `json:"tax_amount"`
	Amount    float64 `json:"amount"`
}

type vendorCreditRow struct {
	ID                      int64              `json:"id"`
	CreditDate              string             `json:"credit_date"`
	CreditNo                string             `json:"credit_no"`
	PartnerID               *int64             `json:"partner_id,omitempty"`
	VendorName              string             `json:"vendor_name"`
	SourceSupplierInvoiceID *int64             `json:"source_supplier_invoice_id,omitempty"`
	AmountTotal             float64            `json:"amount_total"`
	RemainingAmount         float64            `json:"remaining_amount"`
	Status                  string             `json:"status"`
	Reason                  string             `json:"reason"`
	Notes                   string             `json:"notes"`
	RefundedAt              *string            `json:"refunded_at,omitempty"`
	RefundMethod            *string            `json:"refund_method,omitempty"`
	RefundReference         *string            `json:"refund_reference,omitempty"`
	RefundOfficialReceiptID *int64             `json:"refund_official_receipt_id,omitempty"`
	JournalEntryID          *int64             `json:"journal_entry_id,omitempty"`
	Lines                   []vendorCreditLine `json:"lines,omitempty"`
}

type vendorCreditBody struct {
	CreditDate              string             `json:"credit_date"`
	PartnerID               *int64             `json:"partner_id"`
	VendorName              string             `json:"vendor_name"`
	SourceSupplierInvoiceID *int64             `json:"source_supplier_invoice_id"`
	AmountTotal             float64            `json:"amount_total"`
	Reason                  string             `json:"reason"`
	Notes                   string             `json:"notes"`
	Status                  string             `json:"status"`
	Lines                   []vendorCreditLine `json:"lines"`
}

type vendorCreditApplyBody struct {
	SupplierInvoiceID int64   `json:"supplier_invoice_id"`
	AppliedAmount     float64 `json:"applied_amount"`
}

type vendorCreditRefundBody struct {
	RefundMethod    string `json:"refund_method"`
	RefundReference string `json:"refund_reference"`
	BankAccountID   *int64 `json:"bank_account_id"`
}

func registerVendorCreditRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.vendor_credits", auth.AccessRead)).Get("/vendor-credits", listVendorCredits(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits", createVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits/backfill-journals", backfillVendorCreditJournals(pool))
	r.With(auth.RequirePermission("finance.vendor_credits", auth.AccessRead)).Get("/vendor-credits/{id}", getVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits", auth.AccessRead)).Get("/vendor-credits/{id}/print", getVendorCreditPrint(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Patch("/vendor-credits/{id}", updateVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits/{id}/post", postVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits/{id}/apply", applyVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits/{id}/convert-to-cash", convertVendorCreditToCash(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Post("/vendor-credits/{id}/cancel", cancelVendorCredit(pool))
	r.With(auth.RequirePermission("finance.vendor_credits", auth.AccessRead)).Get("/vendor-credits/{id}/applications", listVendorCreditApplications(pool))
	r.With(auth.RequirePermission("finance.vendor_credits_write", auth.AccessWrite)).Delete("/vendor-credits/{id}", softDeleteVendorCredit(pool))
}

func getVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadVendorCredit(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Vendor credit not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func loadVendorCredit(ctx context.Context, q pgxQueryable, tenantID, id int64) (vendorCreditRow, error) {
	var row vendorCreditRow
	err := q.QueryRow(ctx, `
		select c.id, c.credit_date::text, c.credit_no, c.partner_id, c.vendor_name, c.source_supplier_invoice_id,
		  c.amount_total::float8, c.remaining_amount::float8, c.status, c.reason, c.notes,
		  c.refunded_at::text, c.refund_method, c.refund_reference, c.refund_official_receipt_id, c.journal_entry_id
		from public.fin_vendor_credits c
		where c.id = $1 and c.tenant_id = $2 and c.deleted_at is null`, id, tenantID).Scan(
		&row.ID, &row.CreditDate, &row.CreditNo, &row.PartnerID, &row.VendorName, &row.SourceSupplierInvoiceID,
		&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Reason, &row.Notes,
		&row.RefundedAt, &row.RefundMethod, &row.RefundReference, &row.RefundOfficialReceiptID, &row.JournalEntryID,
	)
	if err != nil {
		return vendorCreditRow{}, err
	}
	lines, err := loadVendorCreditLines(ctx, q, id)
	if err != nil {
		return vendorCreditRow{}, err
	}
	row.Lines = lines
	return row, nil
}

func loadVendorCreditLines(ctx context.Context, q pgxQueryable, vendorCreditID int64) ([]vendorCreditLine, error) {
	rows, err := q.Query(ctx, `
		select id, line_no, item_id, item_code, item_name, qty::float8, unit_price::float8, tax_amount::float8, amount::float8
		from public.fin_vendor_credit_lines
		where vendor_credit_id = $1
		order by line_no, id`, vendorCreditID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []vendorCreditLine{}
	for rows.Next() {
		var line vendorCreditLine
		if err := rows.Scan(&line.ID, &line.LineNo, &line.ItemID, &line.ItemCode, &line.ItemName,
			&line.Qty, &line.UnitPrice, &line.TaxAmount, &line.Amount); err != nil {
			return nil, err
		}
		out = append(out, line)
	}
	return out, rows.Err()
}

func saveVendorCreditLines(ctx context.Context, tx pgx.Tx, vendorCreditID int64, lines []vendorCreditLine) error {
	if _, err := tx.Exec(ctx, `delete from public.fin_vendor_credit_lines where vendor_credit_id = $1`, vendorCreditID); err != nil {
		return err
	}
	for i, line := range lines {
		lineNo := line.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		qty := line.Qty
		if qty <= 0 {
			qty = 1
		}
		amount := vendorLineAmount(line)
		_, err := tx.Exec(ctx, `
			insert into public.fin_vendor_credit_lines (
			  vendor_credit_id, line_no, item_id, item_code, item_name, qty, unit_price, tax_amount, amount
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
			vendorCreditID, lineNo, line.ItemID,
			strings.TrimSpace(line.ItemCode), strings.TrimSpace(line.ItemName),
			qty, line.UnitPrice, line.TaxAmount, amount)
		if err != nil {
			return err
		}
	}
	return nil
}

func vendorLineAmount(line vendorCreditLine) float64 {
	if line.Amount > 0 {
		return line.Amount
	}
	qty := line.Qty
	if qty <= 0 {
		qty = 1
	}
	return qty*line.UnitPrice + line.TaxAmount
}

func sumVendorCreditLineAmount(lines []vendorCreditLine) float64 {
	var total float64
	for _, line := range lines {
		total += vendorLineAmount(line)
	}
	return total
}

func resolveVendorCreditAmount(body vendorCreditBody) (float64, error) {
	if len(body.Lines) > 0 {
		total := sumVendorCreditLineAmount(body.Lines)
		if total < 0 {
			return 0, fmt.Errorf("line amounts must be >= 0")
		}
		return total, nil
	}
	if body.AmountTotal < 0 {
		return 0, fmt.Errorf("amount must be >= 0")
	}
	return body.AmountTotal, nil
}

func listVendorCredits(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		where := "c.tenant_id = $1 and c.deleted_at is null"
		args := []any{tu.TenantID}
		n := 2
		if status != "" {
			where += fmt.Sprintf(" and c.status = $%d", n)
			args = append(args, status)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (c.credit_no ilike $%d or c.vendor_name ilike $%d or c.reason ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select c.id, c.credit_date::text, c.credit_no, c.partner_id, c.vendor_name, c.source_supplier_invoice_id,
			  c.amount_total::float8, c.remaining_amount::float8, c.status, c.reason, c.notes,
			  c.refunded_at::text, c.refund_method, c.refund_reference, c.refund_official_receipt_id, c.journal_entry_id
			from public.fin_vendor_credits c
			where %s
			order by c.credit_date desc, c.id desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list vendor credits. Apply migration 249 if needed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []vendorCreditRow{}
		for rows.Next() {
			var row vendorCreditRow
			if err := rows.Scan(&row.ID, &row.CreditDate, &row.CreditNo, &row.PartnerID, &row.VendorName, &row.SourceSupplierInvoiceID,
				&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Reason, &row.Notes,
				&row.RefundedAt, &row.RefundMethod, &row.RefundReference, &row.RefundOfficialReceiptID, &row.JournalEntryID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read vendor credits.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body vendorCreditBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		amountTotal, err := resolveVendorCreditAmount(body)
		if err != nil {
			response.Validation(w, map[string]string{"amount_total": err.Error()})
			return
		}
		creditDate := time.Now()
		if strings.TrimSpace(body.CreditDate) != "" {
			d, err := time.Parse("2006-01-02", strings.TrimSpace(body.CreditDate))
			if err != nil {
				response.Validation(w, map[string]string{"credit_date": "Invalid date. Use YYYY-MM-DD."})
				return
			}
			creditDate = d
		}
		vendor := strings.TrimSpace(body.VendorName)
		if vendor == "" && body.PartnerID != nil {
			_ = pool.QueryRow(r.Context(), `select coalesce(company_name, '') from public.inv_partners where id = $1 and tenant_id = $2`,
				*body.PartnerID, tu.TenantID).Scan(&vendor)
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create vendor credit.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.fin_vendor_credits
			where tenant_id = $1 and credit_date = $2::date`, tu.TenantID, creditDate.Format("2006-01-02")).Scan(&seq)
		if seq <= 0 {
			seq = 1
		}
		creditNo := fmt.Sprintf("VC-%s-%d", creditDate.Format("20060102"), seq)
		status := "draft"
		if body.Status == "open" {
			status = "open"
		}
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_vendor_credits (
			  tenant_id, credit_date, date_seq, credit_no, partner_id, vendor_name, source_supplier_invoice_id,
			  amount_total, remaining_amount, status, reason, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $8, $9, $10, $11, $12)
			returning id`,
			tu.TenantID, creditDate.Format("2006-01-02"), seq, creditNo, body.PartnerID, vendor, body.SourceSupplierInvoiceID,
			amountTotal, status, strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create vendor credit.", "ERR_INTERNAL")
			return
		}
		if len(body.Lines) > 0 {
			if err := saveVendorCreditLines(r.Context(), tx, id, body.Lines); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
				return
			}
		}
		if status == "open" {
			if err := postVendorCreditJournal(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
				response.Err(w, http.StatusBadRequest, "Vendor credit journal failed: "+err.Error(), "ERR_BAD_REQUEST")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create vendor credit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "vendor_credit.create", "vendor_credit", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "credit_no": creditNo}, "Vendor credit created.")
	}
}

func updateVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body vendorCreditBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		amountTotal, err := resolveVendorCreditAmount(body)
		if err != nil {
			response.Validation(w, map[string]string{"amount_total": err.Error()})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.fin_vendor_credits set
			  vendor_name = coalesce(nullif($3, ''), vendor_name),
			  partner_id = coalesce($4, partner_id),
			  reason = coalesce(nullif($5, ''), reason),
			  notes = coalesce(nullif($6, ''), notes),
			  amount_total = case when status = 'draft' and $7::numeric >= 0 then $7 else amount_total end,
			  remaining_amount = case when status = 'draft' and $7::numeric >= 0 then $7 else remaining_amount end,
			  updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status in ('draft', 'open')`,
			id, tu.TenantID, strings.TrimSpace(body.VendorName), body.PartnerID,
			strings.TrimSpace(body.Reason), strings.TrimSpace(body.Notes), amountTotal)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Vendor credit not found or not editable.", "ERR_NOT_FOUND")
			return
		}
		if len(body.Lines) > 0 {
			var curStatus string
			_ = tx.QueryRow(r.Context(), `select status from public.fin_vendor_credits where id = $1`, id).Scan(&curStatus)
			if curStatus == "draft" {
				if err := saveVendorCreditLines(r.Context(), tx, id, body.Lines); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
					return
				}
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		response.OK(w, nil, "Updated.")
	}
}

func postVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post vendor credit.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		tag, err := tx.Exec(r.Context(), `
			update public.fin_vendor_credits
			set status = 'open', remaining_amount = amount_total, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusBadRequest, "Only draft vendor credits can be posted.", "ERR_BAD_REQUEST")
			return
		}
		if err := postVendorCreditJournal(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
			response.Err(w, http.StatusBadRequest, "Vendor credit journal failed: "+err.Error(), "ERR_BAD_REQUEST")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, nil, "Vendor credit opened.")
	}
}

func applyVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body vendorCreditApplyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.SupplierInvoiceID <= 0 || body.AppliedAmount <= 0 {
			response.Validation(w, map[string]string{"supplier_invoice_id": "Supplier invoice and amount are required."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var remaining float64
		var status string
		err = tx.QueryRow(r.Context(), `
			select remaining_amount::float8, status from public.fin_vendor_credits
			where id = $1 and tenant_id = $2 and deleted_at is null for update`, id, tu.TenantID).Scan(&remaining, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Vendor credit not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "open" && status != "applied" {
			response.Err(w, http.StatusBadRequest, "Vendor credit must be open to apply.", "ERR_BAD_REQUEST")
			return
		}
		if body.AppliedAmount > remaining+0.0001 {
			response.Validation(w, map[string]string{"applied_amount": "Amount exceeds remaining credit."})
			return
		}
		var locked float64
		err = tx.QueryRow(r.Context(), `
			select grand_total::float8 from public.fin_supplier_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, body.SupplierInvoiceID, tu.TenantID).Scan(&locked)
		if err != nil {
			response.Validation(w, map[string]string{"supplier_invoice_id": "Supplier invoice not found."})
			return
		}
		_ = locked
		outstanding, err := supplierInvoiceOutstandingQ(r.Context(), tx, tu.TenantID, body.SupplierInvoiceID, nil)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to compute outstanding.", "ERR_INTERNAL")
			return
		}
		if body.AppliedAmount > outstanding+0.0001 {
			response.Validation(w, map[string]string{
				"applied_amount": fmt.Sprintf("Amount exceeds invoice outstanding (%.4f).", outstanding),
			})
			return
		}
		_, err = tx.Exec(r.Context(), `
			insert into public.fin_vendor_credit_applications (vendor_credit_id, supplier_invoice_id, applied_amount)
			values ($1, $2, $3)
			on conflict (vendor_credit_id, supplier_invoice_id) do update
			  set applied_amount = fin_vendor_credit_applications.applied_amount + excluded.applied_amount`,
			id, body.SupplierInvoiceID, body.AppliedAmount)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply vendor credit.", "ERR_INTERNAL")
			return
		}
		newRem := remaining - body.AppliedAmount
		newStatus := "open"
		if newRem <= 0.0001 {
			newRem = 0
			newStatus = "applied"
		}
		_, err = tx.Exec(r.Context(), `
			update public.fin_vendor_credits set remaining_amount = $3, status = $4, updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, newRem, newStatus)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update vendor credit.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"remaining_amount": newRem, "status": newStatus}, "Vendor credit applied to supplier invoice.")
	}
}

func convertVendorCreditToCash(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body vendorCreditRefundBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		method := strings.TrimSpace(body.RefundMethod)
		if method == "" {
			method = "cash"
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var remaining float64
		var vendorName string
		var partnerID *int64
		var creditNo string
		err = tx.QueryRow(r.Context(), `
			select remaining_amount::float8, vendor_name, partner_id, credit_no
			from public.fin_vendor_credits
			where id = $1 and tenant_id = $2 and deleted_at is null
			  and status in ('open', 'applied') and remaining_amount > 0
			for update`, id, tu.TenantID).Scan(&remaining, &vendorName, &partnerID, &creditNo)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Only open vendor credit with remaining balance can convert to cash.", "ERR_BAD_REQUEST")
			return
		}
		today := time.Now().Format("2006-01-02")
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.fin_official_receipts
			where tenant_id = $1 and receipt_date = $2::date and deleted_at is null`, tu.TenantID, today).Scan(&seq)
		if seq <= 0 {
			seq = 1
		}
		receiptNo := fmt.Sprintf("OR-%s-%d", time.Now().Format("20060102"), seq)
		var orID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_official_receipts (
			  tenant_id, receipt_date, date_seq, receipt_no,
			  partner_id, payment_method, reference_no, notes,
			  amount_total, created_by_user_id, accounting_slip_no
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			returning id`,
			tu.TenantID, today, seq, receiptNo, partnerID, method,
			strings.TrimSpace(body.RefundReference),
			fmt.Sprintf("Vendor refund received for %s", creditNo),
			remaining, tu.AppUserID, "CR "+receiptNo,
		).Scan(&orID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create official receipt for vendor refund.", "ERR_INTERNAL")
			return
		}
		_, err = tx.Exec(r.Context(), `
			update public.fin_vendor_credits set
			  status = 'refunded',
			  remaining_amount = 0,
			  refunded_at = now(),
			  refund_method = $3,
			  refund_reference = nullif($4, ''),
			  refund_official_receipt_id = $5,
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, method, strings.TrimSpace(body.RefundReference), orID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update vendor credit.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "vendor_credit.convert_to_cash", "vendor_credit", &id, nil, nil)
		response.OK(w, map[string]any{
			"official_receipt_id": orID,
			"receipt_no":          receiptNo,
			"amount":              remaining,
			"vendor_name":         vendorName,
		}, "Vendor credit converted to cash (official receipt created).")
	}
}

func softDeleteVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_vendor_credits", "vendor_credit.delete", "vendor_credit")
	}
}

func cancelVendorCredit(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var jeID *int64
		var status string
		var remaining, total float64
		err = pool.QueryRow(r.Context(), `
			select journal_entry_id, status, remaining_amount::float8, amount_total::float8
			from public.fin_vendor_credits
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&jeID, &status, &remaining, &total)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Vendor credit not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" && status != "open" {
			response.Err(w, http.StatusBadRequest, "Only unapplied draft/open vendor credits can be cancelled.", "ERR_BAD_REQUEST")
			return
		}
		if remaining != total {
			response.Err(w, http.StatusBadRequest, "Only unapplied draft/open vendor credits can be cancelled.", "ERR_BAD_REQUEST")
			return
		}
		posted, err := creditHasPostedJournal(r.Context(), pool, tu.TenantID, jeID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check journal.", "ERR_INTERNAL")
			return
		}
		if posted {
			response.Err(w, http.StatusBadRequest, "Cannot cancel: linked journal entry is posted. Reverse the journal first.", "ERR_BAD_REQUEST")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_vendor_credits
			set status = 'cancelled', updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null
			  and status in ('draft', 'open')
			  and remaining_amount = amount_total`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusBadRequest, "Only unapplied draft/open vendor credits can be cancelled.", "ERR_BAD_REQUEST")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "vendor_credit.cancel", "vendor_credit", &id, nil, nil)
		response.OK(w, nil, "Vendor credit cancelled.")
	}
}

func backfillVendorCreditJournals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id from public.fin_vendor_credits
			where tenant_id = $1 and deleted_at is null and status = 'open'
			  and journal_entry_id is null and amount_total > 0.0001
			order by id
			limit 500`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list vendor credits needing journals.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var ids []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read vendor credit ids.", "ERR_INTERNAL")
				return
			}
			ids = append(ids, id)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read vendor credit ids.", "ERR_INTERNAL")
			return
		}
		posted := 0
		var failures []map[string]any
		for _, id := range ids {
			tx, err := pool.Begin(r.Context())
			if err != nil {
				failures = append(failures, map[string]any{"id": id, "error": err.Error()})
				continue
			}
			if err := postVendorCreditJournal(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
				_ = tx.Rollback(r.Context())
				failures = append(failures, map[string]any{"id": id, "error": err.Error()})
				continue
			}
			if err := tx.Commit(r.Context()); err != nil {
				failures = append(failures, map[string]any{"id": id, "error": err.Error()})
				continue
			}
			posted++
		}
		response.OK(w, map[string]any{"posted": posted, "scanned": len(ids), "failures": failures}, "Vendor credit journal backfill complete.")
	}
}

func listVendorCreditApplications(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var ok bool
		_ = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.fin_vendor_credits where id = $1 and tenant_id = $2 and deleted_at is null)`,
			id, tu.TenantID).Scan(&ok)
		if !ok {
			response.Err(w, http.StatusNotFound, "Vendor credit not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.supplier_invoice_id, si.invoice_no, a.applied_amount::float8, a.created_at::text
			from public.fin_vendor_credit_applications a
			join public.fin_supplier_invoices si on si.id = a.supplier_invoice_id
			where a.vendor_credit_id = $1
			order by a.created_at desc, a.id desc`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list applications.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type appRow struct {
			ID                int64   `json:"id"`
			SupplierInvoiceID int64   `json:"supplier_invoice_id"`
			InvoiceNo         string  `json:"invoice_no"`
			AppliedAmount     float64 `json:"applied_amount"`
			CreatedAt         string  `json:"created_at"`
		}
		out := []appRow{}
		for rows.Next() {
			var row appRow
			if err := rows.Scan(&row.ID, &row.SupplierInvoiceID, &row.InvoiceNo, &row.AppliedAmount, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read applications.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}
