package salesorder

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
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/creditlimit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/documentlifecycle"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

type SalesOrderLine struct {
	ID                    int64    `json:"id,omitempty"`
	LineNo                int      `json:"line_no"`
	ItemID                *int64   `json:"item_id,omitempty"`
	ItemCode              string   `json:"item_code"`
	ItemName              string   `json:"item_name"`
	Description           *string  `json:"description,omitempty"`
	Qty                   float64  `json:"qty"`
	DeliveredQty          float64  `json:"delivered_qty"`
	BilledQty             float64  `json:"billed_qty"`
	UnitID                *int64   `json:"unit_id,omitempty"`
	UnitCode              string   `json:"unit_code,omitempty"`
	UnitNonVat            float64  `json:"unit_non_vat"`
	NonVatTotal           float64  `json:"non_vat_total"`
	TaxAmount             float64  `json:"tax_amount"`
	UnitVatInc            float64  `json:"unit_vat_inc"`
	LineTotal             float64  `json:"line_total"`
	Remark                *string  `json:"remark,omitempty"`
	SourceQuotationLineID *int64   `json:"source_quotation_line_id,omitempty"`
	PlannedSerialNos      []string `json:"planned_serial_nos,omitempty"`
	TrackSerial           bool     `json:"track_serial,omitempty"`
	SerialPolicy          string   `json:"serial_policy,omitempty"`
	OpenWoQty             float64  `json:"open_wo_qty,omitempty"`
	CompletedWoQty        float64  `json:"completed_wo_qty,omitempty"`
}

type SalesOrder struct {
	ID                int64            `json:"id"`
	OrderDate         string           `json:"order_date"`
	DateSeq           int              `json:"date_seq"`
	DateNoDisplay     string           `json:"date_no_display"`
	SalesOrderNo      string           `json:"sales_order_no"`
	TaxTypeID         int64            `json:"tax_type_id"`
	TaxTypeName       string           `json:"tax_type_name,omitempty"`
	CurrencyID        int64            `json:"currency_id"`
	CurrencyCode      string           `json:"currency_code,omitempty"`
	PartnerID         int64            `json:"partner_id"`
	CustomerName      string           `json:"customer_name"`
	PicUserID         *int64           `json:"pic_user_id,omitempty"`
	PicName           string           `json:"pic_name"`
	SalesPersonID     *int64           `json:"sales_person_id,omitempty"`
	SalesPersonName   string           `json:"sales_person_name,omitempty"`
	LocationID        int64            `json:"location_id"`
	LocationName      string           `json:"location_name,omitempty"`
	ProjectID         *int64           `json:"project_id,omitempty"`
	ProjectName       *string          `json:"project_name,omitempty"`
	DueDate           *string          `json:"due_date,omitempty"`
	DeliveryDate      *string          `json:"delivery_date,omitempty"`
	DeliveryDateDisp  string           `json:"delivery_date_display,omitempty"`
	Reference         *string          `json:"reference,omitempty"`
	Notes             *string          `json:"notes,omitempty"`
	DeliveryRemarks   *string          `json:"delivery_remarks,omitempty"`
	PaymentTerms      *string          `json:"payment_terms,omitempty"`
	Mop               *string          `json:"mop,omitempty"`
	ProgressStatus    string           `json:"progress_status"`
	PctDelivered      float64          `json:"pct_delivered"`
	PctBilled         float64          `json:"pct_billed"`
	Subtotal          float64          `json:"subtotal"`
	TaxTotal          float64          `json:"tax_total"`
	GrandTotal        float64          `json:"grand_total"`
	SourceQuotationID *int64           `json:"source_quotation_id,omitempty"`
	CreatedByUserID   *int64           `json:"created_by_user_id,omitempty"`
	CreatedByName     string           `json:"created_by_name,omitempty"`
	ItemNameSummary   string           `json:"item_name_summary,omitempty"`
	Lines             []SalesOrderLine `json:"lines,omitempty"`
}

type salesOrderLineBody struct {
	ID                    *int64   `json:"id,omitempty"`
	LineNo                int      `json:"line_no"`
	ItemID                *int64   `json:"item_id"`
	ItemCode              string   `json:"item_code"`
	ItemName              string   `json:"item_name"`
	Description           *string  `json:"description"`
	Qty                   float64  `json:"qty"`
	UnitID                *int64   `json:"unit_id"`
	UnitCode              string   `json:"unit_code"`
	UnitPrice             float64  `json:"unit_price"`
	InputBasis            string   `json:"input_basis"`
	Remark                *string  `json:"remark"`
	SourceQuotationLineID *int64   `json:"source_quotation_line_id"`
	PlannedSerialNos      []string `json:"planned_serial_nos"`
}

type salesOrderBody struct {
	OrderDate         string               `json:"order_date"`
	TaxTypeID         int64                `json:"tax_type_id"`
	CurrencyID        int64                `json:"currency_id"`
	PartnerID         int64                `json:"partner_id"`
	PicUserID         *int64               `json:"pic_user_id"`
	PicName           string               `json:"pic_name"`
	SalesPersonID     *int64               `json:"sales_person_id"`
	LocationID        int64                `json:"location_id"`
	ProjectID         *int64               `json:"project_id"`
	ProjectName       *string              `json:"project_name"`
	DueDate           *string              `json:"due_date"`
	DeliveryDate      *string              `json:"delivery_date"`
	Reference         *string              `json:"reference"`
	Notes             *string              `json:"notes"`
	DeliveryRemarks   *string              `json:"delivery_remarks"`
	PaymentTerms      *string              `json:"payment_terms"`
	Mop               *string              `json:"mop"`
	ProgressStatus    string               `json:"progress_status"`
	SourceQuotationID *int64               `json:"source_quotation_id"`
	Lines             []salesOrderLineBody `json:"lines"`
}

type computedLine struct {
	ID                    *int64
	LineNo                int
	ItemID                *int64
	ItemCode              string
	ItemName              string
	Description           *string
	Qty                   float64
	UnitID                *int64
	UnitCode              *string
	Amounts               taxcalc.LineAmounts
	Remark                *string
	SourceQuotationLineID *int64
	PlannedSerialNos      []string
}

type createdSlipRow struct {
	ID          int64   `json:"id"`
	SlipType    string  `json:"slip_type"`
	SlipRef     *string `json:"slip_ref,omitempty"`
	SlipDateNo  *string `json:"slip_date_no,omitempty"`
	Qty         float64 `json:"qty"`
	ReleaseDate *string `json:"release_date,omitempty"`
}

type createdSlipLine struct {
	LineID     int64            `json:"line_id"`
	LineNo     int              `json:"line_no"`
	ItemCode   string           `json:"item_code"`
	ItemName   string           `json:"item_name"`
	Qty        float64          `json:"qty"`
	BalanceQty float64          `json:"balance_qty"`
	Slips      []createdSlipRow `json:"slips"`
}

func registerSalesOrderRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerAttachmentRoutes(r, pool)
	documentlifecycle.RegisterRoutes(r, pool, "/sales-orders", documentlifecycle.SalesOrderConfig())
	r.Get("/sales-orders/preview-sequences", previewSalesOrderSequences(pool))
	r.Get("/sales-orders/quotation-lines/open", listOpenQuotationLines(pool))
	r.Get("/sales-orders/release-queue", listReleaseQueue(pool))
	r.With(auth.RequirePermission("sales_order.release_undo", auth.AccessRead)).Get("/sales-orders/recent-releases", listRecentReleases(pool))
	r.Post("/sales-orders/releases", postReleases(pool))
	r.With(auth.RequirePermission("sales_order.release_undo", "write")).Post("/sales-orders/releases/{releaseLineId}/undo", undoRelease(pool))
	r.Get("/sales-orders/status-report/export", exportSalesOrderStatusReport(pool))
	r.Get("/sales-orders/status-report", listSalesOrderStatusReport(pool))
	r.Get("/sales-orders/outstanding-report/export", exportSalesOrderOutstandingReport(pool))
	r.Get("/sales-orders/outstanding-report", listSalesOrderOutstandingReport(pool))
	r.Get("/sales-orders", listSalesOrders(pool))
	r.Post("/sales-orders", createSalesOrder(pool))
	r.Get("/sales-orders/{id}/print", getSalesOrderPrint(pool))
	r.Get("/sales-orders/{id}/pdf", getSalesOrderPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/sales-orders/{id}/send-email", postSalesOrderSendEmail(pool))
	r.Get("/sales-orders/{id}/created-slips", getCreatedSlips(pool))
	r.Patch("/sales-orders/{id}/progress-status", patchSalesOrderProgressStatus(pool))
	r.Post("/sales-orders/{id}/attachments", uploadSalesOrderAttachment(pool))
	r.Get("/sales-orders/{id}/attachments", listSalesOrderAttachments(pool))
	r.Get("/sales-orders/{id}", getSalesOrder(pool))
	r.Patch("/sales-orders/{id}", updateSalesOrder(pool))
	r.Delete("/sales-orders/{id}", deleteSalesOrder(pool))
}

func previewSalesOrderSequences(pool *pgxpool.Pool) http.HandlerFunc {
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
		var salesOrderNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, sales_order_no from public.preview_sales_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &salesOrderNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"sales_order_no":  salesOrderNo,
			"date_no_display": formatDateNoDisplay(orderDate, dateSeq),
		}, "OK")
	}
}

func listSalesOrders(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date":      "so.order_date",
		"sales_order_no":  "so.sales_order_no",
		"customer_name":   "p.company_name",
		"delivery_date":   "so.delivery_date",
		"grand_total":     "so.grand_total",
		"progress_status": "so.progress_status",
		"created_at":      "so.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", allowed)
		offset := httputil.Offset(p)

		lifecycleWhere, err := documentlifecycle.ListPredicate(r, "so")
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		where := "so.tenant_id = $1 and " + lifecycleWhere
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				so.sales_order_no ilike $%d or p.company_name ilike $%d or
				coalesce(so.reference, '') ilike $%d or
				(to_char(so.order_date, 'MM/DD/YYYY') || '-' || so.date_seq) ilike $%d or
				exists (
					select 1 from public.so_sales_order_lines ln
					where ln.sales_order_id = so.id and ln.item_name ilike $%d
				))`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "unconfirmed" || progress == "in_progress" || progress == "completed" {
			where += fmt.Sprintf(" and so.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if p.Status == "unconfirmed" || p.Status == "in_progress" || p.Status == "completed" {
			where += fmt.Sprintf(" and so.progress_status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		scope, argN := tu.PicOrCreatedScopeSQL("so", argN, &args)
		where += scope

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "so.partner_id",
			LocationColumn: "so.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select so.id, so.order_date, so.date_seq, so.sales_order_no,
			  so.tax_type_id, tt.name, so.currency_id, c.currency_code,
			  so.partner_id, p.company_name, so.pic_user_id, so.pic_name,
			  so.location_id, so.delivery_date, so.progress_status, so.grand_total::float8,
			  coalesce(u.full_name, ''), so.delivery_remarks, so.payment_terms,
			  (select ln.item_name from public.so_sales_order_lines ln
			   where ln.sales_order_id = so.id order by ln.line_no limit 1),
			  (select count(*)::int from public.so_sales_order_lines ln where ln.sales_order_id = so.id),
			  coalesce((
			    select case when sum(ln.qty) > 0.0001
			      then round(100.0 * sum(coalesce(ln.delivered_qty, 0)) / sum(ln.qty), 1) else 0 end
			    from public.so_sales_order_lines ln where ln.sales_order_id = so.id
			  ), 0)::float8,
			  coalesce((
			    select case when sum(ln.qty) > 0.0001
			      then round(100.0 * sum(coalesce(ln.billed_qty, 0)) / sum(ln.qty), 1) else 0 end
			    from public.so_sales_order_lines ln where ln.sales_order_id = so.id
			  ), 0)::float8,
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners p on p.id = so.partner_id
			join public.quo_tax_types tt on tt.id = so.tax_type_id
			join public.quo_currencies c on c.id = so.currency_id
			left join public.users u on u.id = so.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []SalesOrder
		var total int64
		for rows.Next() {
			var row SalesOrder
			var orderDate time.Time
			var deliveryDate *time.Time
			var firstItemName *string
			var lineCount int
			if err := rows.Scan(
				&row.ID, &orderDate, &row.DateSeq, &row.SalesOrderNo,
				&row.TaxTypeID, &row.TaxTypeName, &row.CurrencyID, &row.CurrencyCode,
				&row.PartnerID, &row.CustomerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &deliveryDate, &row.ProgressStatus, &row.GrandTotal,
				&row.CreatedByName, &row.DeliveryRemarks, &row.PaymentTerms,
				&firstItemName, &lineCount, &row.PctDelivered, &row.PctBilled, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales orders.", "ERR_INTERNAL")
				return
			}
			row.OrderDate = dateToStr(orderDate)
			row.DateNoDisplay = formatDateNoDisplay(orderDate, row.DateSeq)
			row.DeliveryDate = datePtrToStr(deliveryDate)
			if deliveryDate != nil {
				row.DeliveryDateDisp = formatDisplayDate(*deliveryDate)
			}
			row.ItemNameSummary = formatItemNameSummary(firstItemName, lineCount)
			out = append(out, row)
		}
		if out == nil {
			out = []SalesOrder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
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
		so, err := loadSalesOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, so, "OK")
	}
}

func loadSalesOrder(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (SalesOrder, error) {
	var so SalesOrder
	var orderDate time.Time
	var dueDate, deliveryDate *time.Time
	var createdByName *string

	err := pool.QueryRow(ctx, `
		select so.id, so.order_date, so.date_seq, so.sales_order_no,
		  so.tax_type_id, tt.name, so.currency_id, c.currency_code,
		  so.partner_id, p.company_name, so.pic_user_id, so.pic_name,
		  so.sales_person_id, coalesce(sp.full_name, ''),
		  so.location_id, l.location_name, so.project_id, so.project_name,
		  so.due_date, so.delivery_date, so.reference, so.notes,
		  so.delivery_remarks, so.payment_terms, so.mop,
		  so.progress_status,
		  so.subtotal::float8, so.tax_total::float8, so.grand_total::float8,
		  so.source_quotation_id, so.created_by_user_id, u.full_name
		from public.so_sales_orders so
		join public.inv_partners p on p.id = so.partner_id
		join public.quo_tax_types tt on tt.id = so.tax_type_id
		join public.quo_currencies c on c.id = so.currency_id
		join public.inv_locations l on l.id = so.location_id
		left join public.users u on u.id = so.created_by_user_id
		left join public.users sp on sp.id = so.sales_person_id
		where so.id = $1 and so.tenant_id = $2 and `+documentlifecycle.DetailPredicate(ctx, "so"),
		id, tenantID).Scan(
		&so.ID, &orderDate, &so.DateSeq, &so.SalesOrderNo,
		&so.TaxTypeID, &so.TaxTypeName, &so.CurrencyID, &so.CurrencyCode,
		&so.PartnerID, &so.CustomerName, &so.PicUserID, &so.PicName,
		&so.SalesPersonID, &so.SalesPersonName,
		&so.LocationID, &so.LocationName, &so.ProjectID, &so.ProjectName,
		&dueDate, &deliveryDate, &so.Reference, &so.Notes,
		&so.DeliveryRemarks, &so.PaymentTerms, &so.Mop,
		&so.ProgressStatus,
		&so.Subtotal, &so.TaxTotal, &so.GrandTotal,
		&so.SourceQuotationID, &so.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return SalesOrder{}, err
	}
	so.OrderDate = dateToStr(orderDate)
	so.DateNoDisplay = formatDateNoDisplay(orderDate, so.DateSeq)
	so.DueDate = datePtrToStr(dueDate)
	so.DeliveryDate = datePtrToStr(deliveryDate)
	if deliveryDate != nil {
		so.DeliveryDateDisp = formatDisplayDate(*deliveryDate)
	}
	if createdByName != nil {
		so.CreatedByName = *createdByName
	}

	lines, err := loadSalesOrderLines(ctx, pool, id)
	if err != nil {
		return SalesOrder{}, err
	}
	so.Lines = lines
	return so, nil
}

func loadSalesOrderLines(ctx context.Context, pool *pgxpool.Pool, salesOrderID int64) ([]SalesOrderLine, error) {
	rows, err := pool.Query(ctx, `
		select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
		  ln.qty::float8, coalesce(ln.delivered_qty, 0)::float8, coalesce(ln.billed_qty, 0)::float8,
		  ln.unit_id, coalesce(ln.unit_code, ''),
		  ln.unit_non_vat::float8, ln.non_vat_total::float8, ln.tax_amount::float8,
		  ln.unit_vat_inc::float8, ln.line_total::float8, ln.remark, ln.source_quotation_line_id,
		  coalesce(ln.planned_serial_nos, '{}'),
		  coalesce(i.track_serial, false),
		  coalesce(i.serial_policy, 'required'),
		  coalesce(wo_open.open_qty, 0)::float8,
		  coalesce(wo_done.completed_qty, 0)::float8
		from public.so_sales_order_lines ln
		left join public.inv_items i on i.id = ln.item_id
		left join (
		  select source_sales_order_line_id, sum(qty_to_produce)::float8 as open_qty
		  from public.mfg_work_orders
		  where source_sales_order_line_id is not null
		    and status in ('draft', 'released')
		  group by source_sales_order_line_id
		) wo_open on wo_open.source_sales_order_line_id = ln.id
		left join (
		  select source_sales_order_line_id, sum(qty_produced)::float8 as completed_qty
		  from public.mfg_work_orders
		  where source_sales_order_line_id is not null
		    and status = 'completed'
		  group by source_sales_order_line_id
		) wo_done on wo_done.source_sales_order_line_id = ln.id
		where ln.sales_order_id = $1
		order by ln.line_no`, salesOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []SalesOrderLine
	for rows.Next() {
		var ln SalesOrderLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Description,
			&ln.Qty, &ln.DeliveredQty, &ln.BilledQty, &ln.UnitID, &ln.UnitCode,
			&ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount,
			&ln.UnitVatInc, &ln.LineTotal, &ln.Remark, &ln.SourceQuotationLineID, &ln.PlannedSerialNos, &ln.TrackSerial, &ln.SerialPolicy,
			&ln.OpenWoQty, &ln.CompletedWoQty); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []SalesOrderLine{}
	}
	return lines, nil
}

func createSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body salesOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSalesOrderBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if vErrs := processpolicy.ValidateSalesOrderCreate(policy, body.SourceQuotationID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSalesOrder, defaultProgress(body.ProgressStatus), 0); v != nil {
			response.Validation(w, v)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		dueDate, err := parseOptionalDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Invalid date."})
			return
		}
		deliveryDate, err := parseOptionalDate(body.DeliveryDate)
		if err != nil {
			response.Validation(w, map[string]string{"delivery_date": "Invalid date."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		body.Lines = applyPartnerRatesToSOLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines)
		computed, errs := computeSalesOrderLines(r.Context(), pool, tu.TenantID, tt, body.Lines)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		if convErrs := validateQuotationConversion(r.Context(), pool, tu.TenantID, computed); convErrs != nil {
			response.Validation(w, convErrs)
			return
		}

		subtotal, taxTotal, grandTotal := sumSalesOrderTotals(computed)

		if defaultProgress(body.ProgressStatus) == "in_progress" {
			if clErrs, err := creditlimit.ValidateFromPolicy(r.Context(), pool, tu.TenantID, body.PartnerID, grandTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to validate credit limit.", "ERR_INTERNAL")
				return
			} else if clErrs != nil {
				response.Validation(w, clErrs)
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var salesOrderNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, sales_order_no from public.allocate_sales_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &salesOrderNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		dateNoDisplay := formatDateNoDisplay(orderDate, dateSeq)

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.so_sales_orders (
			  tenant_id, order_date, date_seq, sales_order_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name, sales_person_id,
			  location_id, project_id, project_name,
			  due_date, delivery_date, reference, notes, delivery_remarks,
			  payment_terms, mop, progress_status,
			  subtotal, tax_total, grand_total, source_quotation_id, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
			returning id`,
			tu.TenantID, orderDate, dateSeq, salesOrderNo,
			body.TaxTypeID, body.CurrencyID, body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName), body.SalesPersonID,
			body.LocationID, body.ProjectID, body.ProjectName,
			dueDate, deliveryDate, body.Reference, body.Notes, body.DeliveryRemarks,
			body.PaymentTerms, body.Mop, defaultProgress(body.ProgressStatus),
			subtotal, taxTotal, grandTotal, body.SourceQuotationID, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert sales order.", "ERR_INTERNAL")
			return
		}

		lineIDs, err := insertSalesOrderLines(r.Context(), tx, id, computed)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}

		if err := writeQuotationSlipsForSalesOrder(r.Context(), tx, tu.TenantID, id, salesOrderNo, dateNoDisplay, computed, lineIDs); err != nil {
			response.Validation(w, map[string]string{"conversion": err.Error()})
			return
		}

		if !policy.LegacyCombinedSORelease {
			reserveInputs := make([]soLineReserveInput, 0, len(computed))
			for i, ln := range computed {
				reserveInputs = append(reserveInputs, soLineReserveInput{
					LineID: lineIDs[i], ItemID: ln.ItemID, Qty: ln.Qty, Reserved: 0,
				})
			}
			if err := syncSalesOrderReservations(r.Context(), tx, tu.TenantID, body.LocationID, tu.AppUserID, reserveInputs, policy.LegacyCombinedSORelease); err != nil {
				response.Validation(w, map[string]string{"lines": err.Error()})
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		// Load Slip â†’ Save: copy quotation attachments (header and/or lines).
		quoIDs := map[int64]struct{}{}
		if body.SourceQuotationID != nil && *body.SourceQuotationID > 0 {
			quoIDs[*body.SourceQuotationID] = struct{}{}
		}
		for _, ln := range body.Lines {
			if ln.SourceQuotationLineID == nil || *ln.SourceQuotationLineID <= 0 {
				continue
			}
			var qid int64
			if err := pool.QueryRow(r.Context(),
				`select quotation_id from public.quo_quotation_lines where id = $1`,
				*ln.SourceQuotationLineID).Scan(&qid); err == nil && qid > 0 {
				quoIDs[qid] = struct{}{}
			}
		}
		for qid := range quoIDs {
			_, _ = attachmentx.Copy(r.Context(), pool, attachmentx.CopyParams{
				SrcBaseDir: attachmentx.Dir("quotation"),
				DstBaseDir: attachmentx.Dir("sales_order"),
				SrcTable:   "public.quo_quotation_attachments",
				SrcFKCol:   "quotation_id",
				SrcID:      qid,
				DstTable:   "public.so_sales_order_attachments",
				DstFKCol:   "sales_order_id",
				DstID:      id,
				TenantID:   tu.TenantID,
			})
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.create", "so_sales_order", &id, nil, body)
		so, _ := loadSalesOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, so, "Created.")
	}
}

func updateSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body salesOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSalesOrderBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date."})
			return
		}
		dueDate, err := parseOptionalDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Invalid date."})
			return
		}
		deliveryDate, err := parseOptionalDate(body.DeliveryDate)
		if err != nil {
			response.Validation(w, map[string]string{"delivery_date": "Invalid date."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		body.Lines = applyPartnerRatesToSOLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines)
		computed, errs := computeSalesOrderLines(r.Context(), pool, tu.TenantID, tt, body.Lines)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		subtotal, taxTotal, grandTotal := sumSalesOrderTotals(computed)

		before, _ := loadSalesOrder(r.Context(), pool, tu.TenantID, id)

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}

		// Re-validate the quotation requirement so an update cannot strip the link.
		if vErrs := processpolicy.ValidateSalesOrderCreate(policy, body.SourceQuotationID); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}

		newProgress := defaultProgress(body.ProgressStatus)
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSalesOrder, newProgress, id); v != nil {
			response.Validation(w, v)
			return
		}
		if newProgress == "in_progress" && before.ProgressStatus != "in_progress" {
			if clErrs, err := creditlimit.ValidateFromPolicy(r.Context(), pool, tu.TenantID, body.PartnerID, grandTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to validate credit limit.", "ERR_INTERNAL")
				return
			} else if clErrs != nil {
				response.Validation(w, clErrs)
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.so_sales_orders set
			  order_date = $1, tax_type_id = $2, currency_id = $3, partner_id = $4,
			  pic_user_id = $5, pic_name = $6, sales_person_id = $7, location_id = $8,
			  project_id = $9, project_name = $10,
			  due_date = $11, delivery_date = $12, reference = $13, notes = $14,
			  delivery_remarks = $15, payment_terms = $16, mop = $17,
			  progress_status = $18, subtotal = $19, tax_total = $20, grand_total = $21,
			  source_quotation_id = $22, updated_at = now()
			where id = $23 and tenant_id = $24 and deleted_at is null`,
			orderDate, body.TaxTypeID, body.CurrencyID, body.PartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.SalesPersonID, body.LocationID,
			body.ProjectID, body.ProjectName,
			dueDate, deliveryDate, body.Reference, body.Notes,
			body.DeliveryRemarks, body.PaymentTerms, body.Mop,
			defaultProgress(body.ProgressStatus), subtotal, taxTotal, grandTotal,
			body.SourceQuotationID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}

		if !policy.LegacyCombinedSORelease {
			oldLoc := body.LocationID
			if before.ID > 0 {
				oldLoc = before.LocationID
			}
			if err := unreserveAllSalesOrderLines(r.Context(), tx, tu.TenantID, oldLoc, tu.AppUserID, id); err != nil {
				response.Validation(w, map[string]string{"lines": err.Error()})
				return
			}
		}

		if err := replaceSalesOrderLines(r.Context(), tx, id, computed); err != nil {
			var blocked *lineSyncBlockedError
			if errors.As(err, &blocked) {
				response.Validation(w, map[string]string{"lines": blocked.Error()})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}

		if !policy.LegacyCombinedSORelease {
			rows, err := tx.Query(r.Context(), `
				select id, item_id, qty::float8, qty_reserved::float8
				from public.so_sales_order_lines where sales_order_id = $1 order by line_no`, id)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
				return
			}
			var reserveInputs []soLineReserveInput
			for rows.Next() {
				var inp soLineReserveInput
				if err := rows.Scan(&inp.LineID, &inp.ItemID, &inp.Qty, &inp.Reserved); err != nil {
					rows.Close()
					response.Err(w, http.StatusInternalServerError, "Failed to read line.", "ERR_INTERNAL")
					return
				}
				inp.Reserved = 0
				reserveInputs = append(reserveInputs, inp)
			}
			rows.Close()
			if err := syncSalesOrderReservations(r.Context(), tx, tu.TenantID, body.LocationID, tu.AppUserID, reserveInputs, policy.LegacyCombinedSORelease); err != nil {
				response.Validation(w, map[string]string{"lines": err.Error()})
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		after, _ := loadSalesOrder(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales_order.update", "so_sales_order", &id, before, after)
		response.OK(w, after, "Updated.")
	}
}

func deleteSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return documentlifecycle.DeleteHandler(pool, documentlifecycle.SalesOrderConfig())
}

func insertSalesOrderLines(ctx context.Context, tx pgx.Tx, salesOrderID int64, lines []computedLine) ([]int64, error) {
	var ids []int64
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		var id int64
		err := tx.QueryRow(ctx, `
			insert into public.so_sales_order_lines (
			  sales_order_id, line_no, item_id, item_code, item_name, description,
			  qty, unit_id, unit_code, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark,
			  source_quotation_line_id, planned_serial_nos
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
			returning id`,
			salesOrderID, lineNo, ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.Description,
			ln.Qty, ln.UnitID, ln.UnitCode, ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
			ln.Amounts.UnitVatInc, ln.Amounts.LineTotal, ln.Remark, ln.SourceQuotationLineID, ln.PlannedSerialNos).Scan(&id)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

type existingSOLine struct {
	ID     int64
	LineNo int
}

type lineSyncPlan struct {
	Updates []computedLine // ID set
	Inserts []computedLine // ID nil
	Deletes []int64
}

type lineSyncBlockedError struct {
	msg string
}

func (e *lineSyncBlockedError) Error() string { return e.msg }

// planSalesOrderLineSync matches incoming lines to existing rows so line IDs stay
// stable across saves (Load Slip / invoice / release links keep working).
// Prefer client-sent id when it belongs to this SO; otherwise match leftover rows by line_no.
func planSalesOrderLineSync(existing []existingSOLine, incoming []computedLine) lineSyncPlan {
	byID := make(map[int64]existingSOLine, len(existing))
	byLineNo := make(map[int]int64, len(existing))
	for _, ex := range existing {
		byID[ex.ID] = ex
		byLineNo[ex.LineNo] = ex.ID
	}

	used := make(map[int64]bool, len(existing))
	plan := lineSyncPlan{}

	for _, ln := range incoming {
		line := ln
		lineNo := line.LineNo
		if lineNo <= 0 {
			lineNo = len(plan.Updates) + len(plan.Inserts) + 1
			line.LineNo = lineNo
		}

		var matchID int64
		if line.ID != nil && *line.ID > 0 {
			if _, ok := byID[*line.ID]; ok && !used[*line.ID] {
				matchID = *line.ID
			}
		}
		if matchID == 0 {
			if id, ok := byLineNo[lineNo]; ok && !used[id] {
				matchID = id
			}
		}

		if matchID > 0 {
			idCopy := matchID
			line.ID = &idCopy
			plan.Updates = append(plan.Updates, line)
			used[matchID] = true
			continue
		}
		line.ID = nil
		plan.Inserts = append(plan.Inserts, line)
	}

	for _, ex := range existing {
		if !used[ex.ID] {
			plan.Deletes = append(plan.Deletes, ex.ID)
		}
	}
	return plan
}

func loadExistingSOLines(ctx context.Context, tx pgx.Tx, salesOrderID int64) ([]existingSOLine, error) {
	rows, err := tx.Query(ctx, `
		select id, line_no from public.so_sales_order_lines
		where sales_order_id = $1 order by line_no`, salesOrderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []existingSOLine
	for rows.Next() {
		var row existingSOLine
		if err := rows.Scan(&row.ID, &row.LineNo); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func updateSalesOrderLineRow(ctx context.Context, tx pgx.Tx, salesOrderID int64, ln computedLine) error {
	if ln.ID == nil || *ln.ID <= 0 {
		return errors.New("missing line id for update")
	}
	tag, err := tx.Exec(ctx, `
		update public.so_sales_order_lines set
		  line_no = $1, item_id = $2, item_code = $3, item_name = $4, description = $5,
		  qty = $6, unit_id = $7, unit_code = $8,
		  unit_non_vat = $9, non_vat_total = $10, tax_amount = $11,
		  unit_vat_inc = $12, line_total = $13, remark = $14,
		  source_quotation_line_id = $15, planned_serial_nos = $16
		where id = $17 and sales_order_id = $18`,
		ln.LineNo, ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.Description,
		ln.Qty, ln.UnitID, ln.UnitCode,
		ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
		ln.Amounts.UnitVatInc, ln.Amounts.LineTotal, ln.Remark,
		ln.SourceQuotationLineID, ln.PlannedSerialNos,
		*ln.ID, salesOrderID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("sales order line %d not found", *ln.ID)
	}
	return nil
}

// replaceSalesOrderLines updates lines in place when possible so downstream
// references (sales invoices, releases, shipping, WO) keep valid line IDs.
func replaceSalesOrderLines(ctx context.Context, tx pgx.Tx, salesOrderID int64, lines []computedLine) error {
	existing, err := loadExistingSOLines(ctx, tx, salesOrderID)
	if err != nil {
		return err
	}
	plan := planSalesOrderLineSync(existing, lines)

	// Avoid unique (sales_order_id, line_no) collisions while rewriting line_no.
	if _, err := tx.Exec(ctx, `
		update public.so_sales_order_lines
		set line_no = -id
		where sales_order_id = $1`, salesOrderID); err != nil {
		return err
	}

	for _, ln := range plan.Updates {
		if err := updateSalesOrderLineRow(ctx, tx, salesOrderID, ln); err != nil {
			return err
		}
	}
	if _, err := insertSalesOrderLines(ctx, tx, salesOrderID, plan.Inserts); err != nil {
		return err
	}
	if len(plan.Deletes) == 0 {
		return nil
	}
	if _, err := tx.Exec(ctx, `
		delete from public.so_sales_order_lines
		where sales_order_id = $1 and id = any($2)`, salesOrderID, plan.Deletes); err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			return &lineSyncBlockedError{
				msg: "Cannot remove a sales order line that is already linked to a sale, shipping order, delivery, or work order. Clear those documents first.",
			}
		}
		return err
	}
	return nil
}

func computeSalesOrderLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, tt taxcalc.TaxType, lines []salesOrderLineBody) ([]computedLine, map[string]string) {
	errs := map[string]string{}
	var out []computedLine
	for i, ln := range lines {
		if ln.Qty <= 0 {
			continue
		}
		if ln.ItemID == nil || *ln.ItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].item_id", i)] = "Register the product in Inventory before saving a sales order (quotations may use free-text items)."
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
			ID:                    ln.ID,
			LineNo:                ln.LineNo,
			ItemID:                ln.ItemID,
			ItemCode:              ln.ItemCode,
			ItemName:              ln.ItemName,
			Description:           ln.Description,
			Qty:                   ln.Qty,
			UnitID:                unitID,
			UnitCode:              unitCode,
			Amounts:               amounts,
			Remark:                ln.Remark,
			SourceQuotationLineID: ln.SourceQuotationLineID,
			PlannedSerialNos:      planned,
		})
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}

func applyPartnerRatesToSOLines(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, lines []salesOrderLineBody) []salesOrderLineBody {
	out := make([]salesOrderLineBody, len(lines))
	copy(out, lines)
	for i := range out {
		if out[i].ItemID != nil && *out[i].ItemID > 0 {
			out[i].UnitPrice = inventory.ResolveSellingUnitPrice(ctx, pool, tenantID, *out[i].ItemID, partnerID, out[i].UnitPrice)
		}
	}
	return out
}

func sumSalesOrderTotals(lines []computedLine) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.Amounts.NonVatTotal
		taxTotal += ln.Amounts.TaxAmount
		grandTotal += ln.Amounts.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func validateSalesOrderBody(b salesOrderBody, create bool) map[string]string {
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
	if b.PartnerID <= 0 {
		errs["partner_id"] = "Customer is required."
	}
	if b.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if b.ProgressStatus != "" && b.ProgressStatus != "unconfirmed" &&
		b.ProgressStatus != "in_progress" && b.ProgressStatus != "completed" {
		errs["progress_status"] = "Must be unconfirmed, in_progress, or completed."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func getCreatedSlips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.so_sales_orders where id = $1 and tenant_id = $2 and deleted_at is null)`,
			id, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select ln.id, ln.line_no, ln.item_code, ln.item_name, ln.qty::float8,
			  coalesce(rel.released, 0)::float8
			from public.so_sales_order_lines ln
			left join (
			  select sales_order_line_id, sum(release_qty) as released
			  from public.so_sales_order_release_lines
			  group by sales_order_line_id
			) rel on rel.sales_order_line_id = ln.id
			where ln.sales_order_id = $1
			order by ln.line_no`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load slips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []createdSlipLine
		for rows.Next() {
			var line createdSlipLine
			var released float64
			if err := rows.Scan(&line.LineID, &line.LineNo, &line.ItemCode, &line.ItemName, &line.Qty, &released); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read slips.", "ERR_INTERNAL")
				return
			}
			line.BalanceQty = line.Qty - released
			if line.BalanceQty < 0 {
				line.BalanceQty = 0
			}
			line.Slips = []createdSlipRow{}
			out = append(out, line)
		}

		if len(out) > 0 {
			lineIDs := make([]int64, len(out))
			for i, ln := range out {
				lineIDs[i] = ln.LineID
			}
			slipRows, err := pool.Query(r.Context(), `
				select rl.id, rl.sales_order_line_id, rl.release_qty::float8, rl.release_date
				from public.so_sales_order_release_lines rl
				where rl.sales_order_line_id = any($1)
				order by rl.sales_order_line_id, rl.created_at`, lineIDs)
			if err == nil {
				defer slipRows.Close()
				byLine := map[int64][]createdSlipRow{}
				for slipRows.Next() {
					var s createdSlipRow
					var lineID int64
					var releaseDate time.Time
					if err := slipRows.Scan(&s.ID, &lineID, &s.Qty, &releaseDate); err == nil {
						s.SlipType = "release"
						rd := releaseDate.Format("2006-01-02")
						s.ReleaseDate = &rd
						byLine[lineID] = append(byLine[lineID], s)
					}
				}
				for i := range out {
					if slips, ok := byLine[out[i].LineID]; ok {
						out[i].Slips = slips
					}
				}
			}
		}
		if out == nil {
			out = []createdSlipLine{}
		}
		response.OK(w, out, "OK")
	}
}
