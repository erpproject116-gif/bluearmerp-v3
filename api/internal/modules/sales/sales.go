package sales

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/crm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
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

type SaleLine struct {
	ID                     int64            `json:"id,omitempty"`
	LineNo                 int              `json:"line_no"`
	ItemID                 *int64           `json:"item_id,omitempty"`
	ItemCode               string           `json:"item_code"`
	ItemName               string           `json:"item_name"`
	Description            *string          `json:"description,omitempty"`
	Qty                    float64          `json:"qty"`
	ReturnedQty            float64          `json:"returned_qty"`
	UnitID                 *int64           `json:"unit_id,omitempty"`
	UnitCode               string           `json:"unit_code,omitempty"`
	UnitNonVat             float64          `json:"unit_non_vat"`
	NonVatTotal            float64          `json:"non_vat_total"`
	TaxAmount              float64          `json:"tax_amount"`
	UnitVatInc             float64          `json:"unit_vat_inc"`
	LineTotal              float64          `json:"line_total"`
	DiscountAmount         float64          `json:"discount_amount"`
	DiscountedUnitNonVat   float64          `json:"discounted_unit_non_vat"`
	DiscountedUnitVatInc   float64          `json:"discounted_unit_vat_inc"`
	Remark                 *string          `json:"remark,omitempty"`
	SerialLotNo            *string          `json:"serial_lot_no,omitempty"`
	SerialUnitIDs          []int64          `json:"serial_unit_ids,omitempty"`
	SerialUnits            []SaleSerialUnit `json:"serial_units,omitempty"`
	TrackSerial            bool             `json:"track_serial,omitempty"`
	TrackLot               bool             `json:"track_lot,omitempty"`
	LotBatchID             *int64           `json:"lot_batch_id,omitempty"`
	LotNo                  string           `json:"lot_no,omitempty"`
	SerialPolicy           string           `json:"serial_policy,omitempty"`
	LotPolicy              string           `json:"lot_policy,omitempty"`
	SourceSalesOrderLineID *int64           `json:"source_sales_order_line_id,omitempty"`
	SourceQuotationLineID  *int64           `json:"source_quotation_line_id,omitempty"`
}

type SaleSerialUnit struct {
	ID       int64  `json:"id"`
	SerialNo string `json:"serial_no"`
}

type Sale struct {
	ID                 int64                `json:"id"`
	OrderDate          string               `json:"order_date"`
	DateSeq            int                  `json:"date_seq"`
	DateNoDisplay      string               `json:"date_no_display"`
	SalesNo            string               `json:"sales_no"`
	TaxTypeID          int64                `json:"tax_type_id"`
	TaxTypeName        string               `json:"tax_type_name,omitempty"`
	CurrencyID         int64                `json:"currency_id"`
	CurrencyCode       string               `json:"currency_code,omitempty"`
	PartnerID          int64                `json:"partner_id"`
	CustomerName       string               `json:"customer_name"`
	PicUserID          *int64               `json:"pic_user_id,omitempty"`
	PicName            string               `json:"pic_name"`
	LocationID         int64                `json:"location_id"`
	LocationName       string               `json:"location_name,omitempty"`
	ProjectID          *int64               `json:"project_id,omitempty"`
	ProjectName        *string              `json:"project_name,omitempty"`
	DueDate            *string              `json:"due_date,omitempty"`
	TermsOfPayment     *string              `json:"terms_of_payment,omitempty"`
	PaymentTerms       *string              `json:"payment_terms,omitempty"`
	SiDrNo             *string              `json:"si_dr_no,omitempty"`
	Notes              *string              `json:"notes,omitempty"`
	ProgressStatus     string               `json:"progress_status"`
	InvoicingStatus    bool                 `json:"invoicing_status"`
	TemplateCode       string               `json:"template_code"`
	SalesCategory      *string              `json:"sales_category,omitempty"`
	SourceSalesOrderID *int64               `json:"source_sales_order_id,omitempty"`
	Subtotal           float64              `json:"subtotal"`
	TaxTotal           float64              `json:"tax_total"`
	GrandTotal         float64              `json:"grand_total"`
	CreatedByUserID    *int64               `json:"created_by_user_id,omitempty"`
	CreatedByName      string               `json:"created_by_name,omitempty"`
	ItemNameSummary    string               `json:"item_name_summary,omitempty"`
	Lines              []SaleLine           `json:"lines,omitempty"`
	Commissions        []SaleCommissionLine `json:"commissions,omitempty"`
	CustomValues       map[string]any       `json:"custom_values,omitempty"`
}

type saleLineBody struct {
	LineNo                 int     `json:"line_no"`
	ItemID                 *int64  `json:"item_id"`
	ItemCode               string  `json:"item_code"`
	ItemName               string  `json:"item_name"`
	Description            *string `json:"description"`
	Qty                    float64 `json:"qty"`
	UnitID                 *int64  `json:"unit_id"`
	UnitCode               string  `json:"unit_code"`
	UnitPrice              float64 `json:"unit_price"`
	InputBasis             string  `json:"input_basis"`
	DiscountAmount         float64 `json:"discount_amount"`
	Remark                 *string `json:"remark"`
	SerialLotNo            *string `json:"serial_lot_no"`
	SerialUnitIDs          []int64 `json:"serial_unit_ids,omitempty"`
	LotBatchID             *int64  `json:"lot_batch_id"`
	SourceSalesOrderLineID *int64  `json:"source_sales_order_line_id"`
	SourceQuotationLineID  *int64  `json:"source_quotation_line_id"`
}

type saleBody struct {
	OrderDate          string                   `json:"order_date"`
	TaxTypeID          int64                    `json:"tax_type_id"`
	CurrencyID         int64                    `json:"currency_id"`
	PartnerID          int64                    `json:"partner_id"`
	PicUserID          *int64                   `json:"pic_user_id"`
	PicName            string                   `json:"pic_name"`
	LocationID         int64                    `json:"location_id"`
	ProjectID          *int64                   `json:"project_id"`
	ProjectName        *string                  `json:"project_name"`
	DueDate            *string                  `json:"due_date"`
	TermsOfPayment     *string                  `json:"terms_of_payment"`
	PaymentTerms       *string                  `json:"payment_terms"`
	SiDrNo             *string                  `json:"si_dr_no"`
	Notes              *string                  `json:"notes"`
	ProgressStatus     string                   `json:"progress_status"`
	TemplateCode       string                   `json:"template_code"`
	SalesCategory      *string                  `json:"sales_category"`
	SourceSalesOrderID *int64                   `json:"source_sales_order_id"`
	Lines              []saleLineBody           `json:"lines"`
	Commissions        []saleCommissionLineBody `json:"commissions"`
	CustomValues       map[string]any           `json:"custom_values"`
}

type computedLine struct {
	LineNo                 int
	ItemID                 *int64
	ItemCode               string
	ItemName               string
	Description            *string
	Qty                    float64
	UnitID                 *int64
	UnitCode               *string
	Amounts                taxcalc.LineAmounts
	DiscountAmount         float64
	DiscountedUnitNonVat   float64
	DiscountedUnitVatInc   float64
	Remark                 *string
	SerialLotNo            *string
	LotBatchID             *int64
	SourceSalesOrderLineID *int64
	SourceQuotationLineID  *int64
}

func registerSalesRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerCommissionRoutes(r, pool)
	registerAttachmentRoutes(r, pool)
	registerCollectiveInvoiceRoutes(r, pool)
	registerCollectiveInvoiceLinkRoutes(r, pool)
	registerSalesReturnRoutes(r, pool)
	registerCustomerCreditBalanceRoutes(r, pool)
	registerSalesApprovalRoutes(r, pool)
	registerSalesHoldRoutes(r, pool)
	documentlifecycle.RegisterRoutes(r, pool, "", documentlifecycle.SaleConfig())
	r.Get("/preview-sequences", previewSalesSequences(pool))
	r.Get("/sales-order-lines/open", listOpenSalesOrderLines(pool))
	r.Get("/status-report/export", exportSalesStatusReport(pool))
	r.Get("/status-report", listSalesStatusReport(pool))
	r.Get("/discount-status-report/export", exportDiscountStatusReport(pool))
	r.Get("/discount-status-report", listDiscountStatusReport(pool))
	r.Get("/pre-invoicing-report/export", exportPreInvoicingReport(pool))
	r.Get("/pre-invoicing-report", listPreInvoicingReport(pool))
	r.Get("/price-batch/lines", listPriceBatchLines(pool))
	r.Patch("/price-batch/lines", patchPriceBatchLines(pool))
	r.Get("/", listSales(pool))
	r.Post("/", createSale(pool))
	r.Get("/print-batch", getSalesPrintBatch(pool))
	r.Get("/{id}/print", getSalesPrint(pool))
	r.Get("/{id}/pdf", getSalesPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/{id}/send-email", postSalesSendEmail(pool))
	r.Patch("/{id}/progress-status", patchSalesProgressStatus(pool))
	r.Patch("/{id}/invoicing-status", patchSalesInvoicingStatus(pool))
	r.Get("/{id}/invoice", getSalesInvoice(pool))
	r.Put("/{id}/invoice", putSalesInvoice(pool))
	r.Get("/{id}", getSale(pool))
	r.Patch("/{id}", updateSale(pool))
	r.Delete("/{id}", deleteSale(pool))
	r.With(auth.RequirePermission("sales.sales_return", "write")).Post("/{id}/return-lines", postReturnSaleLines(pool))
}

func previewSalesSequences(pool *pgxpool.Pool) http.HandlerFunc {
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
		var salesNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, sales_no from public.preview_sales_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &salesNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":        dateSeq,
			"sales_no":        salesNo,
			"date_no_display": formatDateNoDisplay(orderDate, dateSeq),
		}, "OK")
	}
}

func listSales(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date":       "s.order_date",
		"sales_no":         "s.sales_no",
		"customer_name":    "p.company_name",
		"due_date":         "s.due_date",
		"grand_total":      "s.grand_total",
		"progress_status":  "s.progress_status",
		"invoicing_status": "s.invoicing_status",
		"created_at":       "s.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", allowed)
		offset := httputil.Offset(p)

		lifecycleWhere, err := documentlifecycle.ListPredicate(r, "s")
		if err != nil {
			response.Validation(w, map[string]string{"lifecycle": err.Error()})
			return
		}
		where := "s.tenant_id = $1 and " + lifecycleWhere
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				s.sales_no ilike $%d or p.company_name ilike $%d or
				coalesce(s.si_dr_no, '') ilike $%d or
				(to_char(s.order_date, 'MM/DD/YYYY') || '-' || s.date_seq) ilike $%d or
				exists (
					select 1 from public.sa_sales_lines ln
					where ln.sales_id = s.id and ln.item_name ilike $%d
				))`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pid := strings.TrimSpace(r.URL.Query().Get("partner_id")); pid != "" {
			if pidVal, e := strconv.ParseInt(pid, 10, 64); e == nil && pidVal > 0 {
				where += fmt.Sprintf(" and s.partner_id = $%d", argN)
				args = append(args, pidVal)
				argN++
			}
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "unconfirmed" || progress == "e_approval" || progress == "completed" {
			where += fmt.Sprintf(" and s.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if progress == "confirm" {
			where += fmt.Sprintf(" and s.progress_status = $%d", argN)
			args = append(args, "completed")
			argN++
		} else if p.Status == "unconfirmed" || p.Status == "e_approval" || p.Status == "completed" {
			where += fmt.Sprintf(" and s.progress_status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}
		if inv := strings.TrimSpace(r.URL.Query().Get("invoicing_status")); inv == "true" || inv == "false" {
			where += fmt.Sprintf(" and s.invoicing_status = $%d", argN)
			args = append(args, inv == "true")
			argN++
		}

		scope, argN := tu.PicOrCreatedScopeSQL("s", argN, &args)
		where += scope

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "s.partner_id",
			LocationColumn: "s.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select s.id, s.order_date, s.date_seq, s.sales_no,
			  s.tax_type_id, tt.name, s.currency_id, c.currency_code,
			  s.partner_id, p.company_name, s.pic_user_id, s.pic_name,
			  s.location_id, l.location_name, s.due_date, s.payment_terms, s.si_dr_no,
			  s.progress_status, s.invoicing_status, s.grand_total::float8,
			  coalesce(u.full_name, ''),
			  (select ln.item_name from public.sa_sales_lines ln
			   where ln.sales_id = s.id order by ln.line_no limit 1),
			  (select count(*)::int from public.sa_sales_lines ln where ln.sales_id = s.id),
			  count(*) over()
			from public.sa_sales s
			join public.inv_partners p on p.id = s.partner_id
			join public.quo_tax_types tt on tt.id = s.tax_type_id
			join public.quo_currencies c on c.id = s.currency_id
			join public.inv_locations l on l.id = s.location_id
			left join public.users u on u.id = s.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Sale
		var total int64
		for rows.Next() {
			var row Sale
			var orderDate time.Time
			var dueDate *time.Time
			var firstItemName *string
			var lineCount int
			if err := rows.Scan(
				&row.ID, &orderDate, &row.DateSeq, &row.SalesNo,
				&row.TaxTypeID, &row.TaxTypeName, &row.CurrencyID, &row.CurrencyCode,
				&row.PartnerID, &row.CustomerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &row.LocationName, &dueDate, &row.PaymentTerms, &row.SiDrNo,
				&row.ProgressStatus, &row.InvoicingStatus, &row.GrandTotal,
				&row.CreatedByName, &firstItemName, &lineCount, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales.", "ERR_INTERNAL")
				return
			}
			row.OrderDate = dateToStr(orderDate)
			row.DateNoDisplay = formatDateNoDisplay(orderDate, row.DateSeq)
			row.DueDate = datePtrToStr(dueDate)
			row.ItemNameSummary = formatItemNameSummary(firstItemName, lineCount)
			out = append(out, row)
		}
		if out == nil {
			out = []Sale{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getSale(pool *pgxpool.Pool) http.HandlerFunc {
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
		sale, err := loadSale(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, sale, "OK")
	}
}

func loadSale(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Sale, error) {
	var sale Sale
	var orderDate time.Time
	var dueDate *time.Time
	var createdByName *string

	err := pool.QueryRow(ctx, `
		select s.id, s.order_date, s.date_seq, s.sales_no,
		  s.tax_type_id, tt.name, s.currency_id, c.currency_code,
		  s.partner_id, p.company_name, s.pic_user_id, s.pic_name,
		  s.location_id, l.location_name, s.project_id, s.project_name,
		  s.due_date, s.terms_of_payment, s.payment_terms, s.si_dr_no, s.notes,
		  s.progress_status, s.invoicing_status, s.template_code, s.sales_category,
		  s.source_sales_order_id,
		  s.subtotal::float8, s.tax_total::float8, s.grand_total::float8,
		  s.created_by_user_id, u.full_name
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		join public.quo_tax_types tt on tt.id = s.tax_type_id
		join public.quo_currencies c on c.id = s.currency_id
		join public.inv_locations l on l.id = s.location_id
		left join public.users u on u.id = s.created_by_user_id
		where s.id = $1 and s.tenant_id = $2 and `+documentlifecycle.DetailPredicate(ctx, "s"),
		id, tenantID).Scan(
		&sale.ID, &orderDate, &sale.DateSeq, &sale.SalesNo,
		&sale.TaxTypeID, &sale.TaxTypeName, &sale.CurrencyID, &sale.CurrencyCode,
		&sale.PartnerID, &sale.CustomerName, &sale.PicUserID, &sale.PicName,
		&sale.LocationID, &sale.LocationName, &sale.ProjectID, &sale.ProjectName,
		&dueDate, &sale.TermsOfPayment, &sale.PaymentTerms, &sale.SiDrNo, &sale.Notes,
		&sale.ProgressStatus, &sale.InvoicingStatus, &sale.TemplateCode, &sale.SalesCategory,
		&sale.SourceSalesOrderID,
		&sale.Subtotal, &sale.TaxTotal, &sale.GrandTotal,
		&sale.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return Sale{}, err
	}
	sale.OrderDate = dateToStr(orderDate)
	sale.DateNoDisplay = formatDateNoDisplay(orderDate, sale.DateSeq)
	sale.DueDate = datePtrToStr(dueDate)
	if createdByName != nil {
		sale.CreatedByName = *createdByName
	}

	lines, err := loadSaleLines(ctx, pool, id)
	if err != nil {
		return Sale{}, err
	}
	sale.Lines = lines
	comms, err := loadSaleCommissions(ctx, pool, tenantID, id)
	if err != nil {
		return Sale{}, err
	}
	sale.Commissions = comms
	sale.CustomValues = attachCustom(ctx, pool, tenantID, entitySales, id)
	return sale, nil
}

func loadSaleLines(ctx context.Context, pool *pgxpool.Pool, salesID int64) ([]SaleLine, error) {
	rows, err := pool.Query(ctx, `
		select sl.id, sl.line_no, sl.item_id, sl.item_code, sl.item_name, sl.description,
		  sl.qty::float8, coalesce(sl.returned_qty, 0)::float8,
		  sl.unit_id, coalesce(sl.unit_code, ''),
		  sl.unit_non_vat::float8, sl.non_vat_total::float8, sl.tax_amount::float8,
		  sl.unit_vat_inc::float8, sl.line_total::float8,
		  sl.discount_amount::float8, sl.discounted_unit_non_vat::float8, sl.discounted_unit_vat_inc::float8,
		  sl.remark, sl.serial_lot_no, sl.lot_batch_id, sl.source_sales_order_line_id, sl.source_quotation_line_id,
		  coalesce(i.track_serial, false), coalesce(i.track_lot, false),
		  coalesce(i.serial_policy, 'required'), coalesce(i.lot_policy, 'required'),
		  coalesce((
		    select array_agg(j.serial_unit_id order by su.serial_no)
		    from public.inv_serial_unit_sales_lines j
		    join public.inv_serial_units su on su.id = j.serial_unit_id
		    where j.sales_line_id = sl.id
		  ), '{}'),
		  coalesce((
		    select json_agg(json_build_object('id', su.id, 'serial_no', su.serial_no) order by su.serial_no)
		    from public.inv_serial_unit_sales_lines j
		    join public.inv_serial_units su on su.id = j.serial_unit_id
		    where j.sales_line_id = sl.id and su.status = 'sold'
		  ), '[]'::json),
		  coalesce(lb.lot_no, '')
		from public.sa_sales_lines sl
		left join public.inv_items i on i.id = sl.item_id
		left join public.inv_lot_batches lb on lb.id = sl.lot_batch_id
		where sl.sales_id = $1
		order by sl.line_no`, salesID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []SaleLine
	for rows.Next() {
		var ln SaleLine
		var serialUnitsJSON []byte
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Description,
			&ln.Qty, &ln.ReturnedQty, &ln.UnitID, &ln.UnitCode,
			&ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount,
			&ln.UnitVatInc, &ln.LineTotal,
			&ln.DiscountAmount, &ln.DiscountedUnitNonVat, &ln.DiscountedUnitVatInc,
			&ln.Remark, &ln.SerialLotNo, &ln.LotBatchID, &ln.SourceSalesOrderLineID, &ln.SourceQuotationLineID,
			&ln.TrackSerial, &ln.TrackLot, &ln.SerialPolicy, &ln.LotPolicy, &ln.SerialUnitIDs,
			&serialUnitsJSON, &ln.LotNo); err != nil {
			return nil, err
		}
		if len(serialUnitsJSON) > 0 && string(serialUnitsJSON) != "null" {
			_ = json.Unmarshal(serialUnitsJSON, &ln.SerialUnits)
		}
		if ln.SerialUnits == nil {
			ln.SerialUnits = []SaleSerialUnit{}
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []SaleLine{}
	}
	return lines, nil
}

func createSale(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body saleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSaleBody(body, true); errs != nil {
			response.ValidationSmart(w, errs)
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

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		templateCode := defaultTemplateCode(body.TemplateCode)
		body.Lines = applyPartnerRatesToSaleLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines)
		computed, errs := computeSaleLines(tt, templateCode, body.Lines)
		if errs != nil {
			response.ValidationSmart(w, errs)
			return
		}
		resolveComputedLineUnits(r.Context(), pool, tu.TenantID, computed)
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		hasSOLinkedLine := false
		for _, ln := range body.Lines {
			if ln.SourceSalesOrderLineID != nil && *ln.SourceSalesOrderLineID > 0 {
				hasSOLinkedLine = true
				break
			}
		}
		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if vErrs := processpolicy.ValidateDirectSale(policy, hasSOLinkedLine); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}
		if v := validateSourceSOApproval(r.Context(), pool, tu.TenantID, policy, body.SourceSalesOrderID, body.Lines); v != nil {
			response.Validation(w, v)
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSales, defaultProgress(body.ProgressStatus), 0); v != nil {
			response.Validation(w, v)
			return
		}

		if convErrs := validateSalesOrderConversion(r.Context(), pool, tu.TenantID, computed); convErrs != nil {
			response.Validation(w, convErrs)
			return
		}

		subtotal, taxTotal, grandTotal := sumSaleTotals(computed)

		if clErrs, err := creditlimit.ValidateFromPolicy(r.Context(), pool, tu.TenantID, body.PartnerID, grandTotal); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check credit limit.", "ERR_INTERNAL")
			return
		} else if clErrs != nil {
			response.Validation(w, clErrs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var salesNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &salesNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		dateNoDisplay := formatDateNoDisplay(orderDate, dateSeq)

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sa_sales (
			  tenant_id, order_date, date_seq, sales_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
			  location_id, project_id, project_name,
			  due_date, terms_of_payment, payment_terms, si_dr_no, notes,
			  progress_status, template_code, sales_category, source_sales_order_id,
			  subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
			returning id`,
			tu.TenantID, orderDate, dateSeq, salesNo,
			body.TaxTypeID, body.CurrencyID, body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.LocationID, body.ProjectID, body.ProjectName,
			dueDate, body.TermsOfPayment, body.PaymentTerms, body.SiDrNo, body.Notes,
			defaultProgress(body.ProgressStatus), templateCode, body.SalesCategory, body.SourceSalesOrderID,
			subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert sales.", "ERR_INTERNAL")
			return
		}

		if err := insertSaleLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}

		if v := validateCommissionBodies(body.Commissions); v != nil {
			response.Validation(w, v)
			return
		}
		if err := replaceSaleCommissions(r.Context(), tx, tu.TenantID, id, grandTotal, body.Commissions); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save commissions.", "ERR_INTERNAL")
			return
		}

		if err := validateSaleSerialRequirements(r.Context(), tx, tu.TenantID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := validateSaleLotRequirements(r.Context(), tx, tu.TenantID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := applySaleSerialUnits(r.Context(), tx, tu.TenantID, id, body.PartnerID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := applySaleStock(r.Context(), tx, tu.TenantID, id, body.LocationID, tu.AppUserID); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := applySaleLot(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}

		if _, err := crm.SyncWarrantyAssetsFromSale(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync warranty assets.", "ERR_INTERNAL")
			return
		}

		if err := writeSalesOrderSlipsForSales(r.Context(), tx, tu.TenantID, id, tu.AppUserID, salesNo, dateNoDisplay, computed, salesUsesDeliveryBalance(policy)); err != nil {
			response.Validation(w, map[string]string{"conversion": err.Error()})
			return
		}

		if defaultProgress(body.ProgressStatus) == "completed" {
			if err := accrueCommissionForSale(r.Context(), tx, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to accrue commission.", "ERR_INTERNAL")
				return
			}
			if err := accrueSaleLineCommissions(r.Context(), tx, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to accrue TIC commissions.", "ERR_INTERNAL")
				return
			}
			if err := postCommissionJournalForSale(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post commission journal.", "ERR_INTERNAL")
				return
			}
		}

		if errs := saveCustom(r.Context(), tx, tu.TenantID, entitySales, id, body.CustomValues); errs != nil {
			response.ValidationSmart(w, errs)
			return
		}

		if err := syncSalesInvoiceJournalFromDefaultsTx(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync sales journal.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		// Load Slip → Save: copy originating SO / Quotation attachments (body + persisted lines).
		copied := copySaleSourceAttachments(r.Context(), pool, tu.TenantID, id, body)

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.create", "sa_sales", &id, nil, body)
		sale, _ := loadSale(r.Context(), pool, tu.TenantID, id)
		response.OK(w, sale, saleCreateMessage(copied))
	}
}

func updateSale(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body saleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSaleBody(body, false); errs != nil {
			response.ValidationSmart(w, errs)
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

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		templateCode := defaultTemplateCode(body.TemplateCode)
		body.Lines = applyPartnerRatesToSaleLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines)
		computed, errs := computeSaleLines(tt, templateCode, body.Lines)
		if errs != nil {
			response.ValidationSmart(w, errs)
			return
		}
		resolveComputedLineUnits(r.Context(), pool, tu.TenantID, computed)
		subtotal, taxTotal, grandTotal := sumSaleTotals(computed)

		if convErrs := validateSalesOrderConversion(r.Context(), pool, tu.TenantID, computed); convErrs != nil {
			response.Validation(w, convErrs)
			return
		}

		before, errBefore := loadSale(r.Context(), pool, tu.TenantID, id)
		if errBefore == nil && before.ProgressStatus == "e_approval" {
			response.Validation(w, map[string]string{"progress_status": "Cannot edit a sale pending approval."})
			return
		}

		policy, err := processpolicy.Load(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		hasSOLinkedLine := false
		for _, ln := range body.Lines {
			if ln.SourceSalesOrderLineID != nil && *ln.SourceSalesOrderLineID > 0 {
				hasSOLinkedLine = true
				break
			}
		}
		// Re-validate source requirements on update so edits cannot strip the SO link.
		if vErrs := processpolicy.ValidateDirectSale(policy, hasSOLinkedLine); vErrs != nil {
			response.Validation(w, vErrs)
			return
		}
		if v := validateSourceSOApproval(r.Context(), pool, tu.TenantID, policy, body.SourceSalesOrderID, body.Lines); v != nil {
			response.Validation(w, v)
			return
		}
		if v := processpolicy.ValidateAttachmentRequired(r.Context(), pool, policy, processpolicy.DocSales, defaultProgress(body.ProgressStatus), id); v != nil {
			response.Validation(w, v)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.sa_sales set
			  order_date = $1, tax_type_id = $2, currency_id = $3, partner_id = $4,
			  pic_user_id = $5, pic_name = $6, location_id = $7,
			  project_id = $8, project_name = $9,
			  due_date = $10, terms_of_payment = $11, payment_terms = $12, si_dr_no = $13, notes = $14,
			  progress_status = $15, template_code = $16, sales_category = $17, source_sales_order_id = $18,
			  subtotal = $19, tax_total = $20, grand_total = $21, updated_at = now()
			where id = $22 and tenant_id = $23 and deleted_at is null`,
			orderDate, body.TaxTypeID, body.CurrencyID, body.PartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName,
			dueDate, body.TermsOfPayment, body.PaymentTerms, body.SiDrNo, body.Notes,
			defaultProgress(body.ProgressStatus), templateCode, body.SalesCategory, body.SourceSalesOrderID,
			subtotal, taxTotal, grandTotal, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}

		if err := reverseSaleStock(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse stock.", "ERR_INTERNAL")
			return
		}
		if err := reverseSaleLot(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse lot stock.", "ERR_INTERNAL")
			return
		}
		if err := reverseSaleSerials(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse serials.", "ERR_INTERNAL")
			return
		}

		if err := replaceSaleLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}

		if v := validateCommissionBodies(body.Commissions); v != nil {
			response.Validation(w, v)
			return
		}
		if err := replaceSaleCommissions(r.Context(), tx, tu.TenantID, id, grandTotal, body.Commissions); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save commissions.", "ERR_INTERNAL")
			return
		}

		if err := validateSaleSerialRequirements(r.Context(), tx, tu.TenantID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := validateSaleLotRequirements(r.Context(), tx, tu.TenantID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := applySaleSerialUnits(r.Context(), tx, tu.TenantID, id, body.PartnerID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := applySaleStock(r.Context(), tx, tu.TenantID, id, body.LocationID, tu.AppUserID); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := applySaleLot(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if _, err := crm.SyncWarrantyAssetsFromSale(r.Context(), tx, tu.TenantID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync warranty assets.", "ERR_INTERNAL")
			return
		}

		newStatus := defaultProgress(body.ProgressStatus)
		if newStatus == "completed" && before.ProgressStatus != "completed" {
			if err := accrueCommissionForSale(r.Context(), tx, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to accrue commission.", "ERR_INTERNAL")
				return
			}
			if err := accrueSaleLineCommissions(r.Context(), tx, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to accrue TIC commissions.", "ERR_INTERNAL")
				return
			}
			if err := postCommissionJournalForSale(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post commission journal.", "ERR_INTERNAL")
				return
			}
		} else if newStatus == "completed" {
			// Re-save may add/change TIC lines after already completed.
			if err := accrueSaleLineCommissions(r.Context(), tx, tu.TenantID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to accrue TIC commissions.", "ERR_INTERNAL")
				return
			}
			if err := postCommissionJournalForSale(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post commission journal.", "ERR_INTERNAL")
				return
			}
		}

		if errs := saveCustom(r.Context(), tx, tu.TenantID, entitySales, id, body.CustomValues); errs != nil {
			response.ValidationSmart(w, errs)
			return
		}

		if err := syncSalesInvoiceJournalFromDefaultsTx(r.Context(), tx, tu.TenantID, tu.AppUserID, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync sales journal.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		after, _ := loadSale(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.update", "sa_sales", &id, before, after)
		response.OK(w, after, "Updated.")
	}
}

func deleteSale(pool *pgxpool.Pool) http.HandlerFunc {
	return documentlifecycle.DeleteHandler(pool, documentlifecycle.SaleConfig())
}

func insertSaleLines(ctx context.Context, tx pgx.Tx, salesID int64, lines []computedLine) error {
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		_, err := tx.Exec(ctx, `
			insert into public.sa_sales_lines (
			  sales_id, line_no, item_id, item_code, item_name, description,
			  qty, unit_id, unit_code, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total,
			  discount_amount, discounted_unit_non_vat, discounted_unit_vat_inc,
			  remark, serial_lot_no, lot_batch_id, source_sales_order_line_id, source_quotation_line_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
			salesID, lineNo, ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.Description,
			ln.Qty, ln.UnitID, ln.UnitCode, ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
			ln.Amounts.UnitVatInc, ln.Amounts.LineTotal,
			ln.DiscountAmount, ln.DiscountedUnitNonVat, ln.DiscountedUnitVatInc,
			ln.Remark, ln.SerialLotNo, ln.LotBatchID, ln.SourceSalesOrderLineID, ln.SourceQuotationLineID)
		if err != nil {
			return err
		}
	}
	return nil
}

func replaceSaleLines(ctx context.Context, tx pgx.Tx, salesID int64, lines []computedLine) error {
	if _, err := tx.Exec(ctx, `delete from public.sa_sales_lines where sales_id = $1`, salesID); err != nil {
		return err
	}
	return insertSaleLines(ctx, tx, salesID, lines)
}

func computeSaleLines(tt taxcalc.TaxType, templateCode string, lines []saleLineBody) ([]computedLine, map[string]string) {
	errs := map[string]string{}
	var out []computedLine
	for i, ln := range lines {
		if ln.Qty <= 0 {
			continue
		}
		if ln.ItemID == nil || *ln.ItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].item_id", i)] = "Register the product in Inventory before saving a sales invoice."
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
		discountedUnitNonVat := amounts.UnitNonVat
		discountedUnitVatInc := amounts.UnitVatInc
		discountAmount := ln.DiscountAmount

		if hasDiscountTemplate(templateCode) && discountAmount > 0 {
			perUnitDiscount := discountAmount / ln.Qty
			discountedUnitNonVat = amounts.UnitNonVat - perUnitDiscount
			if discountedUnitNonVat < 0 {
				discountedUnitNonVat = 0
			}
			discounted := taxcalc.ComputeLine(tt, discountedUnitNonVat, ln.Qty, taxcalc.InputNonVatUnit)
			discountedUnitNonVat = discounted.UnitNonVat
			discountedUnitVatInc = discounted.UnitVatInc
			amounts = discounted
		}

		var unitCode *string
		if c := strings.TrimSpace(ln.UnitCode); c != "" {
			unitCode = &c
		}
		out = append(out, computedLine{
			LineNo:                 ln.LineNo,
			ItemID:                 ln.ItemID,
			ItemCode:               ln.ItemCode,
			ItemName:               ln.ItemName,
			Description:            ln.Description,
			Qty:                    ln.Qty,
			UnitID:                 ln.UnitID,
			UnitCode:               unitCode,
			Amounts:                amounts,
			DiscountAmount:         discountAmount,
			DiscountedUnitNonVat:   discountedUnitNonVat,
			DiscountedUnitVatInc:   discountedUnitVatInc,
			Remark:                 ln.Remark,
			SerialLotNo:            ln.SerialLotNo,
			LotBatchID:             ln.LotBatchID,
			SourceSalesOrderLineID: ln.SourceSalesOrderLineID,
			SourceQuotationLineID:  ln.SourceQuotationLineID,
		})
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}

// resolveComputedLineUnits fills unit_id/unit_code from the item base unit when the
// caller did not pick a unit explicitly.
func resolveComputedLineUnits(ctx context.Context, q inventory.UnitQuerier, tenantID int64, lines []computedLine) {
	for i := range lines {
		code := ""
		if lines[i].UnitCode != nil {
			code = *lines[i].UnitCode
		}
		unitID, unitCode := inventory.ResolveLineUnit(ctx, q, tenantID, lines[i].ItemID, lines[i].UnitID, code)
		lines[i].UnitID = unitID
		lines[i].UnitCode = unitCode
	}
}

func applyPartnerRatesToSaleLines(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, lines []saleLineBody) []saleLineBody {
	out := make([]saleLineBody, len(lines))
	copy(out, lines)
	for i := range out {
		if out[i].ItemID != nil && *out[i].ItemID > 0 {
			out[i].UnitPrice = inventory.ResolveSellingUnitPrice(ctx, pool, tenantID, *out[i].ItemID, partnerID, out[i].UnitPrice)
		}
	}
	return out
}

func sumSaleTotals(lines []computedLine) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.Amounts.NonVatTotal
		taxTotal += ln.Amounts.TaxAmount
		grandTotal += ln.Amounts.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func validateSaleBody(b saleBody, create bool) map[string]string {
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
	if b.ProgressStatus == "e_approval" {
		errs["progress_status"] = "Use Submit for approval."
	}
	if b.ProgressStatus != "" && b.ProgressStatus != "unconfirmed" && b.ProgressStatus != "completed" {
		errs["progress_status"] = "Must be unconfirmed or completed."
	}
	if b.TemplateCode != "" && !validTemplateCode(b.TemplateCode) {
		errs["template_code"] = "Must be default, non_vat, or vat_included."
	}
	if b.TermsOfPayment != nil && *b.TermsOfPayment != "" &&
		*b.TermsOfPayment != "30_days_terms" && *b.TermsOfPayment != "cash" {
		errs["terms_of_payment"] = "Must be 30_days_terms or cash."
	}
	if b.SalesCategory != nil && *b.SalesCategory != "" &&
		*b.SalesCategory != "general" && *b.SalesCategory != "returns" {
		errs["sales_category"] = "Must be general or returns."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultTemplateCode(s string) string {
	s = strings.TrimSpace(s)
	if validTemplateCode(s) {
		return s
	}
	return "default"
}

func validTemplateCode(s string) bool {
	return s == "default" || s == "non_vat" || s == "vat_included"
}

func hasDiscountTemplate(templateCode string) bool {
	return templateCode == "non_vat" || templateCode == "vat_included"
}
