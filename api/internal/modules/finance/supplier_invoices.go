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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/fulfillment"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SupplierInvoiceLine struct {
	ID                  int64   `json:"id,omitempty"`
	LineNo              int     `json:"line_no"`
	GoodsReceiptLineID  *int64  `json:"goods_receipt_line_id,omitempty"`
	PurchaseOrderLineID *int64  `json:"purchase_order_line_id,omitempty"`
	ItemID              *int64  `json:"item_id,omitempty"`
	ItemCode            string  `json:"item_code,omitempty"`
	ItemName            string  `json:"item_name,omitempty"`
	Qty                 float64 `json:"qty"`
	UnitNonVat          float64 `json:"unit_non_vat"`
	NonVatTotal         float64 `json:"non_vat_total"`
	TaxAmount           float64 `json:"tax_amount"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
	LineTotal           float64 `json:"line_total"`
}

type SupplierInvoice struct {
	ID              int64                 `json:"id"`
	InvoiceDate     string                `json:"invoice_date"`
	DateSeq         int                   `json:"date_seq"`
	DateNoDisplay   string                `json:"date_no_display"`
	InvoiceNo       string                `json:"invoice_no"`
	PartnerID       int64                 `json:"partner_id"`
	VendorName      string                `json:"vendor_name"`
	CurrencyID      int64                 `json:"currency_id"`
	CurrencyCode    string                `json:"currency_code,omitempty"`
	VendorInvoiceNo *string               `json:"vendor_invoice_no,omitempty"`
	Reference       *string               `json:"reference,omitempty"`
	Notes           *string               `json:"notes,omitempty"`
	Subtotal        float64               `json:"subtotal"`
	TaxTotal        float64               `json:"tax_total"`
	GrandTotal      float64               `json:"grand_total"`
	CreatedByName   string                `json:"created_by_name,omitempty"`
	Lines           []SupplierInvoiceLine `json:"lines,omitempty"`
}

type supplierInvoiceLineBody struct {
	GoodsReceiptLineID *int64  `json:"goods_receipt_line_id"`
	Qty                float64 `json:"qty"`
	UnitNonVat         float64 `json:"unit_non_vat"`
	NonVatTotal        float64 `json:"non_vat_total"`
	TaxAmount          float64 `json:"tax_amount"`
	UnitVatInc         float64 `json:"unit_vat_inc"`
	LineTotal          float64 `json:"line_total"`
}

type supplierInvoiceBody struct {
	InvoiceDate     string                    `json:"invoice_date"`
	PartnerID       int64                     `json:"partner_id"`
	CurrencyID      int64                     `json:"currency_id"`
	VendorInvoiceNo *string                   `json:"vendor_invoice_no"`
	Reference       *string                   `json:"reference"`
	Notes           *string                   `json:"notes"`
	Lines           []supplierInvoiceLineBody `json:"lines"`
}

type openGRLineRow struct {
	GoodsReceiptLineID  int64   `json:"goods_receipt_line_id"`
	GoodsReceiptID      int64   `json:"goods_receipt_id"`
	PurchaseOrderLineID int64   `json:"purchase_order_line_id"`
	PurchaseOrderNo     string  `json:"purchase_order_no"`
	ItemID              int64   `json:"item_id"`
	ItemCode            string  `json:"item_code"`
	ItemName            string  `json:"item_name"`
	ReceivedQty         float64 `json:"received_qty"`
	BilledQty           float64 `json:"billed_qty"`
	BalanceQty          float64 `json:"balance_qty"`
	UnitNonVat          float64 `json:"unit_non_vat"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
}

func registerSupplierInvoiceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/supplier-invoices/preview-sequences", previewSupplierInvoiceSequences(pool))
	r.Get("/supplier-invoices/open-gr-lines", listOpenGRLines(pool))
	r.Get("/supplier-invoices", listSupplierInvoices(pool))
	r.Post("/supplier-invoices", createSupplierInvoice(pool))
	r.Get("/supplier-invoices/{id}", getSupplierInvoice(pool))
	r.Delete("/supplier-invoices/{id}", deleteSupplierInvoice(pool))
}

func previewSupplierInvoiceSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("invoice_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		invoiceDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"invoice_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var invoiceNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, invoice_no from public.preview_fin_supplier_invoice_sequences($1, $2::date)`,
			tu.TenantID, invoiceDate).Scan(&dateSeq, &invoiceNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"invoice_no":      invoiceNo,
			"date_no_display": formatDateNoDisplay(invoiceDate, dateSeq),
		}, "OK")
	}
}

func listOpenGRLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "gr.tenant_id = $1 and gr.status = 'posted'"
		args := []any{tu.TenantID}
		argN := 2
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and po.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}
		if gid, ok := optionalInt64Query(r, "goods_receipt_id"); ok {
			where += fmt.Sprintf(" and gr.id = $%d", argN)
			args = append(args, *gid)
			argN++
		}

		q := fmt.Sprintf(`
			select grl.id, gr.id, pol.id, po.purchase_order_no,
			  pol.item_id, pol.item_code, pol.item_name,
			  grl.received_qty::float8,
			  coalesce(sl.billed, 0)::float8,
			  (grl.received_qty - coalesce(sl.billed, 0))::float8,
			  pol.unit_non_vat::float8, pol.unit_vat_inc::float8
			from public.gr_goods_receipt_lines grl
			join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
			join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			left join (
			  select goods_receipt_line_id, sum(qty) as billed
			  from public.gr_goods_receipt_slip_lines
			  where slip_type = 'supplier_invoice'
			  group by goods_receipt_line_id
			) sl on sl.goods_receipt_line_id = grl.id
			where %s
			  and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001
			order by gr.receipt_date desc, grl.line_no`, where)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list open GR lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openGRLineRow
		for rows.Next() {
			var row openGRLineRow
			if err := rows.Scan(
				&row.GoodsReceiptLineID, &row.GoodsReceiptID, &row.PurchaseOrderLineID, &row.PurchaseOrderNo,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.ReceivedQty, &row.BilledQty, &row.BalanceQty,
				&row.UnitNonVat, &row.UnitVatInc,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read GR lines.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []openGRLineRow{}
		}
		response.OK(w, out, "OK")
	}
}

func listSupplierInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"invoice_date": "si.invoice_date",
		"invoice_no":   "si.invoice_no",
		"vendor_name":  "p.company_name",
		"grand_total":  "si.grand_total",
		"created_at":   "si.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "invoice_date", allowed)
		offset := httputil.Offset(p)

		where := "si.tenant_id = $1 and si.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(` and (si.invoice_no ilike $%d or p.company_name ilike $%d or coalesce(si.vendor_invoice_no, '') ilike $%d)`, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and si.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}

		q := fmt.Sprintf(`
			select si.id, si.invoice_date, si.date_seq, si.invoice_no,
			  si.partner_id, p.company_name, si.currency_id, c.currency_code,
			  si.vendor_invoice_no, si.grand_total::float8, count(*) over()
			from public.fin_supplier_invoices si
			join public.inv_partners p on p.id = si.partner_id
			join public.quo_currencies c on c.id = si.currency_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list supplier invoices.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SupplierInvoice
		var total int64
		for rows.Next() {
			var row SupplierInvoice
			var invoiceDate time.Time
			var vendorInvNo *string
			if err := rows.Scan(
				&row.ID, &invoiceDate, &row.DateSeq, &row.InvoiceNo,
				&row.PartnerID, &row.VendorName, &row.CurrencyID, &row.CurrencyCode,
				&vendorInvNo, &row.GrandTotal, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier invoices.", "ERR_INTERNAL")
				return
			}
			row.InvoiceDate = dateToStr(invoiceDate)
			row.DateNoDisplay = formatDateNoDisplay(invoiceDate, row.DateSeq)
			row.VendorInvoiceNo = vendorInvNo
			out = append(out, row)
		}
		if out == nil {
			out = []SupplierInvoice{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		inv, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier invoice not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, inv, "OK")
	}
}

func loadSupplierInvoice(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (SupplierInvoice, error) {
	var inv SupplierInvoice
	var invoiceDate time.Time
	var createdByName *string
	err := pool.QueryRow(ctx, `
		select si.id, si.invoice_date, si.date_seq, si.invoice_no,
		  si.partner_id, p.company_name, si.currency_id, c.currency_code,
		  si.vendor_invoice_no, si.reference, si.notes,
		  si.subtotal::float8, si.tax_total::float8, si.grand_total::float8,
		  u.full_name
		from public.fin_supplier_invoices si
		join public.inv_partners p on p.id = si.partner_id
		join public.quo_currencies c on c.id = si.currency_id
		left join public.users u on u.id = si.created_by_user_id
		where si.id = $1 and si.tenant_id = $2 and si.deleted_at is null`,
		id, tenantID).Scan(
		&inv.ID, &invoiceDate, &inv.DateSeq, &inv.InvoiceNo,
		&inv.PartnerID, &inv.VendorName, &inv.CurrencyID, &inv.CurrencyCode,
		&inv.VendorInvoiceNo, &inv.Reference, &inv.Notes,
		&inv.Subtotal, &inv.TaxTotal, &inv.GrandTotal, &createdByName,
	)
	if err != nil {
		return SupplierInvoice{}, err
	}
	inv.InvoiceDate = dateToStr(invoiceDate)
	inv.DateNoDisplay = formatDateNoDisplay(invoiceDate, inv.DateSeq)
	if createdByName != nil {
		inv.CreatedByName = *createdByName
	}

	rows, err := pool.Query(ctx, `
		select id, line_no, goods_receipt_line_id, purchase_order_line_id,
		  item_id, item_code, item_name,
		  qty::float8, unit_non_vat::float8, non_vat_total::float8,
		  tax_amount::float8, unit_vat_inc::float8, line_total::float8
		from public.fin_supplier_invoice_lines
		where supplier_invoice_id = $1
		order by line_no`, id)
	if err != nil {
		return SupplierInvoice{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln SupplierInvoiceLine
		if err := rows.Scan(
			&ln.ID, &ln.LineNo, &ln.GoodsReceiptLineID, &ln.PurchaseOrderLineID,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName,
			&ln.Qty, &ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount, &ln.UnitVatInc, &ln.LineTotal,
		); err != nil {
			return SupplierInvoice{}, err
		}
		inv.Lines = append(inv.Lines, ln)
	}
	if inv.Lines == nil {
		inv.Lines = []SupplierInvoiceLine{}
	}
	return inv, nil
}

func grLineBalance(ctx context.Context, tx pgx.Tx, tenantID, grLineID int64) (float64, int64, int64, error) {
	var receivedQty float64
	var poLineID int64
	var partnerID int64
	err := tx.QueryRow(ctx, `
		select grl.received_qty::float8, grl.purchase_order_line_id, po.partner_id
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		join public.po_purchase_orders po on po.id = pol.purchase_order_id
		where grl.id = $1 and gr.tenant_id = $2 and gr.status = 'posted'`,
		grLineID, tenantID).Scan(&receivedQty, &poLineID, &partnerID)
	if err != nil {
		return 0, 0, 0, err
	}
	var billed float64
	_ = tx.QueryRow(ctx, `
		select coalesce(sum(qty), 0)::float8
		from public.gr_goods_receipt_slip_lines
		where goods_receipt_line_id = $1 and slip_type = 'supplier_invoice'`, grLineID).Scan(&billed)
	return receivedQty - billed, poLineID, partnerID, nil
}

func validateSupplierInvoiceBody(body supplierInvoiceBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.InvoiceDate) == "" {
		errs["invoice_date"] = "Invoice date is required."
	}
	if body.PartnerID <= 0 {
		errs["partner_id"] = "Vendor is required."
	}
	if body.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	if len(body.Lines) == 0 {
		errs["lines"] = "At least one line is required."
	}
	for i, ln := range body.Lines {
		key := fmt.Sprintf("lines[%d]", i)
		if ln.Qty <= 0 {
			errs[key+".qty"] = "Quantity must be greater than zero."
		}
		if ln.LineTotal <= 0 {
			errs[key+".line_total"] = "Line total must be greater than zero."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func validateSupplierInvoiceLines(ctx context.Context, tx pgx.Tx, tenantID, partnerID int64, requireGR bool, lines []supplierInvoiceLineBody) map[string]string {
	errs := map[string]string{}
	seenGR := map[int64]bool{}
	for i, ln := range lines {
		key := fmt.Sprintf("lines[%d]", i)
		if requireGR && (ln.GoodsReceiptLineID == nil || *ln.GoodsReceiptLineID <= 0) {
			errs[key+".goods_receipt_line_id"] = "Goods receipt line is required."
			continue
		}
		if ln.GoodsReceiptLineID == nil || *ln.GoodsReceiptLineID <= 0 {
			continue
		}
		if seenGR[*ln.GoodsReceiptLineID] {
			errs[key+".goods_receipt_line_id"] = "Duplicate goods receipt line."
			continue
		}
		seenGR[*ln.GoodsReceiptLineID] = true
		balance, _, linePartnerID, err := grLineBalance(ctx, tx, tenantID, *ln.GoodsReceiptLineID)
		if err != nil {
			errs[key+".goods_receipt_line_id"] = "Goods receipt line not found or not posted."
			continue
		}
		if linePartnerID != partnerID {
			errs[key+".goods_receipt_line_id"] = "Vendor does not match purchase order."
		}
		if ln.Qty > balance+0.0001 {
			errs[key+".qty"] = fmt.Sprintf("Quantity exceeds GR balance (%.4f).", balance)
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func sumSupplierInvoiceTotals(lines []supplierInvoiceLineBody) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.NonVatTotal
		taxTotal += ln.TaxAmount
		grandTotal += ln.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func createSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body supplierInvoiceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSupplierInvoiceBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		invoiceDate, err := parseDate(body.InvoiceDate)
		if err != nil {
			response.Validation(w, map[string]string{"invoice_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if errs := validateSupplierInvoiceLines(r.Context(), tx, tu.TenantID, body.PartnerID, policy.PurchaseRequireGRBeforeSupplierInv, body.Lines); errs != nil {
			response.Validation(w, errs)
			return
		}

		subtotal, taxTotal, grandTotal := sumSupplierInvoiceTotals(body.Lines)

		var dateSeq int
		var invoiceNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, invoice_no from public.allocate_fin_supplier_invoice_sequences($1, $2::date)`,
			tu.TenantID, invoiceDate).Scan(&dateSeq, &invoiceNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_supplier_invoices (
			  tenant_id, invoice_date, date_seq, invoice_no,
			  partner_id, currency_id, vendor_invoice_no, reference, notes,
			  subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			returning id`,
			tu.TenantID, invoiceDate, dateSeq, invoiceNo,
			body.PartnerID, body.CurrencyID, body.VendorInvoiceNo, body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert supplier invoice.", "ERR_INTERNAL")
			return
		}

		dateNoDisplay := formatDateNoDisplay(invoiceDate, dateSeq)
		for i, ln := range body.Lines {
			lineNo := i + 1
			var itemID *int64
			var itemCode, itemName string
			var poLineID *int64
			if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
				_, polID, _, err := grLineBalance(r.Context(), tx, tu.TenantID, *ln.GoodsReceiptLineID)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to resolve GR line.", "ERR_INTERNAL")
					return
				}
				poLineID = &polID
				_ = tx.QueryRow(r.Context(), `
					select pol.item_id, pol.item_code, pol.item_name
					from public.po_purchase_order_lines pol where pol.id = $1`, polID).Scan(&itemID, &itemCode, &itemName)
			}

			var lineID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.fin_supplier_invoice_lines (
				  supplier_invoice_id, line_no, goods_receipt_line_id, purchase_order_line_id,
				  item_id, item_code, item_name, qty,
				  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
				returning id`,
				id, lineNo, ln.GoodsReceiptLineID, poLineID,
				itemID, itemCode, itemName, ln.Qty,
				ln.UnitNonVat, ln.NonVatTotal, ln.TaxAmount, ln.UnitVatInc, ln.LineTotal).Scan(&lineID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
				return
			}

			if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
				_, err = tx.Exec(r.Context(), `
					insert into public.gr_goods_receipt_slip_lines (
					  goods_receipt_line_id, slip_type, slip_ref, slip_date_no, qty, supplier_invoice_id
					) values ($1, 'supplier_invoice', $2, $3, $4, $5)`,
					*ln.GoodsReceiptLineID, invoiceNo, dateNoDisplay, ln.Qty, id)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to save GR slip line.", "ERR_INTERNAL")
					return
				}
				if poLineID != nil {
					if err := fulfillment.SyncPOLineBilledQty(r.Context(), tx, *poLineID); err != nil {
						response.Err(w, http.StatusInternalServerError, "Failed to sync billed qty.", "ERR_INTERNAL")
						return
					}
				}
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.create", "fin_supplier_invoice", &id, nil, body)
		inv, _ := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		response.OK(w, inv, "Created.")
	}
}

func deleteSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_supplier_invoices", "finance.supplier_invoice.delete", "fin_supplier_invoice")
	}
}

func supplierInvoiceOutstanding(ctx context.Context, pool *pgxpool.Pool, tenantID, invoiceID int64, excludePaymentID *int64) (float64, error) {
	var grandTotal float64
	err := pool.QueryRow(ctx, `
		select grand_total::float8 from public.fin_supplier_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null`, invoiceID, tenantID).Scan(&grandTotal)
	if err != nil {
		return 0, err
	}
	q := `
		select coalesce(sum(a.applied_amount), 0)::float8
		from public.fin_payment_applications a
		join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		where a.supplier_invoice_id = $1 and pv.tenant_id = $2 and pv.deleted_at is null`
	args := []any{invoiceID, tenantID}
	if excludePaymentID != nil {
		q += ` and pv.id <> $3`
		args = append(args, *excludePaymentID)
	}
	var applied float64
	if err := pool.QueryRow(ctx, q, args...).Scan(&applied); err != nil {
		return 0, err
	}
	return grandTotal - applied, nil
}
