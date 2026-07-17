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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/documentlifecycle"
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
	Description         *string `json:"description,omitempty"`
	Qty                 float64 `json:"qty"`
	UnitNonVat          float64 `json:"unit_non_vat"`
	NonVatTotal         float64 `json:"non_vat_total"`
	TaxAmount           float64 `json:"tax_amount"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
	LineTotal           float64 `json:"line_total"`
	Remark              *string `json:"remark,omitempty"`
	TrackSerial         bool    `json:"track_serial,omitempty"`
}

type SupplierInvoice struct {
	ID              int64                 `json:"id"`
	InvoiceDate     string                `json:"invoice_date"`
	DateSeq         int                   `json:"date_seq"`
	DateNoDisplay   string                `json:"date_no_display"`
	InvoiceNo       string                `json:"invoice_no"`
	TaxTypeID       *int64                `json:"tax_type_id,omitempty"`
	TaxTypeName     string                `json:"tax_type_name,omitempty"`
	PartnerID       int64                 `json:"partner_id"`
	VendorName      string                `json:"vendor_name"`
	CurrencyID      int64                 `json:"currency_id"`
	CurrencyCode    string                `json:"currency_code,omitempty"`
	PicUserID       *int64                `json:"pic_user_id,omitempty"`
	PicName         string                `json:"pic_name,omitempty"`
	LocationID      *int64                `json:"location_id,omitempty"`
	LocationName    string                `json:"location_name,omitempty"`
	ProjectID       *int64                `json:"project_id,omitempty"`
	ProjectName     *string               `json:"project_name,omitempty"`
	DueDate         *string               `json:"due_date,omitempty"`
	TermsOfPayment  *string               `json:"terms_of_payment,omitempty"`
	PaymentTerms    *string               `json:"payment_terms,omitempty"`
	VendorInvoiceNo *string               `json:"vendor_invoice_no,omitempty"`
	Reference       *string               `json:"reference,omitempty"`
	Notes           *string               `json:"notes,omitempty"`
	Subtotal        float64               `json:"subtotal"`
	TaxTotal        float64               `json:"tax_total"`
	GrandTotal      float64               `json:"grand_total"`
	PaidAmount      float64               `json:"paid_amount,omitempty"`
	Balance         float64               `json:"balance,omitempty"`
	PaymentStatus   string                `json:"payment_status,omitempty"`
	ProgressStatus  string                `json:"progress_status"`
	CreatedByName   string                `json:"created_by_name,omitempty"`
	Lines           []SupplierInvoiceLine `json:"lines,omitempty"`
}

type supplierInvoiceLineBody struct {
	LineNo              int     `json:"line_no"`
	GoodsReceiptLineID  *int64  `json:"goods_receipt_line_id"`
	PurchaseOrderLineID *int64  `json:"purchase_order_line_id"`
	ItemID              *int64  `json:"item_id"`
	ItemCode            string  `json:"item_code"`
	ItemName            string  `json:"item_name"`
	Description         *string `json:"description"`
	Qty                 float64 `json:"qty"`
	UnitPrice           float64 `json:"unit_price"`
	InputBasis          string  `json:"input_basis"`
	UnitNonVat          float64 `json:"unit_non_vat"`
	NonVatTotal         float64 `json:"non_vat_total"`
	TaxAmount           float64 `json:"tax_amount"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
	LineTotal           float64 `json:"line_total"`
	Remark              *string `json:"remark"`
}

type supplierInvoiceBody struct {
	InvoiceDate     string                    `json:"invoice_date"`
	TaxTypeID       int64                     `json:"tax_type_id"`
	PartnerID       int64                     `json:"partner_id"`
	CurrencyID      int64                     `json:"currency_id"`
	PicUserID       *int64                    `json:"pic_user_id"`
	PicName         string                    `json:"pic_name"`
	LocationID      int64                     `json:"location_id"`
	ProjectID       *int64                    `json:"project_id"`
	ProjectName     *string                   `json:"project_name"`
	DueDate         *string                   `json:"due_date"`
	TermsOfPayment  *string                   `json:"terms_of_payment"`
	PaymentTerms    *string                   `json:"payment_terms"`
	VendorInvoiceNo *string                   `json:"vendor_invoice_no"`
	Reference       *string                   `json:"reference"`
	Notes           *string                   `json:"notes"`
	ProgressStatus  string                    `json:"progress_status"`
	Lines           []supplierInvoiceLineBody `json:"lines"`
}

type openPOLineRow struct {
	PurchaseOrderLineID int64   `json:"purchase_order_line_id"`
	PurchaseOrderID     int64   `json:"purchase_order_id"`
	PurchaseOrderNo     string  `json:"purchase_order_no"`
	ItemID              int64   `json:"item_id"`
	ItemCode            string  `json:"item_code"`
	ItemName            string  `json:"item_name"`
	OrderedQty          float64 `json:"ordered_qty"`
	BilledQty           float64 `json:"billed_qty"`
	BalanceQty          float64 `json:"balance_qty"`
	UnitNonVat          float64 `json:"unit_non_vat"`
	UnitVatInc          float64 `json:"unit_vat_inc"`
	TrackSerial         bool    `json:"track_serial,omitempty"`
}

func listOpenPOLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := `po.tenant_id = $1 and po.deleted_at is null
			and po.status in ('confirmed', 'partially_received', 'received')`
		args := []any{tu.TenantID}
		argN := 2
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and po.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}
		if poid, ok := optionalInt64Query(r, "purchase_order_id"); ok {
			where += fmt.Sprintf(" and po.id = $%d", argN)
			args = append(args, *poid)
			argN++
		}

		q := fmt.Sprintf(`
			select pol.id, po.id, po.purchase_order_no,
			  pol.item_id, pol.item_code, pol.item_name,
			  pol.qty::float8, coalesce(pol.billed_qty, 0)::float8,
			  (pol.qty - coalesce(pol.billed_qty, 0))::float8,
			  pol.unit_non_vat::float8, pol.unit_vat_inc::float8,
			  coalesce(i.track_serial, false)
			from public.po_purchase_order_lines pol
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			left join public.inv_items i on i.id = pol.item_id
			where %s
			  and (pol.qty - coalesce(pol.billed_qty, 0)) > 0.0001
			order by po.order_date desc, pol.line_no`, where)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list open PO lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openPOLineRow
		for rows.Next() {
			var row openPOLineRow
			if err := rows.Scan(
				&row.PurchaseOrderLineID, &row.PurchaseOrderID, &row.PurchaseOrderNo,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.OrderedQty, &row.BilledQty, &row.BalanceQty,
				&row.UnitNonVat, &row.UnitVatInc, &row.TrackSerial,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read PO lines.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []openPOLineRow{}
		}
		response.OK(w, out, "OK")
	}
}

type openSupplierQuotationInvoiceLineRow struct {
	PurchaseOrderLineID     int64   `json:"purchase_order_line_id"`
	PurchaseOrderID         int64   `json:"purchase_order_id"`
	PurchaseOrderNo         string  `json:"purchase_order_no"`
	SupplierQuotationID     int64   `json:"supplier_quotation_id"`
	SupplierQuotationLineID int64   `json:"supplier_quotation_line_id"`
	QuoteNo                 string  `json:"quote_no"`
	RFQID                   int64   `json:"rfq_id"`
	ItemID                  int64   `json:"item_id"`
	ItemCode                string  `json:"item_code"`
	ItemName                string  `json:"item_name"`
	OrderedQty              float64 `json:"ordered_qty"`
	BilledQty               float64 `json:"billed_qty"`
	BalanceQty              float64 `json:"balance_qty"`
	UnitNonVat              float64 `json:"unit_non_vat"`
	UnitVatInc              float64 `json:"unit_vat_inc"`
	TrackSerial             bool    `json:"track_serial,omitempty"`
}

func listOpenSupplierQuotationInvoiceLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := `po.tenant_id = $1 and po.deleted_at is null
			and po.status in ('confirmed', 'partially_received', 'received')
			and pol.supplier_quotation_line_id is not null`
		args := []any{tu.TenantID}
		argN := 2
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and po.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}

		q := fmt.Sprintf(`
			select pol.id, po.id, po.purchase_order_no,
			  sq.id, ln.id, sq.quote_no, sq.rfq_id,
			  pol.item_id, pol.item_code, pol.item_name,
			  pol.qty::float8, coalesce(pol.billed_qty, 0)::float8,
			  (pol.qty - coalesce(pol.billed_qty, 0))::float8,
			  pol.unit_non_vat::float8, pol.unit_vat_inc::float8,
			  coalesce(i.track_serial, false)
			from public.po_purchase_order_lines pol
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			join public.rfq_supplier_quotation_lines ln on ln.id = pol.supplier_quotation_line_id
			join public.rfq_supplier_quotations sq on sq.id = ln.supplier_quotation_id
			left join public.inv_items i on i.id = pol.item_id
			where %s
			  and (pol.qty - coalesce(pol.billed_qty, 0)) > 0.0001
			order by sq.quote_date desc, po.order_date desc, pol.line_no`, where)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list open supplier quotation lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []openSupplierQuotationInvoiceLineRow
		for rows.Next() {
			var row openSupplierQuotationInvoiceLineRow
			if err := rows.Scan(
				&row.PurchaseOrderLineID, &row.PurchaseOrderID, &row.PurchaseOrderNo,
				&row.SupplierQuotationID, &row.SupplierQuotationLineID, &row.QuoteNo, &row.RFQID,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.OrderedQty, &row.BilledQty, &row.BalanceQty,
				&row.UnitNonVat, &row.UnitVatInc, &row.TrackSerial,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier quotation lines.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []openSupplierQuotationInvoiceLineRow{}
		}
		response.OK(w, out, "OK")
	}
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
	documentlifecycle.RegisterRoutes(r, pool, "/supplier-invoices", documentlifecycle.SupplierInvoiceConfig())
	r.Get("/supplier-invoices/preview-sequences", previewSupplierInvoiceSequences(pool))
	r.Get("/supplier-invoices/open-gr-lines", listOpenGRLines(pool))
	r.Get("/supplier-invoices/open-po-lines", listOpenPOLines(pool))
	r.Get("/supplier-invoices/open-supplier-quotation-lines", listOpenSupplierQuotationInvoiceLines(pool))
	r.Get("/supplier-invoices", listSupplierInvoices(pool))
	r.Post("/supplier-invoices", createSupplierInvoice(pool))
	r.Get("/supplier-invoices/{id}/invoice", getPurchaseInvoice(pool))
	r.Put("/supplier-invoices/{id}/invoice", putPurchaseInvoice(pool))
	r.Get("/supplier-invoices/{id}", getSupplierInvoice(pool))
	r.Get("/supplier-invoices/{id}/print", getSupplierInvoicePrint(pool))
	r.Get("/supplier-invoices/{id}/pdf", getSupplierInvoicePDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/supplier-invoices/{id}/send-email", postSupplierInvoiceSendEmail(pool))
	r.Patch("/supplier-invoices/{id}", updateSupplierInvoice(pool))
	r.Delete("/supplier-invoices/{id}", deleteSupplierInvoice(pool))
	registerSupplierInvoiceApprovalRoutes(r, pool)
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

		lifecycleWhere, err := documentlifecycle.ListPredicate(r, "si")
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		where := "si.tenant_id = $1 and " + lifecycleWhere
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(` and (si.invoice_no ilike $%d or p.company_name ilike $%d or coalesce(si.vendor_invoice_no, '') ilike $%d or (to_char(si.invoice_date, 'MM/DD/YYYY') || '-' || si.date_seq) ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and si.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "unconfirmed" || progress == "e_approval" || progress == "completed" {
			where += fmt.Sprintf(" and si.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if progress == "confirm" {
			where += fmt.Sprintf(" and si.progress_status = $%d", argN)
			args = append(args, "completed")
			argN++
		}
		paymentJoin := `
			left join (
			  select a.supplier_invoice_id, coalesce(sum(a.applied_amount), 0) as applied
			  from public.fin_payment_applications a
			  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id and pv.deleted_at is null
			  group by a.supplier_invoice_id
			) pay on pay.supplier_invoice_id = si.id`
		switch strings.TrimSpace(r.URL.Query().Get("payment_status")) {
		case "unpaid":
			where += " and coalesce(pay.applied, 0) < si.grand_total - 0.0001"
		case "partial":
			where += " and coalesce(pay.applied, 0) > 0.0001 and coalesce(pay.applied, 0) < si.grand_total - 0.0001"
		case "paid":
			where += " and coalesce(pay.applied, 0) >= si.grand_total - 0.0001"
		}

		q := fmt.Sprintf(`
			select si.id, si.invoice_date, si.date_seq, si.invoice_no,
			  si.partner_id, p.company_name, si.currency_id, c.currency_code,
			  si.vendor_invoice_no, si.progress_status, si.grand_total::float8,
			  coalesce(pay.applied, 0)::float8 as paid_amount,
			  (si.grand_total - coalesce(pay.applied, 0))::float8 as balance,
			  count(*) over()
			from public.fin_supplier_invoices si
			join public.inv_partners p on p.id = si.partner_id
			join public.quo_currencies c on c.id = si.currency_id%s
			where %s
			order by %s %s
			limit $%d offset $%d`, paymentJoin, where, p.Sort, orderSQL(p.Order), argN, argN+1)
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
				&vendorInvNo, &row.ProgressStatus, &row.GrandTotal,
				&row.PaidAmount, &row.Balance, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier invoices.", "ERR_INTERNAL")
				return
			}
			row.InvoiceDate = dateToStr(invoiceDate)
			row.DateNoDisplay = formatDateNoDisplay(invoiceDate, row.DateSeq)
			row.VendorInvoiceNo = vendorInvNo
			switch {
			case row.PaidAmount >= row.GrandTotal-0.0001:
				row.PaymentStatus = "paid"
			case row.PaidAmount > 0.0001:
				row.PaymentStatus = "partial"
			default:
				row.PaymentStatus = "unpaid"
			}
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
		var ok bool
		if r, ok = documentlifecycle.PrepareDetailRequest(w, r); !ok {
			return
		}
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
	var dueDate *time.Time
	var createdByName *string
	err := pool.QueryRow(ctx, `
		select si.id, si.invoice_date, si.date_seq, si.invoice_no,
		  si.tax_type_id, coalesce(tt.name, ''),
		  si.partner_id, p.company_name, si.currency_id, c.currency_code,
		  si.pic_user_id, si.pic_name, si.location_id, coalesce(l.location_name, ''),
		  si.project_id, si.project_name, si.due_date,
		  si.terms_of_payment, si.payment_terms,
		  si.vendor_invoice_no, si.reference, si.notes, si.progress_status,
		  si.subtotal::float8, si.tax_total::float8, si.grand_total::float8,
		  u.full_name
		from public.fin_supplier_invoices si
		join public.inv_partners p on p.id = si.partner_id
		join public.quo_currencies c on c.id = si.currency_id
		left join public.quo_tax_types tt on tt.id = si.tax_type_id
		left join public.inv_locations l on l.id = si.location_id
		left join public.users u on u.id = si.created_by_user_id
		where si.id = $1 and si.tenant_id = $2 and `+documentlifecycle.DetailPredicate(ctx, "si"),
		id, tenantID).Scan(
		&inv.ID, &invoiceDate, &inv.DateSeq, &inv.InvoiceNo,
		&inv.TaxTypeID, &inv.TaxTypeName,
		&inv.PartnerID, &inv.VendorName, &inv.CurrencyID, &inv.CurrencyCode,
		&inv.PicUserID, &inv.PicName, &inv.LocationID, &inv.LocationName,
		&inv.ProjectID, &inv.ProjectName, &dueDate,
		&inv.TermsOfPayment, &inv.PaymentTerms,
		&inv.VendorInvoiceNo, &inv.Reference, &inv.Notes, &inv.ProgressStatus,
		&inv.Subtotal, &inv.TaxTotal, &inv.GrandTotal, &createdByName,
	)
	if err != nil {
		return SupplierInvoice{}, err
	}
	inv.InvoiceDate = dateToStr(invoiceDate)
	inv.DateNoDisplay = formatDateNoDisplay(invoiceDate, inv.DateSeq)
	inv.DueDate = datePtrToStr(dueDate)
	if createdByName != nil {
		inv.CreatedByName = *createdByName
	}

	rows, err := pool.Query(ctx, `
		select sil.id, sil.line_no, sil.goods_receipt_line_id, sil.purchase_order_line_id,
		  sil.item_id, sil.item_code, sil.item_name, sil.description,
		  sil.qty::float8, sil.unit_non_vat::float8, sil.non_vat_total::float8,
		  sil.tax_amount::float8, sil.unit_vat_inc::float8, sil.line_total::float8, sil.remark,
		  coalesce(i.track_serial, false)
		from public.fin_supplier_invoice_lines sil
		left join public.inv_items i on i.id = sil.item_id
		where sil.supplier_invoice_id = $1
		order by sil.line_no`, id)
	if err != nil {
		return SupplierInvoice{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln SupplierInvoiceLine
		if err := rows.Scan(
			&ln.ID, &ln.LineNo, &ln.GoodsReceiptLineID, &ln.PurchaseOrderLineID,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Description,
			&ln.Qty, &ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount, &ln.UnitVatInc, &ln.LineTotal, &ln.Remark,
			&ln.TrackSerial,
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

func grLineBalance(ctx context.Context, tx pgx.Tx, tenantID, grLineID int64) (float64, int64, int64, int64, error) {
	var receivedQty float64
	var poLineID, poID int64
	var partnerID int64
	err := tx.QueryRow(ctx, `
		select grl.received_qty::float8, grl.purchase_order_line_id, po.id, po.partner_id
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		join public.po_purchase_orders po on po.id = pol.purchase_order_id
		where grl.id = $1 and gr.tenant_id = $2 and gr.status = 'posted'`,
		grLineID, tenantID).Scan(&receivedQty, &poLineID, &poID, &partnerID)
	if err != nil {
		return 0, 0, 0, 0, err
	}
	var billed float64
	_ = tx.QueryRow(ctx, `
		select coalesce(sum(qty), 0)::float8
		from public.gr_goods_receipt_slip_lines
		where goods_receipt_line_id = $1 and slip_type = 'supplier_invoice'`, grLineID).Scan(&billed)
	return receivedQty - billed, poLineID, poID, partnerID, nil
}

func poLineBalance(ctx context.Context, tx pgx.Tx, tenantID, poLineID int64) (float64, int64, int64, error) {
	var orderedQty, billedQty float64
	var poID, partnerID int64
	err := tx.QueryRow(ctx, `
		select pol.qty::float8, coalesce(pol.billed_qty, 0)::float8, po.id, po.partner_id
		from public.po_purchase_order_lines pol
		join public.po_purchase_orders po on po.id = pol.purchase_order_id
		where pol.id = $1 and po.tenant_id = $2 and po.deleted_at is null
		  and po.status in ('confirmed', 'partially_received', 'received')`,
		poLineID, tenantID).Scan(&orderedQty, &billedQty, &poID, &partnerID)
	if err != nil {
		return 0, 0, 0, err
	}
	return orderedQty - billedQty, poID, partnerID, nil
}

func validateSupplierInvoiceBody(body supplierInvoiceBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.InvoiceDate) == "" {
		errs["invoice_date"] = "Invoice date is required."
	}
	if body.TaxTypeID <= 0 {
		errs["tax_type_id"] = "Transaction type is required."
	}
	if body.PartnerID <= 0 {
		errs["partner_id"] = "Vendor is required."
	}
	if body.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	if body.LocationID <= 0 {
		errs["location_id"] = "Location is required."
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
		if (ln.GoodsReceiptLineID == nil || *ln.GoodsReceiptLineID <= 0) &&
			(ln.PurchaseOrderLineID == nil || *ln.PurchaseOrderLineID <= 0) &&
			(ln.ItemID == nil || *ln.ItemID <= 0) {
			errs[key+".item_id"] = "Item is required when no source slip line is linked."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func validateSupplierInvoiceLines(ctx context.Context, tx pgx.Tx, tenantID, partnerID int64, policy processpolicy.Policy, lines []supplierInvoiceLineBody) map[string]string {
	errs := map[string]string{}
	seenGR := map[int64]bool{}
	seenPO := map[int64]bool{}
	// Cache PO approval decisions so each purchase order is checked once.
	poApprovalErr := map[int64]string{}
	checkPOApproval := func(poID int64) string {
		if !policy.PurchaseRequirePOApproval {
			return ""
		}
		if msg, ok := poApprovalErr[poID]; ok {
			return msg
		}
		status, found, err := approval.Status(ctx, tx, tenantID, "purchase_order", poID)
		if err != nil {
			poApprovalErr[poID] = "Failed to verify purchase order approval."
			return poApprovalErr[poID]
		}
		msg := ""
		if v := processpolicy.ValidatePurchaseOrderApproval(policy, found, status); v != nil {
			msg = v["purchase_order_id"]
		}
		poApprovalErr[poID] = msg
		return msg
	}
	for i, ln := range lines {
		key := fmt.Sprintf("lines[%d]", i)
		hasGR := ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0
		hasPO := ln.PurchaseOrderLineID != nil && *ln.PurchaseOrderLineID > 0
		// GR-before-invoice policy requires every line to carry a posted goods
		// receipt line; PO-only lines are rejected because they bypass receiving.
		if v := processpolicy.ValidateSupplierInvoiceLineSource(policy, hasGR); v != nil {
			errs[key+".goods_receipt_line_id"] = v["goods_receipt_line_id"]
			continue
		}
		if hasGR {
			if seenGR[*ln.GoodsReceiptLineID] {
				errs[key+".goods_receipt_line_id"] = "Duplicate goods receipt line."
				continue
			}
			seenGR[*ln.GoodsReceiptLineID] = true
			balance, _, poID, linePartnerID, err := grLineBalance(ctx, tx, tenantID, *ln.GoodsReceiptLineID)
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
			if msg := checkPOApproval(poID); msg != "" {
				errs[key+".goods_receipt_line_id"] = msg
			}
			continue
		}
		if hasPO {
			if seenPO[*ln.PurchaseOrderLineID] {
				errs[key+".purchase_order_line_id"] = "Duplicate purchase order line."
				continue
			}
			seenPO[*ln.PurchaseOrderLineID] = true
			balance, poID, linePartnerID, err := poLineBalance(ctx, tx, tenantID, *ln.PurchaseOrderLineID)
			if err != nil {
				errs[key+".purchase_order_line_id"] = "Purchase order line not found or not confirmed."
				continue
			}
			if linePartnerID != partnerID {
				errs[key+".purchase_order_line_id"] = "Vendor does not match purchase order."
			}
			if ln.Qty > balance+0.0001 {
				errs[key+".qty"] = fmt.Sprintf("Quantity exceeds PO balance (%.4f).", balance)
			}
			if msg := checkPOApproval(poID); msg != "" {
				errs[key+".purchase_order_line_id"] = msg
			}
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

		if errs := validateSupplierInvoiceLines(r.Context(), tx, tu.TenantID, body.PartnerID, policy, body.Lines); errs != nil {
			response.Validation(w, errs)
			return
		}

		subtotal, taxTotal, grandTotal := sumSupplierInvoiceTotals(body.Lines)
		dueDate, err := parseOptionalDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Invalid date."})
			return
		}
		if strings.TrimSpace(body.ProgressStatus) == "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Save as Unconfirmed, then use Submit for approval."})
			return
		}
		progress := defaultSupplierInvoiceProgress(body.ProgressStatus)
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSupplierInvoice, progress, 0); v != nil {
			response.Validation(w, v)
			return
		}

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
			  tax_type_id, partner_id, currency_id,
			  pic_user_id, pic_name, location_id,
			  project_id, project_name, due_date,
			  terms_of_payment, payment_terms,
			  vendor_invoice_no, reference, notes,
			  subtotal, tax_total, grand_total, progress_status, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
			returning id`,
			tu.TenantID, invoiceDate, dateSeq, invoiceNo,
			body.TaxTypeID, body.PartnerID, body.CurrencyID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName, dueDate,
			body.TermsOfPayment, body.PaymentTerms,
			body.VendorInvoiceNo, body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, progress, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert supplier invoice.", "ERR_INTERNAL")
			return
		}

		dateNoDisplay := formatDateNoDisplay(invoiceDate, dateSeq)
		if err := insertSupplierInvoiceLines(r.Context(), tx, tu.TenantID, id, body.PartnerID, invoiceNo, dateNoDisplay, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
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
	return documentlifecycle.DeleteHandler(pool, documentlifecycle.SupplierInvoiceConfig())
}

func resolveSupplierInvoiceLineItem(ctx context.Context, tx pgx.Tx, tenantID int64, ln supplierInvoiceLineBody) (itemID *int64, itemCode, itemName string, poLineID *int64, err error) {
	if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
		_, polID, _, _, grErr := grLineBalance(ctx, tx, tenantID, *ln.GoodsReceiptLineID)
		if grErr != nil {
			return nil, "", "", nil, grErr
		}
		poLineID = &polID
		_ = tx.QueryRow(ctx, `
			select pol.item_id, pol.item_code, pol.item_name
			from public.po_purchase_order_lines pol where pol.id = $1`, polID).Scan(&itemID, &itemCode, &itemName)
		return itemID, itemCode, itemName, poLineID, nil
	}
	if ln.PurchaseOrderLineID != nil && *ln.PurchaseOrderLineID > 0 {
		poLineID = ln.PurchaseOrderLineID
		err := tx.QueryRow(ctx, `
			select pol.item_id, pol.item_code, pol.item_name
			from public.po_purchase_order_lines pol
			join public.po_purchase_orders po on po.id = pol.purchase_order_id
			where pol.id = $1 and po.tenant_id = $2`, *ln.PurchaseOrderLineID, tenantID).Scan(&itemID, &itemCode, &itemName)
		if err != nil {
			return nil, "", "", nil, err
		}
		return itemID, itemCode, itemName, poLineID, nil
	}
	itemID = ln.ItemID
	itemCode = strings.TrimSpace(ln.ItemCode)
	itemName = strings.TrimSpace(ln.ItemName)
	return itemID, itemCode, itemName, nil, nil
}

func insertSupplierInvoiceLines(ctx context.Context, tx pgx.Tx, tenantID, invoiceID, partnerID int64, invoiceNo, dateNoDisplay string, lines []supplierInvoiceLineBody) error {
	poLinesToSync := map[int64]bool{}
	for i, ln := range lines {
		lineNo := i + 1
		if ln.LineNo > 0 {
			lineNo = ln.LineNo
		}
		itemID, itemCode, itemName, poLineID, err := resolveSupplierInvoiceLineItem(ctx, tx, tenantID, ln)
		if err != nil {
			return fmt.Errorf("line %d: goods receipt line not found", lineNo)
		}

		_, err = tx.Exec(ctx, `
			insert into public.fin_supplier_invoice_lines (
			  supplier_invoice_id, line_no, goods_receipt_line_id, purchase_order_line_id,
			  item_id, item_code, item_name, description, qty,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
			invoiceID, lineNo, ln.GoodsReceiptLineID, poLineID,
			itemID, itemCode, itemName, ln.Description, ln.Qty,
			ln.UnitNonVat, ln.NonVatTotal, ln.TaxAmount, ln.UnitVatInc, ln.LineTotal, ln.Remark)
		if err != nil {
			return err
		}

		if ln.GoodsReceiptLineID != nil && *ln.GoodsReceiptLineID > 0 {
			_, err = tx.Exec(ctx, `
				insert into public.gr_goods_receipt_slip_lines (
				  goods_receipt_line_id, slip_type, slip_ref, slip_date_no, qty, supplier_invoice_id
				) values ($1, 'supplier_invoice', $2, $3, $4, $5)`,
				*ln.GoodsReceiptLineID, invoiceNo, dateNoDisplay, ln.Qty, invoiceID)
			if err != nil {
				return err
			}
		}
		if poLineID != nil {
			poLinesToSync[*poLineID] = true
		}
	}
	for poLineID := range poLinesToSync {
		if err := fulfillment.SyncPOLineBilledQty(ctx, tx, poLineID); err != nil {
			return err
		}
	}
	return nil
}

func clearSupplierInvoiceSlipLines(ctx context.Context, tx pgx.Tx, invoiceID int64) error {
	rows, err := tx.Query(ctx, `
		select distinct sil.purchase_order_line_id
		from public.fin_supplier_invoice_lines sil
		where sil.supplier_invoice_id = $1 and sil.purchase_order_line_id is not null`, invoiceID)
	if err != nil {
		return err
	}
	defer rows.Close()
	var poLineIDs []int64
	for rows.Next() {
		var poLineID int64
		if err := rows.Scan(&poLineID); err != nil {
			return err
		}
		poLineIDs = append(poLineIDs, poLineID)
	}
	if _, err := tx.Exec(ctx, `delete from public.gr_goods_receipt_slip_lines where supplier_invoice_id = $1`, invoiceID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `delete from public.fin_supplier_invoice_lines where supplier_invoice_id = $1`, invoiceID); err != nil {
		return err
	}
	for _, poLineID := range poLineIDs {
		if err := fulfillment.SyncPOLineBilledQty(ctx, tx, poLineID); err != nil {
			return err
		}
	}
	return nil
}

func updateSupplierInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
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
		dueDate, err := parseOptionalDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Invalid date."})
			return
		}

		before, err := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier invoice not found.", "ERR_NOT_FOUND")
			return
		}
		if before.ProgressStatus == "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Cannot edit a purchase pending approval."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if errs := validateSupplierInvoiceLines(r.Context(), tx, tu.TenantID, body.PartnerID, policy, body.Lines); errs != nil {
			response.Validation(w, errs)
			return
		}

		subtotal, taxTotal, grandTotal := sumSupplierInvoiceTotals(body.Lines)
		if strings.TrimSpace(body.ProgressStatus) == "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Use Submit for approval instead of changing the status directly."})
			return
		}
		progress := defaultSupplierInvoiceProgress(body.ProgressStatus)
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSupplierInvoice, progress, id); v != nil {
			response.Validation(w, v)
			return
		}

		tag, err := tx.Exec(r.Context(), `
			update public.fin_supplier_invoices set
			  invoice_date = $1, tax_type_id = $2, partner_id = $3, currency_id = $4,
			  pic_user_id = $5, pic_name = $6, location_id = $7,
			  project_id = $8, project_name = $9, due_date = $10,
			  terms_of_payment = $11, payment_terms = $12,
			  vendor_invoice_no = $13, reference = $14, notes = $15,
			  subtotal = $16, tax_total = $17, grand_total = $18,
			  progress_status = $19, updated_at = now()
			where id = $20 and tenant_id = $21 and deleted_at is null`,
			invoiceDate, body.TaxTypeID, body.PartnerID, body.CurrencyID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName, dueDate,
			body.TermsOfPayment, body.PaymentTerms,
			body.VendorInvoiceNo, body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, progress, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Supplier invoice not found.", "ERR_NOT_FOUND")
			return
		}

		if err := clearSupplierInvoiceSlipLines(r.Context(), tx, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to clear lines.", "ERR_INTERNAL")
			return
		}

		parsedDate, _ := parseDate(body.InvoiceDate)
		dateNoDisplay := formatDateNoDisplay(parsedDate, before.DateSeq)
		if err := insertSupplierInvoiceLines(r.Context(), tx, tu.TenantID, id, body.PartnerID, before.InvoiceNo, dateNoDisplay, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.supplier_invoice.update", "fin_supplier_invoice", &id, before, body)
		inv, _ := loadSupplierInvoice(r.Context(), pool, tu.TenantID, id)
		response.OK(w, inv, "Updated.")
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
