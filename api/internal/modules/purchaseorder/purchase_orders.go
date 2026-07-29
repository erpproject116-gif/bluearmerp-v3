package purchaseorder

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/documentlifecycle"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

type PurchaseOrderLine struct {
	ID                      int64    `json:"id,omitempty"`
	LineNo                  int      `json:"line_no"`
	PurchaseRequestLineID   *int64   `json:"purchase_request_line_id,omitempty"`
	RFQRequestLineID        *int64   `json:"rfq_request_line_id,omitempty"`
	SupplierQuotationLineID *int64   `json:"supplier_quotation_line_id,omitempty"`
	PartnerID               *int64   `json:"partner_id,omitempty"`
	PartnerCode             string   `json:"partner_code"`
	PartnerName             string   `json:"partner_name"`
	ItemID                  *int64   `json:"item_id,omitempty"`
	ItemCode                string   `json:"item_code"`
	ItemName                string   `json:"item_name"`
	SpecName                *string  `json:"spec_name,omitempty"`
	Description             *string  `json:"description,omitempty"`
	Qty                     float64  `json:"qty"`
	ReceivedQty             float64  `json:"received_qty"`
	BilledQty               float64  `json:"billed_qty"`
	UnitID                  *int64   `json:"unit_id,omitempty"`
	UnitCode                string   `json:"unit_code,omitempty"`
	UnitNonVat              float64  `json:"unit_non_vat"`
	NonVatTotal             float64  `json:"non_vat_total"`
	TaxAmount               float64  `json:"tax_amount"`
	UnitVatInc              float64  `json:"unit_vat_inc"`
	LineTotal               float64  `json:"line_total"`
	Remark                  *string  `json:"remark,omitempty"`
	PlannedSerialNos        []string `json:"planned_serial_nos,omitempty"`
	TrackSerial             bool     `json:"track_serial,omitempty"`
	SerialPolicy            string   `json:"serial_policy,omitempty"`
}

type PurchaseOrder struct {
	ID                  int64               `json:"id"`
	OrderDate           string              `json:"order_date"`
	DateSeq             int                 `json:"date_seq"`
	DateNoDisplay       string              `json:"date_no_display"`
	PurchaseOrderNo     string              `json:"purchase_order_no"`
	PurchaseRequestID   *int64              `json:"purchase_request_id,omitempty"`
	RFQID               *int64              `json:"rfq_id,omitempty"`
	SupplierQuotationID *int64              `json:"supplier_quotation_id,omitempty"`
	TaxTypeID           int64               `json:"tax_type_id"`
	TaxTypeName         string              `json:"tax_type_name,omitempty"`
	CurrencyID          int64               `json:"currency_id"`
	CurrencyCode        string              `json:"currency_code,omitempty"`
	PartnerID           *int64              `json:"partner_id,omitempty"`
	PartnerName         string              `json:"partner_name"`
	PicUserID           *int64              `json:"pic_user_id,omitempty"`
	PicName             string              `json:"pic_name"`
	LocationID          int64               `json:"location_id"`
	LocationName        string              `json:"location_name,omitempty"`
	ProjectID           *int64              `json:"project_id,omitempty"`
	ProjectName         *string             `json:"project_name,omitempty"`
	Status              string              `json:"status"`
	ProgressStatus      string              `json:"progress_status"`
	PctReceived         float64             `json:"pct_received"`
	PctBilled           float64             `json:"pct_billed"`
	Reference           *string             `json:"reference,omitempty"`
	Notes               *string             `json:"notes,omitempty"`
	Subtotal            float64             `json:"subtotal"`
	TaxTotal            float64             `json:"tax_total"`
	GrandTotal          float64             `json:"grand_total"`
	CreatedByUserID     *int64              `json:"created_by_user_id,omitempty"`
	CreatedByName       string              `json:"created_by_name,omitempty"`
	ItemNameSummary     string              `json:"item_name_summary,omitempty"`
	Lines               []PurchaseOrderLine `json:"lines,omitempty"`
}

type purchaseOrderLineBody struct {
	LineNo                int      `json:"line_no"`
	PurchaseRequestLineID *int64   `json:"purchase_request_line_id"`
	PartnerID             *int64   `json:"partner_id"`
	PartnerCode           string   `json:"partner_code"`
	PartnerName           string   `json:"partner_name"`
	ItemID                *int64   `json:"item_id"`
	ItemCode              string   `json:"item_code"`
	ItemName              string   `json:"item_name"`
	SpecName              *string  `json:"spec_name"`
	Description           *string  `json:"description"`
	Qty                   float64  `json:"qty"`
	UnitID                *int64   `json:"unit_id"`
	UnitCode              string   `json:"unit_code"`
	UnitPrice             float64  `json:"unit_price"`
	InputBasis            string   `json:"input_basis"`
	Remark                *string  `json:"remark"`
	PlannedSerialNos      []string `json:"planned_serial_nos"`
}

type purchaseOrderBody struct {
	OrderDate         string                  `json:"order_date"`
	DateSeq           *int                    `json:"date_seq"`
	PurchaseRequestID *int64                  `json:"purchase_request_id"`
	TaxTypeID         int64                   `json:"tax_type_id"`
	CurrencyID        int64                   `json:"currency_id"`
	PartnerID         *int64                  `json:"partner_id"`
	PicUserID         *int64                  `json:"pic_user_id"`
	PicName           string                  `json:"pic_name"`
	LocationID        int64                   `json:"location_id"`
	ProjectID         *int64                  `json:"project_id"`
	ProjectName       *string                 `json:"project_name"`
	Reference         *string                 `json:"reference"`
	Notes             *string                 `json:"notes"`
	Lines             []purchaseOrderLineBody `json:"lines"`
}

type fromPurchaseRequestBody struct {
	OrderDate *string `json:"order_date"`
	DateSeq   *int    `json:"date_seq"`
	Reference *string `json:"reference"`
	Notes     *string `json:"notes"`
}

type fromSupplierQuotationBody struct {
	OrderDate *string `json:"order_date"`
	DateSeq   *int    `json:"date_seq"`
	Reference *string `json:"reference"`
	Notes     *string `json:"notes"`
}

type computedLine struct {
	LineNo                  int
	PurchaseRequestLineID   *int64
	RFQRequestLineID        *int64
	SupplierQuotationLineID *int64
	PartnerID               *int64
	PartnerCode             string
	PartnerName             string
	ItemID                  *int64
	ItemCode                string
	ItemName                string
	SpecName                *string
	Description             *string
	Qty                     float64
	UnitID                  *int64
	UnitCode                *string
	InputBasis              string
	Amounts                 taxcalc.LineAmounts
	Remark                  *string
	PlannedSerialNos        []string
}

const hybridPartnerLateral = `
left join lateral (
  select ln.partner_id, coalesce(p.company_name, ln.partner_name, '') as company_name
  from public.po_purchase_order_lines ln
  left join public.inv_partners p on p.id = ln.partner_id
  where ln.purchase_order_id = po.id
  order by ln.line_no
  limit 1
) line_partner on true
left join public.inv_partners hp on hp.id = po.partner_id`

func registerPurchaseOrderRoutes(r chi.Router, pool *pgxpool.Pool) {
	documentlifecycle.RegisterRoutes(r, pool, "/purchase-orders", documentlifecycle.PurchaseOrderConfig())
	r.Get("/purchase-orders/preview-sequences", previewPurchaseOrderSequences(pool))
	r.Get("/purchase-orders/status-report/export", exportPurchaseOrderStatusReport(pool))
	r.Get("/purchase-orders/status-report", listPurchaseOrderStatusReport(pool))
	r.Get("/purchase-orders/outstanding-report/export", exportPurchaseOrderOutstandingReport(pool))
	r.Get("/purchase-orders/outstanding-report", listPurchaseOrderOutstandingReport(pool))
	r.Get("/purchase-orders", listPurchaseOrders(pool))
	r.Get("/purchase-orders/purchase-request-lines/open", listOpenPurchaseRequestSlipLines(pool))
	r.Get("/purchase-orders/supplier-quotation-lines/open", listOpenSupplierQuotationSlipLines(pool))
	r.Post("/purchase-orders", createPurchaseOrder(pool))
	r.Post("/purchase-orders/from-purchase-request/{prId}", createFromPurchaseRequest(pool))
	r.With(auth.RequirePermission("purchase_order.purchase_orders_from_quote", auth.AccessWrite)).Post("/purchase-orders/from-supplier-quotation/{sqId}", createFromSupplierQuotation(pool))
	r.Get("/purchase-orders/{id}", getPurchaseOrder(pool))
	r.Get("/purchase-orders/{id}/print", getPurchaseOrderPrint(pool))
	r.Get("/purchase-orders/{id}/pdf", getPurchaseOrderPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/purchase-orders/{id}/send-email", postPurchaseOrderSendEmail(pool))
	r.With(auth.RequireSubmit("purchase_order.purchase_orders_confirm")).Patch("/purchase-orders/{id}/confirm", confirmPurchaseOrder(pool))
	r.Patch("/purchase-orders/{id}", updatePurchaseOrder(pool))
	r.Delete("/purchase-orders/{id}", deletePurchaseOrder(pool))
}

func previewPurchaseOrderSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("order_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		orderDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var purchaseOrderNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, purchase_order_no from public.preview_purchase_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &purchaseOrderNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":          dateSeq,
			"purchase_order_no": purchaseOrderNo,
			"date_no_display":   formatDateNoDisplay(orderDate, dateSeq),
		}, "OK")
	}
}

func listPurchaseOrders(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date":        "po.order_date",
		"purchase_order_no": "po.purchase_order_no",
		"partner_name":      "coalesce(hp.company_name, line_partner.company_name, '')",
		"grand_total":       "po.grand_total",
		"status":            "po.status",
		"progress_status":   "po.progress_status",
		"created_at":        "po.created_at",
		"updated_at":        "po.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sortByModified := strings.EqualFold(r.URL.Query().Get("sort_by_modified"), "true") ||
			r.URL.Query().Get("sort_by_modified") == "1"
		defaultSort := "order_date"
		if sortByModified {
			defaultSort = "updated_at"
		}
		p := httputil.ParseListParams(r, defaultSort, allowed)
		if sortByModified {
			p.Sort = "updated_at"
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		lifecycleWhere, err := documentlifecycle.ListPredicate(r, "po")
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		where := "po.tenant_id = $1 and " + lifecycleWhere
		args := []any{tu.TenantID}
		argN := 2
		var explicitLoc *int64

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				po.purchase_order_no ilike $%d or
				coalesce(hp.company_name, line_partner.company_name, '') ilike $%d or
				coalesce(po.reference, '') ilike $%d or
				(to_char(po.order_date, 'MM/DD/YYYY') || '-' || po.date_seq) ilike $%d or
				exists (
					select 1 from public.po_purchase_order_lines ln
					where ln.purchase_order_id = po.id and ln.item_name ilike $%d
				))`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			if from, err := parseDate(fromStr); err == nil {
				where += fmt.Sprintf(" and po.order_date >= $%d::date", argN)
				args = append(args, from)
				argN++
			}
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			if to, err := parseDate(toStr); err == nil {
				where += fmt.Sprintf(" and po.order_date <= $%d::date", argN)
				args = append(args, to)
				argN++
			}
		}
		if poNo := strings.TrimSpace(r.URL.Query().Get("purchase_order_no")); poNo != "" {
			where += fmt.Sprintf(" and po.purchase_order_no ilike $%d", argN)
			args = append(args, "%"+poNo+"%")
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			explicitLoc = id
		}
		if id, ok := optionalInt64Query(r, "project_id"); ok {
			where += fmt.Sprintf(" and po.project_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(` and (
				po.partner_id = $%d or exists (
					select 1 from public.po_purchase_order_lines ln
					where ln.purchase_order_id = po.id and ln.partner_id = $%d
				))`, argN, argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(` and exists (
				select 1 from public.po_purchase_order_lines ln
				where ln.purchase_order_id = po.id and ln.item_id = $%d)`, argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "purchase_request_id"); ok {
			where += fmt.Sprintf(" and po.purchase_request_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "supplier_quotation_id"); ok {
			where += fmt.Sprintf(" and po.supplier_quotation_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		if isValidPOStatus(status) {
			where += fmt.Sprintf(" and po.status = $%d", argN)
			args = append(args, status)
			argN++
		} else if p.Status != "" && isValidPOStatus(p.Status) {
			where += fmt.Sprintf(" and po.status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "unconfirmed" || progress == "e_approval" || progress == "completed" {
			where += fmt.Sprintf(" and po.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if progress == "confirm" {
			where += fmt.Sprintf(" and po.progress_status = $%d", argN)
			args = append(args, "completed")
			argN++
		}

		scope, argN := tu.PicOrCreatedScopeSQL("po", argN, &args)
		where += scope

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn:     "po.partner_id",
			LocationColumn:     "po.location_id",
			ExplicitLocationID: explicitLoc,
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = allowed[defaultSort]
		}

		q := fmt.Sprintf(`
			select po.id, po.order_date, po.date_seq, po.purchase_order_no,
			  po.purchase_request_id, po.rfq_id, po.supplier_quotation_id,
			  po.tax_type_id, tt.name, po.currency_id, c.currency_code,
			  coalesce(po.partner_id, line_partner.partner_id),
			  coalesce(hp.company_name, line_partner.company_name, ''),
			  po.pic_user_id, po.pic_name,
			  po.location_id, po.status, po.progress_status, po.grand_total::float8,
			  coalesce(u.full_name, ''),
			  (select ln.item_name from public.po_purchase_order_lines ln
			   where ln.purchase_order_id = po.id order by ln.line_no limit 1),
			  (select count(*)::int from public.po_purchase_order_lines ln where ln.purchase_order_id = po.id),
			  coalesce((
			    select case when sum(ln.qty) > 0.0001
			      then round(100.0 * sum(coalesce(ln.received_qty, 0)) / sum(ln.qty), 1) else 0 end
			    from public.po_purchase_order_lines ln where ln.purchase_order_id = po.id
			  ), 0)::float8,
			  coalesce((
			    select case when sum(ln.qty) > 0.0001
			      then round(100.0 * sum(coalesce(ln.billed_qty, 0)) / sum(ln.qty), 1) else 0 end
			    from public.po_purchase_order_lines ln where ln.purchase_order_id = po.id
			  ), 0)::float8,
			  count(*) over()
			from public.po_purchase_orders po
			%s
			join public.quo_tax_types tt on tt.id = po.tax_type_id
			join public.quo_currencies c on c.id = po.currency_id
			left join public.users u on u.id = po.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			hybridPartnerLateral, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PurchaseOrder
		var total int64
		for rows.Next() {
			var row PurchaseOrder
			var orderDate time.Time
			var partnerID *int64
			var firstItemName *string
			var lineCount int
			if err := rows.Scan(
				&row.ID, &orderDate, &row.DateSeq, &row.PurchaseOrderNo,
				&row.PurchaseRequestID, &row.RFQID, &row.SupplierQuotationID,
				&row.TaxTypeID, &row.TaxTypeName, &row.CurrencyID, &row.CurrencyCode,
				&partnerID, &row.PartnerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &row.Status, &row.ProgressStatus, &row.GrandTotal,
				&row.CreatedByName, &firstItemName, &lineCount, &row.PctReceived, &row.PctBilled, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase orders.", "ERR_INTERNAL")
				return
			}
			row.PartnerID = partnerID
			row.OrderDate = dateToStr(orderDate)
			row.DateNoDisplay = formatDateNoDisplay(orderDate, row.DateSeq)
			row.ItemNameSummary = formatItemNameSummary(firstItemName, lineCount)
			out = append(out, row)
		}
		if out == nil {
			out = []PurchaseOrder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getPurchaseOrder(pool *pgxpool.Pool) http.HandlerFunc {
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
		po, err := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, po, "OK")
	}
}

func loadPurchaseOrder(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (PurchaseOrder, error) {
	var po PurchaseOrder
	var orderDate time.Time
	var partnerID *int64
	var createdByName *string

	err := pool.QueryRow(ctx, `
		select po.id, po.order_date, po.date_seq, po.purchase_order_no,
		  po.purchase_request_id, po.rfq_id, po.supplier_quotation_id,
		  po.tax_type_id, tt.name, po.currency_id, c.currency_code,
		  coalesce(po.partner_id, line_partner.partner_id),
		  coalesce(hp.company_name, line_partner.company_name, ''),
		  po.pic_user_id, po.pic_name,
		  po.location_id, l.location_name, po.project_id, po.project_name,
		  po.status, po.progress_status, po.reference, po.notes,
		  po.subtotal::float8, po.tax_total::float8, po.grand_total::float8,
		  po.created_by_user_id, u.full_name
		from public.po_purchase_orders po
		`+hybridPartnerLateral+`
		join public.quo_tax_types tt on tt.id = po.tax_type_id
		join public.quo_currencies c on c.id = po.currency_id
		join public.inv_locations l on l.id = po.location_id
		left join public.users u on u.id = po.created_by_user_id
		where po.id = $1 and po.tenant_id = $2 and `+documentlifecycle.DetailPredicate(ctx, "po"),
		id, tenantID).Scan(
		&po.ID, &orderDate, &po.DateSeq, &po.PurchaseOrderNo,
		&po.PurchaseRequestID, &po.RFQID, &po.SupplierQuotationID,
		&po.TaxTypeID, &po.TaxTypeName, &po.CurrencyID, &po.CurrencyCode,
		&partnerID, &po.PartnerName,
		&po.PicUserID, &po.PicName,
		&po.LocationID, &po.LocationName, &po.ProjectID, &po.ProjectName,
		&po.Status, &po.ProgressStatus, &po.Reference, &po.Notes,
		&po.Subtotal, &po.TaxTotal, &po.GrandTotal,
		&po.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return PurchaseOrder{}, err
	}
	po.PartnerID = partnerID
	po.OrderDate = dateToStr(orderDate)
	po.DateNoDisplay = formatDateNoDisplay(orderDate, po.DateSeq)
	if createdByName != nil {
		po.CreatedByName = *createdByName
	}

	lines, err := loadPurchaseOrderLines(ctx, pool, id)
	if err != nil {
		return PurchaseOrder{}, err
	}
	po.Lines = lines
	return po, nil
}

func loadPurchaseOrderLines(ctx context.Context, pool *pgxpool.Pool, purchaseOrderID int64) ([]PurchaseOrderLine, error) {
	rows, err := pool.Query(ctx, `
		select ln.id, ln.line_no, ln.purchase_request_line_id, ln.rfq_request_line_id, ln.supplier_quotation_line_id,
		  ln.partner_id, ln.partner_code, ln.partner_name,
		  ln.item_id, ln.item_code, ln.item_name, ln.spec_name, ln.description,
		  ln.qty::float8, ln.received_qty::float8, coalesce(ln.billed_qty, 0)::float8,
		  ln.unit_id, coalesce(ln.unit_code, ''),
		  ln.unit_non_vat::float8, ln.non_vat_total::float8, ln.tax_amount::float8,
		  ln.unit_vat_inc::float8, ln.line_total::float8, ln.remark,
		  coalesce(ln.planned_serial_nos, '{}'),
		  coalesce(i.track_serial, false),
		  coalesce(i.serial_policy, 'required')
		from public.po_purchase_order_lines ln
		left join public.inv_items i on i.id = ln.item_id
		where ln.purchase_order_id = $1
		order by ln.line_no`, purchaseOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []PurchaseOrderLine
	for rows.Next() {
		var ln PurchaseOrderLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.PurchaseRequestLineID, &ln.RFQRequestLineID, &ln.SupplierQuotationLineID,
			&ln.PartnerID, &ln.PartnerCode, &ln.PartnerName,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.SpecName, &ln.Description,
			&ln.Qty, &ln.ReceivedQty, &ln.BilledQty, &ln.UnitID, &ln.UnitCode,
			&ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount,
			&ln.UnitVatInc, &ln.LineTotal, &ln.Remark, &ln.PlannedSerialNos, &ln.TrackSerial, &ln.SerialPolicy); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []PurchaseOrderLine{}
	}
	return lines, nil
}

// validateLinkedPRApproval blocks saving a PO against a purchase request that has
// not passed approval when the PR-approval policy is on.
func validateLinkedPRApproval(ctx context.Context, pool *pgxpool.Pool, tenantID int64, policy processpolicy.Policy, prID *int64) map[string]string {
	if prID == nil || *prID <= 0 || !policy.PurchaseRequirePRApproval {
		return nil
	}
	var progress string
	var approvedAt *time.Time
	err := pool.QueryRow(ctx, `
		select progress_status, approved_at from public.pr_purchase_requests
		where id = $1 and tenant_id = $2 and deleted_at is null`, *prID, tenantID).Scan(&progress, &approvedAt)
	if err != nil {
		return map[string]string{"purchase_request_id": "Purchase request not found."}
	}
	return processpolicy.ValidatePurchaseRequestForPO(policy, progress, approvedAt)
}

func createPurchaseOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body purchaseOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePurchaseOrderBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if vErrs := processpolicy.ValidatePurchaseOrderCreate(policy, body.PurchaseRequestID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}
		if vErrs := validateLinkedPRApproval(r.Context(), pool, tu.TenantID, policy, body.PurchaseRequestID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computePurchaseOrderLines(r.Context(), pool, tu.TenantID, tt, applyBuyingRatesToPOLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines))
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		headerPartnerID := resolveHeaderPartnerID(body.PartnerID, computed)
		subtotal, taxTotal, grandTotal := sumPurchaseOrderTotals(computed)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		dateSeq, purchaseOrderNo, seqErrs := allocatePurchaseOrderSequences(r.Context(), tx, tu.TenantID, orderDate, body.DateSeq, 0)
		if seqErrs != nil {
			response.Validation(w, seqErrs)
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.po_purchase_orders (
			  tenant_id, order_date, date_seq, purchase_order_no,
			  purchase_request_id, rfq_id, supplier_quotation_id, tax_type_id, currency_id, partner_id,
			  pic_user_id, pic_name, location_id, project_id, project_name,
			  status, reference, notes,
			  subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16,$17,$18,$19,$20,$21)
			returning id`,
			tu.TenantID, orderDate, dateSeq, purchaseOrderNo,
			body.PurchaseRequestID, nil, nil, body.TaxTypeID, body.CurrencyID, headerPartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID, body.ProjectID, body.ProjectName,
			body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert purchase order.", "ERR_INTERNAL")
			return
		}

		if _, err := insertPurchaseOrderLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.create", "po_purchase_order", &id, nil, body)
		po, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, po, "Created.")
	}
}

func createFromPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		prID, err := strconv.ParseInt(chi.URLParam(r, "prId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"prId": "Invalid purchase request id."})
			return
		}

		var body fromPurchaseRequestBody
		if r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}

		id, err := CreateFromPurchaseRequest(r.Context(), pool, tu, prID, CreateFromPROptions{
			OrderDate: body.OrderDate,
			DateSeq:   body.DateSeq,
			Reference: body.Reference,
			Notes:     body.Notes,
		})
		if err != nil {
			if fields, ok := AsDocflowValidation(err); ok {
				response.Validation(w, fields)
				return
			}
			if errors.Is(err, ErrPurchaseRequestNotFound) {
				response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create purchase order.", "ERR_INTERNAL")
			return
		}

		po, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, po, "Created.")
	}
}

func createFromSupplierQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sqID, err := strconv.ParseInt(chi.URLParam(r, "sqId"), 10, 64)
		if err != nil || sqID <= 0 {
			response.Validation(w, map[string]string{"sqId": "Invalid supplier quotation id."})
			return
		}

		var body fromSupplierQuotationBody
		if r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}

		var rfqID int64
		var sqStatus string
		var quoteDate time.Time
		var partnerID int64
		var sqReferenceNo string
		var sqNotes *string
		err = pool.QueryRow(r.Context(), `
			select sq.rfq_id, sq.status, sq.quote_date, sq.partner_id, sq.quote_no, sq.notes
			from public.rfq_supplier_quotations sq
			where sq.id = $1 and sq.tenant_id = $2`, sqID, tu.TenantID).Scan(
			&rfqID, &sqStatus, &quoteDate, &partnerID, &sqReferenceNo, &sqNotes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		if sqStatus == "rejected" {
			response.Validation(w, map[string]string{"status": "Rejected supplier quotation cannot be converted."})
			return
		}

		var rfqPurchaseRequestID *int64
		var rfqStatus string
		if err := pool.QueryRow(r.Context(), `
			select purchase_request_id, status
			from public.rfq_requests
			where id = $1 and tenant_id = $2`, rfqID, tu.TenantID).Scan(&rfqPurchaseRequestID, &rfqStatus); err != nil {
			response.Validation(w, map[string]string{"rfq_id": "Related RFQ not found."})
			return
		}
		if rfqStatus == "cancelled" {
			response.Validation(w, map[string]string{"rfq_id": "Cancelled RFQ cannot be converted."})
			return
		}

		var taxTypeID, currencyID, locationID int64
		var picUserID, projectID *int64
		var picName string
		var projectName, reference, notes *string
		if rfqPurchaseRequestID != nil {
			_ = pool.QueryRow(r.Context(), `
				select tax_type_id, currency_id, location_id, pic_user_id, pic_name, project_id, project_name, reference, notes
				from public.pr_purchase_requests
				where id = $1 and tenant_id = $2 and deleted_at is null`,
				*rfqPurchaseRequestID, tu.TenantID).Scan(&taxTypeID, &currencyID, &locationID, &picUserID, &picName, &projectID, &projectName, &reference, &notes)
		}
		if taxTypeID <= 0 {
			// Fallback defaults when RFQ is not linked to a purchase request.
			if err := pool.QueryRow(r.Context(), `
				select id from public.quo_tax_types
				where tenant_id = $1 and status = 'active'
				order by sort_order asc, id asc
				limit 1`, tu.TenantID).Scan(&taxTypeID); err != nil {
				response.Validation(w, map[string]string{"tax_type_id": "No active tax type available for conversion."})
				return
			}
			if err := pool.QueryRow(r.Context(), `
				select id from public.quo_currencies
				where tenant_id = $1 and status = 'active'
				order by is_default desc, id asc
				limit 1`, tu.TenantID).Scan(&currencyID); err != nil {
				response.Validation(w, map[string]string{"currency_id": "No active currency available for conversion."})
				return
			}
			if err := pool.QueryRow(r.Context(), `
				select id from public.inv_locations
				where tenant_id = $1 and status = 'active' and deleted_at is null
				order by id asc
				limit 1`, tu.TenantID).Scan(&locationID); err != nil {
				response.Validation(w, map[string]string{"location_id": "No active location available for conversion."})
				return
			}
		}

		orderDate := quoteDate
		if body.OrderDate != nil && strings.TrimSpace(*body.OrderDate) != "" {
			orderDate, err = parseDate(*body.OrderDate)
			if err != nil {
				response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
				return
			}
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, taxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		rows, err := pool.Query(r.Context(), `
			select ln.id, ln.rfq_request_line_id, rl.item_id, rl.item_code, rl.item_name,
			  ln.qty::float8, coalesce(ln.unit_id, rl.unit_id), coalesce(ln.unit_code, rl.unit_code, ''),
			  ln.unit_price::float8
			from public.rfq_supplier_quotation_lines ln
			left join public.rfq_request_lines rl on rl.id = ln.rfq_request_line_id
			where ln.supplier_quotation_id = $1
			order by ln.line_no`, sqID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load supplier quotation lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var computed []computedLine
		lineNo := 0
		for rows.Next() {
			var sqLineID int64
			var rfqLineID *int64
			var itemID *int64
			var itemCode, itemName string
			var unitID *int64
			var unitCode string
			var qty, unitPrice float64
			if err := rows.Scan(&sqLineID, &rfqLineID, &itemID, &itemCode, &itemName, &qty, &unitID, &unitCode, &unitPrice); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier quotation lines.", "ERR_INTERNAL")
				return
			}
			if qty <= 0 {
				continue
			}
			if itemID == nil || *itemID <= 0 {
				response.Validation(w, map[string]string{
					"lines": "Register free-text RFQ products in Inventory before converting to a purchase order.",
				})
				return
			}
			lineNo++
			inputBasis := taxcalc.InputVatIncUnit
			amounts := taxcalc.ComputeLine(tt, unitPrice, qty, inputBasis)
			sqLineIDCopy := sqLineID
			resolvedUnitID, resolvedUnitCode := inventory.ResolveLineUnit(r.Context(), pool, tu.TenantID, itemID, unitID, unitCode)
			computed = append(computed, computedLine{
				LineNo:                  lineNo,
				PurchaseRequestLineID:   nil,
				RFQRequestLineID:        rfqLineID,
				SupplierQuotationLineID: &sqLineIDCopy,
				PartnerID:               &partnerID,
				PartnerCode:             "",
				PartnerName:             "",
				ItemID:                  itemID,
				ItemCode:                strings.TrimSpace(itemCode),
				ItemName:                strings.TrimSpace(itemName),
				Qty:                     qty,
				UnitID:                  resolvedUnitID,
				UnitCode:                resolvedUnitCode,
				InputBasis:              inputBasis,
				Amounts:                 amounts,
			})
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "Supplier quotation has no convertible lines."})
			return
		}

		var partnerCode, partnerName string
		_ = pool.QueryRow(r.Context(), `
			select partner_code, company_name
			from public.inv_partners
			where id = $1`, partnerID).Scan(&partnerCode, &partnerName)
		for i := range computed {
			computed[i].PartnerCode = partnerCode
			computed[i].PartnerName = partnerName
		}

		subtotal, taxTotal, grandTotal := sumPurchaseOrderTotals(computed)
		if body.Reference != nil {
			reference = body.Reference
		} else if reference == nil || strings.TrimSpace(*reference) == "" {
			reference = &sqReferenceNo
		}
		if body.Notes != nil {
			notes = body.Notes
		} else if (notes == nil || strings.TrimSpace(*notes) == "") && sqNotes != nil {
			notes = sqNotes
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create purchase order.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		dateSeq, purchaseOrderNo, seqErrs := allocatePurchaseOrderSequences(r.Context(), tx, tu.TenantID, orderDate, body.DateSeq, 0)
		if seqErrs != nil {
			response.Validation(w, seqErrs)
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.po_purchase_orders (
			  tenant_id, order_date, date_seq, purchase_order_no,
			  purchase_request_id, rfq_id, supplier_quotation_id, tax_type_id, currency_id, partner_id,
			  pic_user_id, pic_name, location_id, project_id, project_name,
			  status, reference, notes,
			  subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'draft',$16,$17,$18,$19,$20,$21)
			returning id`,
			tu.TenantID, orderDate, dateSeq, purchaseOrderNo,
			rfqPurchaseRequestID, &rfqID, &sqID, taxTypeID, currencyID, &partnerID,
			picUserID, strings.TrimSpace(picName), locationID, projectID, projectName,
			reference, notes, subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert purchase order.", "ERR_INTERNAL")
			return
		}

		if _, err := insertPurchaseOrderLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `
			update public.rfq_supplier_quotations
			set status = 'accepted', updated_at = now()
			where id = $1 and tenant_id = $2`, sqID, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update supplier quotation status.", "ERR_INTERNAL")
			return
		}
		_, _ = tx.Exec(r.Context(), `
			update public.rfq_supplier_quotations
			set status = 'rejected', updated_at = now()
			where tenant_id = $1 and rfq_id = $2 and id <> $3 and status in ('draft', 'received', 'accepted')`,
			tu.TenantID, rfqID, sqID)

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save purchase order.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.create_from_supplier_quotation", "po_purchase_order", &id, nil, map[string]any{
			"supplier_quotation_id": sqID,
		})
		po, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, po, "Created.")
	}
}

func updatePurchaseOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body purchaseOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePurchaseOrderBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date."})
			return
		}

		var currentStatus string
		if err := pool.QueryRow(r.Context(), `
			select status from public.po_purchase_orders
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&currentStatus); err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		if currentStatus != "draft" {
			response.Err(w, http.StatusConflict, "Only draft purchase orders can be updated.", "ERR_CONFLICT")
			return
		}

		// Re-validate source requirements so an update cannot strip the PR link
		// or attach an unapproved purchase request.
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if vErrs := processpolicy.ValidatePurchaseOrderCreate(policy, body.PurchaseRequestID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}
		if vErrs := validateLinkedPRApproval(r.Context(), pool, tu.TenantID, policy, body.PurchaseRequestID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computePurchaseOrderLines(r.Context(), pool, tu.TenantID, tt, applyBuyingRatesToPOLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines))
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		headerPartnerID := resolveHeaderPartnerID(body.PartnerID, computed)
		subtotal, taxTotal, grandTotal := sumPurchaseOrderTotals(computed)
		before, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		if err := tx.QueryRow(r.Context(), `
			select date_seq from public.po_purchase_orders
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&dateSeq); err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		if body.DateSeq != nil && *body.DateSeq > 0 && *body.DateSeq != dateSeq {
			if err := assertDateSeqAvailable(r.Context(), tx, tu.TenantID, orderDate, *body.DateSeq, id); err != nil {
				response.Validation(w, map[string]string{"date_seq": err.Error()})
				return
			}
			dateSeq = *body.DateSeq
		}

		tag, err := tx.Exec(r.Context(), `
			update public.po_purchase_orders set
			  order_date = $1, date_seq = $2,
			  purchase_request_id = $3, rfq_id = null, supplier_quotation_id = null, tax_type_id = $4, currency_id = $5, partner_id = $6,
			  pic_user_id = $7, pic_name = $8, location_id = $9,
			  project_id = $10, project_name = $11,
			  reference = $12, notes = $13,
			  subtotal = $14, tax_total = $15, grand_total = $16, updated_at = now()
			where id = $17 and tenant_id = $18 and deleted_at is null and status = 'draft'`,
			orderDate, dateSeq,
			body.PurchaseRequestID, body.TaxTypeID, body.CurrencyID, headerPartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName,
			body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}

		if err := replacePurchaseOrderLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		after, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.update", "po_purchase_order", &id, before, after)
		response.OK(w, after, "Updated.")
	}
}

func confirmPurchaseOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		before, err := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}
		if before.Status != "draft" {
			response.Err(w, http.StatusConflict, "Only draft purchase orders can be confirmed.", "ERR_CONFLICT")
			return
		}
		if len(before.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "Purchase order has no lines."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		orderDate, err := time.Parse("2006-01-02", before.OrderDate)
		if err != nil {
			orderDate = time.Now()
		}
		budgetCheck, _ := processpolicy.CheckPurchaseBudget(r.Context(), pool, policy, tu.TenantID, before.ProjectID, orderDate, before.GrandTotal)
		if v := processpolicy.ValidateBudgetControl(policy, budgetCheck); v != nil {
			response.Validation(w, v)
			return
		}
		if v := processpolicy.ValidatePurchaseOrderConfirm(r.Context(), pool, policy, id); v != nil {
			response.Validation(w, v)
			return
		}
		if policy.PurchaseRequirePOApproval {
			status, found, err := approval.Status(r.Context(), pool, tu.TenantID, "purchase_order", id)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check approval.", "ERR_INTERNAL")
				return
			}
			if v := processpolicy.ValidatePurchaseOrderApproval(policy, found, status); v != nil {
				response.Validation(w, v)
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to confirm.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.po_purchase_orders
			set status = 'confirmed', progress_status = 'completed', updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status = 'draft'`,
			id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Purchase order not found.", "ERR_NOT_FOUND")
			return
		}

		slipRef := before.PurchaseOrderNo
		dateNoDisplay := before.DateNoDisplay
		for _, ln := range before.Lines {
			if ln.PurchaseRequestLineID == nil {
				continue
			}
			_, err := tx.Exec(r.Context(), `
				insert into public.pr_purchase_request_slip_lines (
				  purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty
				) values ($1, 'purchase_order', $2, $3, $4)`,
				*ln.PurchaseRequestLineID, slipRef, dateNoDisplay, ln.Qty)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record slip lines.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to confirm.", "ERR_INTERNAL")
			return
		}

		po, _ := loadPurchaseOrder(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.confirm", "po_purchase_order", &id, before, po)
		response.OK(w, po, "Confirmed.")
	}
}

func deletePurchaseOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return documentlifecycle.DeleteHandler(pool, documentlifecycle.PurchaseOrderConfig())
}

func allocatePurchaseOrderSequences(ctx context.Context, tx pgx.Tx, tenantID int64, orderDate time.Time, requestedSeq *int, excludeID int64) (dateSeq int, purchaseOrderNo string, errs map[string]string) {
	if requestedSeq != nil && *requestedSeq > 0 {
		dateSeq = *requestedSeq
		if err := assertDateSeqAvailable(ctx, tx, tenantID, orderDate, dateSeq, excludeID); err != nil {
			return 0, "", map[string]string{"date_seq": err.Error()}
		}
		var refSeq int
		if err := tx.QueryRow(ctx, `
			insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
			values ($1, 'purchase_order_no', $2::date, 1)
			on conflict (tenant_id, sequence_key, bucket_date)
			do update set last_value = tenant_daily_sequences.last_value + 1
			returning last_value`, tenantID, orderDate).Scan(&refSeq); err != nil {
			return 0, "", map[string]string{"body": "Failed to allocate reference number."}
		}
		prefix := orderDate.Format("060102")
		purchaseOrderNo = fmt.Sprintf("%s%03d", prefix, refSeq)
		if _, err := tx.Exec(ctx, `
			insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
			values ($1, 'purchase_order_date_seq', $2::date, $3)
			on conflict (tenant_id, sequence_key, bucket_date)
			do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value)`,
			tenantID, orderDate, dateSeq); err != nil {
			return 0, "", map[string]string{"body": "Failed to update date sequence."}
		}
		return dateSeq, purchaseOrderNo, nil
	}
	if err := tx.QueryRow(ctx,
		`select date_seq, purchase_order_no from public.allocate_purchase_order_sequences($1, $2::date)`,
		tenantID, orderDate).Scan(&dateSeq, &purchaseOrderNo); err != nil {
		return 0, "", map[string]string{"body": "Failed to allocate sequences."}
	}
	return dateSeq, purchaseOrderNo, nil
}

func assertDateSeqAvailable(ctx context.Context, tx pgx.Tx, tenantID int64, orderDate time.Time, dateSeq int, excludeID int64) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.po_purchase_orders
		  where tenant_id = $1 and order_date = $2::date and date_seq = $3
		    and deleted_at is null and ($4 = 0 or id <> $4)
		)`, tenantID, orderDate, dateSeq, excludeID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to validate date sequence")
	}
	if exists {
		return fmt.Errorf("Date-No sequence already used for this date.")
	}
	return nil
}

func resolveHeaderPartnerID(header *int64, lines []computedLine) *int64 {
	if header != nil && *header > 0 {
		return header
	}
	for _, ln := range lines {
		if ln.PartnerID != nil && *ln.PartnerID > 0 {
			return ln.PartnerID
		}
	}
	return nil
}

func insertPurchaseOrderLines(ctx context.Context, tx pgx.Tx, purchaseOrderID int64, lines []computedLine) ([]int64, error) {
	var ids []int64
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		var id int64
		err := tx.QueryRow(ctx, `
			insert into public.po_purchase_order_lines (
			  purchase_order_id, purchase_request_line_id, rfq_request_line_id, supplier_quotation_line_id, line_no,
			  partner_id, partner_code, partner_name,
			  item_id, item_code, item_name, spec_name, description,
			  qty, unit_id, unit_code, input_basis, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark,
			  planned_serial_nos
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
			returning id`,
			purchaseOrderID, ln.PurchaseRequestLineID, ln.RFQRequestLineID, ln.SupplierQuotationLineID, lineNo,
			ln.PartnerID, strings.TrimSpace(ln.PartnerCode), strings.TrimSpace(ln.PartnerName),
			ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.SpecName, ln.Description,
			ln.Qty, ln.UnitID, ln.UnitCode, ln.InputBasis, ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
			ln.Amounts.UnitVatInc, ln.Amounts.LineTotal, ln.Remark, ln.PlannedSerialNos).Scan(&id)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func replacePurchaseOrderLines(ctx context.Context, tx pgx.Tx, purchaseOrderID int64, lines []computedLine) error {
	if _, err := tx.Exec(ctx, `delete from public.po_purchase_order_lines where purchase_order_id = $1`, purchaseOrderID); err != nil {
		return err
	}
	_, err := insertPurchaseOrderLines(ctx, tx, purchaseOrderID, lines)
	return err
}

func applyBuyingRatesToPOLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, headerPartnerID *int64, lines []purchaseOrderLineBody) []purchaseOrderLineBody {
	out := make([]purchaseOrderLineBody, len(lines))
	copy(out, lines)
	for i := range out {
		partnerID := int64(0)
		if out[i].PartnerID != nil && *out[i].PartnerID > 0 {
			partnerID = *out[i].PartnerID
		} else if headerPartnerID != nil && *headerPartnerID > 0 {
			partnerID = *headerPartnerID
		}
		if out[i].ItemID != nil && *out[i].ItemID > 0 && partnerID > 0 {
			out[i].UnitPrice = inventory.ResolveBuyingUnitPrice(ctx, pool, tenantID, *out[i].ItemID, partnerID, out[i].UnitPrice)
		}
	}
	return out
}

func computePurchaseOrderLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, tt taxcalc.TaxType, lines []purchaseOrderLineBody) ([]computedLine, map[string]string) {
	errs := map[string]string{}
	var out []computedLine
	for i, ln := range lines {
		if ln.Qty <= 0 {
			continue
		}
		if ln.ItemID == nil || *ln.ItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].item_id", i)] = "Register the product in Inventory before saving a purchase order (RFQ may use free-text items)."
			continue
		}
		planned := inventory.NormalizePlannedSerialNos(ln.PlannedSerialNos)
		if err := inventory.ValidatePlannedSerialNos(ctx, pool, tenantID, ln.LineNo, ln.ItemID, ln.Qty, planned, false); err != nil {
			errs[fmt.Sprintf("lines[%d].planned_serial_nos", i)] = err.Error()
			continue
		}
		inputBasis := ln.InputBasis
		if inputBasis == "" {
			inputBasis = taxcalc.InputVatIncUnit
		}
		if inputBasis != taxcalc.InputVatIncUnit && inputBasis != taxcalc.InputNonVatUnit {
			errs[fmt.Sprintf("lines[%d].input_basis", i)] = "Must be vat_inc_unit or non_vat_unit."
			continue
		}
		amounts := taxcalc.ComputeLine(tt, ln.UnitPrice, ln.Qty, inputBasis)
		unitID, unitCode := inventory.ResolveLineUnit(ctx, pool, tenantID, ln.ItemID, ln.UnitID, ln.UnitCode)
		out = append(out, computedLine{
			LineNo:                ln.LineNo,
			PurchaseRequestLineID: ln.PurchaseRequestLineID,
			PartnerID:             ln.PartnerID,
			PartnerCode:           ln.PartnerCode,
			PartnerName:           ln.PartnerName,
			ItemID:                ln.ItemID,
			ItemCode:              ln.ItemCode,
			ItemName:              ln.ItemName,
			SpecName:              ln.SpecName,
			Description:           ln.Description,
			Qty:                   ln.Qty,
			UnitID:                unitID,
			UnitCode:              unitCode,
			InputBasis:            inputBasis,
			Amounts:               amounts,
			Remark:                ln.Remark,
			PlannedSerialNos:      planned,
		})
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}

func sumPurchaseOrderTotals(lines []computedLine) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.Amounts.NonVatTotal
		taxTotal += ln.Amounts.TaxAmount
		grandTotal += ln.Amounts.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func validatePurchaseOrderBody(b purchaseOrderBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.OrderDate) == "" {
		errs["order_date"] = "Order date is required."
	}
	if b.TaxTypeID <= 0 {
		errs["tax_type_id"] = "Transaction type is required."
	}
	if b.CurrencyID <= 0 {
		errs["currency_id"] = "Currency is required."
	}
	if b.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if b.DateSeq != nil && *b.DateSeq <= 0 {
		errs["date_seq"] = "Date sequence must be positive."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}
