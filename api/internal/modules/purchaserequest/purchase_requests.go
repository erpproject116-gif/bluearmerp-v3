package purchaserequest

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
)

type PurchaseRequestLine struct {
	ID          int64   `json:"id,omitempty"`
	LineNo      int     `json:"line_no"`
	PartnerID   *int64  `json:"partner_id,omitempty"`
	PartnerCode string  `json:"partner_code"`
	PartnerName string  `json:"partner_name"`
	ItemID      *int64  `json:"item_id,omitempty"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	SpecName    *string `json:"spec_name,omitempty"`
	Description *string `json:"description,omitempty"`
	Qty         float64 `json:"qty"`
	UnitNonVat  float64 `json:"unit_non_vat"`
	NonVatTotal float64 `json:"non_vat_total"`
	TaxAmount   float64 `json:"tax_amount"`
	UnitVatInc  float64 `json:"unit_vat_inc"`
	LineTotal   float64 `json:"line_total"`
	Remark      *string `json:"remark,omitempty"`
}

type PurchaseRequest struct {
	ID                 int64                 `json:"id"`
	RequestDate        string                `json:"request_date"`
	DateSeq            int                   `json:"date_seq"`
	DateNoDisplay      string                `json:"date_no_display"`
	PurchaseRequestNo  string                `json:"purchase_request_no"`
	TaxTypeID          int64                 `json:"tax_type_id"`
	TaxTypeName        string                `json:"tax_type_name,omitempty"`
	CurrencyID         int64                 `json:"currency_id"`
	CurrencyCode       string                `json:"currency_code,omitempty"`
	PartnerID          *int64                `json:"partner_id,omitempty"`
	PartnerName        string                `json:"partner_name"`
	PicUserID          *int64                `json:"pic_user_id,omitempty"`
	PicName            string                `json:"pic_name"`
	LocationID         int64                 `json:"location_id"`
	LocationName       string                `json:"location_name,omitempty"`
	ProjectID          *int64                `json:"project_id,omitempty"`
	ProjectName        *string               `json:"project_name,omitempty"`
	CC                 *string               `json:"cc,omitempty"`
	DomesticForeign    string                `json:"domestic_foreign"`
	SendStatus         string                `json:"send_status"`
	ProgressStatus     string                `json:"progress_status"`
	ApprovedAt         *string               `json:"approved_at,omitempty"`
	ApprovedByUserID   *int64                `json:"approved_by_user_id,omitempty"`
	ApprovedByName     string                `json:"approved_by_name,omitempty"`
	TotalQty           float64               `json:"total_qty"`
	Reference          *string               `json:"reference,omitempty"`
	Notes              *string               `json:"notes,omitempty"`
	Subtotal           float64               `json:"subtotal"`
	TaxTotal           float64               `json:"tax_total"`
	GrandTotal         float64               `json:"grand_total"`
	CreatedByUserID    *int64                `json:"created_by_user_id,omitempty"`
	CreatedByName      string                `json:"created_by_name,omitempty"`
	ItemNameSummary    string                `json:"item_name_summary,omitempty"`
	Lines              []PurchaseRequestLine `json:"lines,omitempty"`
}

type purchaseRequestLineBody struct {
	LineNo      int     `json:"line_no"`
	PartnerID   *int64  `json:"partner_id"`
	PartnerCode string  `json:"partner_code"`
	PartnerName string  `json:"partner_name"`
	ItemID      *int64  `json:"item_id"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name"`
	SpecName    *string `json:"spec_name"`
	Description *string `json:"description"`
	Qty         float64 `json:"qty"`
	UnitPrice   float64 `json:"unit_price"`
	InputBasis  string  `json:"input_basis"`
	Remark      *string `json:"remark"`

	SourceSalesOrderLineID *int64 `json:"source_sales_order_line_id"`
}

type purchaseRequestBody struct {
	RequestDate     string                    `json:"request_date"`
	DateSeq         *int                      `json:"date_seq"`
	TaxTypeID       int64                     `json:"tax_type_id"`
	CurrencyID      int64                     `json:"currency_id"`
	PartnerID       *int64                    `json:"partner_id"`
	PicUserID       *int64                    `json:"pic_user_id"`
	PicName         string                    `json:"pic_name"`
	LocationID      int64                     `json:"location_id"`
	ProjectID       *int64                    `json:"project_id"`
	ProjectName     *string                   `json:"project_name"`
	CC              *string                   `json:"cc"`
	DomesticForeign string                    `json:"domestic_foreign"`
	SendStatus      string                    `json:"send_status"`
	ProgressStatus  string                    `json:"progress_status"`
	Reference       *string                   `json:"reference"`
	Notes           *string                   `json:"notes"`
	Lines           []purchaseRequestLineBody `json:"lines"`
}

type computedLine struct {
	LineNo                 int
	PartnerID              *int64
	PartnerCode            string
	PartnerName            string
	ItemID                 *int64
	ItemCode               string
	ItemName               string
	SpecName               *string
	Description            *string
	Qty                    float64
	InputBasis             string
	Amounts                taxcalc.LineAmounts
	Remark                 *string
	SourceSalesOrderLineID *int64
}

type createdSlipRow struct {
	ID         int64   `json:"id"`
	SlipType   string  `json:"slip_type"`
	SlipRef    *string `json:"slip_ref,omitempty"`
	SlipDateNo *string `json:"slip_date_no,omitempty"`
	Qty        float64 `json:"qty"`
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

const hybridPartnerLateral = `
left join lateral (
  select ln.partner_id, coalesce(p.company_name, ln.partner_name, '') as company_name
  from public.pr_purchase_request_lines ln
  left join public.inv_partners p on p.id = ln.partner_id
  where ln.purchase_request_id = pr.id
  order by ln.line_no
  limit 1
) line_partner on true
left join public.inv_partners hp on hp.id = pr.partner_id`

func registerPurchaseRequestRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/purchase-requests/preview-sequences", previewPurchaseRequestSequences(pool))
	r.Get("/purchase-requests/status-report/export", exportPurchaseRequestStatusReport(pool))
	r.Get("/purchase-requests/status-report", listPurchaseRequestStatusReport(pool))
	r.Get("/purchase-requests/open-sales-order-lines", listOpenSalesOrderLinesForPR(pool))
	r.Get("/purchase-requests/sales-order-lines/open", listOpenSalesOrderSlipLines(pool))
	r.Get("/purchase-requests", listPurchaseRequests(pool))
	r.Post("/purchase-requests", createPurchaseRequest(pool))
	r.Post("/purchase-requests/from-sales-order/{soId}", createPurchaseRequestFromSalesOrder(pool))
	r.Get("/purchase-requests/{id}/print", getPurchaseRequestPrint(pool))
	r.Get("/purchase-requests/{id}/created-slips", getCreatedSlips(pool))
	r.Patch("/purchase-requests/{id}/progress-status", patchPurchaseRequestProgressStatus(pool))
	r.Patch("/purchase-requests/{id}/send-status", patchPurchaseRequestSendStatus(pool))
	r.Get("/purchase-requests/{id}", getPurchaseRequest(pool))
	registerPurchaseRequestApprovalRoutes(r, pool)
	r.Patch("/purchase-requests/{id}", updatePurchaseRequest(pool))
	r.Delete("/purchase-requests/{id}", deletePurchaseRequest(pool))
}

func previewPurchaseRequestSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("request_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		requestDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"request_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var purchaseRequestNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, purchase_request_no from public.preview_purchase_request_sequences($1, $2::date)`,
			tu.TenantID, requestDate).Scan(&dateSeq, &purchaseRequestNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":              dateSeq,
			"purchase_request_no":   purchaseRequestNo,
			"date_no_display":       formatDateNoDisplay(requestDate, dateSeq),
		}, "OK")
	}
}

func listPurchaseRequests(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"request_date":        "pr.request_date",
		"purchase_request_no": "pr.purchase_request_no",
		"partner_name":        "coalesce(hp.company_name, line_partner.company_name, '')",
		"grand_total":         "pr.grand_total",
		"progress_status":     "pr.progress_status",
		"send_status":         "pr.send_status",
		"created_at":          "pr.created_at",
		"updated_at":          "pr.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sortByModified := strings.EqualFold(r.URL.Query().Get("sort_by_modified"), "true") ||
			r.URL.Query().Get("sort_by_modified") == "1"
		defaultSort := "request_date"
		if sortByModified {
			defaultSort = "updated_at"
		}
		p := httputil.ParseListParams(r, defaultSort, allowed)
		if sortByModified {
			p.Sort = "updated_at"
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		where := "pr.tenant_id = $1 and pr.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		var explicitLoc *int64

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				pr.purchase_request_no ilike $%d or
				coalesce(hp.company_name, line_partner.company_name, '') ilike $%d or
				coalesce(pr.reference, '') ilike $%d or
				(to_char(pr.request_date, 'MM/DD/YYYY') || '-' || pr.date_seq) ilike $%d or
				exists (
					select 1 from public.pr_purchase_request_lines ln
					where ln.purchase_request_id = pr.id and ln.item_name ilike $%d
				))`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			if from, err := parseDate(fromStr); err == nil {
				where += fmt.Sprintf(" and pr.request_date >= $%d::date", argN)
				args = append(args, from)
				argN++
			}
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			if to, err := parseDate(toStr); err == nil {
				where += fmt.Sprintf(" and pr.request_date <= $%d::date", argN)
				args = append(args, to)
				argN++
			}
		}
		if prNo := strings.TrimSpace(r.URL.Query().Get("purchase_request_no")); prNo != "" {
			where += fmt.Sprintf(" and pr.purchase_request_no ilike $%d", argN)
			args = append(args, "%"+prNo+"%")
			argN++
		}
		if df := strings.TrimSpace(r.URL.Query().Get("domestic_foreign")); df == "domestic" || df == "foreign" {
			where += fmt.Sprintf(" and pr.domestic_foreign = $%d", argN)
			args = append(args, df)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			explicitLoc = id
		}
		if id, ok := optionalInt64Query(r, "project_id"); ok {
			where += fmt.Sprintf(" and pr.project_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(` and (
				pr.partner_id = $%d or exists (
					select 1 from public.pr_purchase_request_lines ln
					where ln.purchase_request_id = pr.id and ln.partner_id = $%d
				))`, argN, argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(` and exists (
				select 1 from public.pr_purchase_request_lines ln
				where ln.purchase_request_id = pr.id and ln.item_id = $%d)`, argN)
			args = append(args, *id)
			argN++
		}
		if ss := strings.TrimSpace(r.URL.Query().Get("send_status")); ss == "unsent" || ss == "sent" {
			where += fmt.Sprintf(" and pr.send_status = $%d", argN)
			args = append(args, ss)
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if isValidProgressStatus(progress) {
			where += fmt.Sprintf(" and pr.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if p.Status != "" && isValidProgressStatus(p.Status) {
			where += fmt.Sprintf(" and pr.progress_status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		scope, argN := tu.PicOrCreatedScopeSQL("pr", argN, &args)
		where += scope

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn:       "coalesce(pr.partner_id, line_partner.partner_id)",
			LocationColumn:       "pr.location_id",
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
			select pr.id, pr.request_date, pr.date_seq, pr.purchase_request_no,
			  pr.tax_type_id, tt.name, pr.currency_id, c.currency_code,
			  coalesce(pr.partner_id, line_partner.partner_id),
			  coalesce(hp.company_name, line_partner.company_name, ''),
			  pr.pic_user_id, pr.pic_name,
			  pr.location_id, pr.domestic_foreign, pr.send_status, pr.progress_status,
			  pr.total_qty::float8, pr.grand_total::float8,
			  coalesce(u.full_name, ''),
			  (select ln.item_name from public.pr_purchase_request_lines ln
			   where ln.purchase_request_id = pr.id order by ln.line_no limit 1),
			  (select count(*)::int from public.pr_purchase_request_lines ln where ln.purchase_request_id = pr.id),
			  count(*) over()
			from public.pr_purchase_requests pr
			%s
			join public.quo_tax_types tt on tt.id = pr.tax_type_id
			join public.quo_currencies c on c.id = pr.currency_id
			left join public.users u on u.id = pr.created_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			hybridPartnerLateral, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase requests.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PurchaseRequest
		var total int64
		for rows.Next() {
			var row PurchaseRequest
			var requestDate time.Time
			var partnerID *int64
			var firstItemName *string
			var lineCount int
			if err := rows.Scan(
				&row.ID, &requestDate, &row.DateSeq, &row.PurchaseRequestNo,
				&row.TaxTypeID, &row.TaxTypeName, &row.CurrencyID, &row.CurrencyCode,
				&partnerID, &row.PartnerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &row.DomesticForeign, &row.SendStatus, &row.ProgressStatus,
				&row.TotalQty, &row.GrandTotal,
				&row.CreatedByName, &firstItemName, &lineCount, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase requests.", "ERR_INTERNAL")
				return
			}
			row.PartnerID = partnerID
			row.RequestDate = dateToStr(requestDate)
			row.DateNoDisplay = formatDateNoDisplay(requestDate, row.DateSeq)
			row.ItemNameSummary = formatItemNameSummary(firstItemName, lineCount)
			out = append(out, row)
		}
		if out == nil {
			out = []PurchaseRequest{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		pr, err := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, pr, "OK")
	}
}

func loadPurchaseRequest(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (PurchaseRequest, error) {
	var pr PurchaseRequest
	var requestDate time.Time
	var partnerID *int64
	var createdByName *string
	var approvedAt *time.Time
	var approvedByUserID *int64
	var approvedByName *string

	err := pool.QueryRow(ctx, `
		select pr.id, pr.request_date, pr.date_seq, pr.purchase_request_no,
		  pr.tax_type_id, tt.name, pr.currency_id, c.currency_code,
		  coalesce(pr.partner_id, line_partner.partner_id),
		  coalesce(hp.company_name, line_partner.company_name, ''),
		  pr.pic_user_id, pr.pic_name,
		  pr.location_id, l.location_name, pr.project_id, pr.project_name,
		  pr.cc, pr.domestic_foreign, pr.send_status, pr.progress_status,
		  pr.approved_at, pr.approved_by_user_id, approver.full_name,
		  pr.total_qty::float8, pr.reference, pr.notes,
		  pr.subtotal::float8, pr.tax_total::float8, pr.grand_total::float8,
		  pr.created_by_user_id, u.full_name
		from public.pr_purchase_requests pr
		`+hybridPartnerLateral+`
		join public.quo_tax_types tt on tt.id = pr.tax_type_id
		join public.quo_currencies c on c.id = pr.currency_id
		join public.inv_locations l on l.id = pr.location_id
		left join public.users u on u.id = pr.created_by_user_id
		left join public.users approver on approver.id = pr.approved_by_user_id
		where pr.id = $1 and pr.tenant_id = $2 and pr.deleted_at is null`,
		id, tenantID).Scan(
		&pr.ID, &requestDate, &pr.DateSeq, &pr.PurchaseRequestNo,
		&pr.TaxTypeID, &pr.TaxTypeName, &pr.CurrencyID, &pr.CurrencyCode,
		&partnerID, &pr.PartnerName,
		&pr.PicUserID, &pr.PicName,
		&pr.LocationID, &pr.LocationName, &pr.ProjectID, &pr.ProjectName,
		&pr.CC, &pr.DomesticForeign, &pr.SendStatus, &pr.ProgressStatus,
		&approvedAt, &approvedByUserID, &approvedByName,
		&pr.TotalQty, &pr.Reference, &pr.Notes,
		&pr.Subtotal, &pr.TaxTotal, &pr.GrandTotal,
		&pr.CreatedByUserID, &createdByName,
	)
	if err != nil {
		return PurchaseRequest{}, err
	}
	pr.PartnerID = partnerID
	pr.RequestDate = dateToStr(requestDate)
	pr.DateNoDisplay = formatDateNoDisplay(requestDate, pr.DateSeq)
	if createdByName != nil {
		pr.CreatedByName = *createdByName
	}
	pr.ApprovedAt = datePtrToStr(approvedAt)
	pr.ApprovedByUserID = approvedByUserID
	if approvedByName != nil {
		pr.ApprovedByName = *approvedByName
	}

	lines, err := loadPurchaseRequestLines(ctx, pool, id)
	if err != nil {
		return PurchaseRequest{}, err
	}
	pr.Lines = lines
	return pr, nil
}

func loadPurchaseRequestLines(ctx context.Context, pool *pgxpool.Pool, purchaseRequestID int64) ([]PurchaseRequestLine, error) {
	rows, err := pool.Query(ctx, `
		select id, line_no, partner_id, partner_code, partner_name,
		  item_id, item_code, item_name, spec_name, description,
		  qty::float8, unit_non_vat::float8, non_vat_total::float8, tax_amount::float8,
		  unit_vat_inc::float8, line_total::float8, remark
		from public.pr_purchase_request_lines
		where purchase_request_id = $1
		order by line_no`, purchaseRequestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var lines []PurchaseRequestLine
	for rows.Next() {
		var ln PurchaseRequestLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.PartnerID, &ln.PartnerCode, &ln.PartnerName,
			&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.SpecName, &ln.Description,
			&ln.Qty, &ln.UnitNonVat, &ln.NonVatTotal, &ln.TaxAmount,
			&ln.UnitVatInc, &ln.LineTotal, &ln.Remark); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []PurchaseRequestLine{}
	}
	return lines, nil
}

func createPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body purchaseRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePurchaseRequestBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		requestDate, err := parseDate(body.RequestDate)
		if err != nil {
			response.Validation(w, map[string]string{"request_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computePurchaseRequestLines(tt, applyBuyingRatesToPRLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines))
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		headerPartnerID := resolveHeaderPartnerID(body.PartnerID, computed)
		subtotal, taxTotal, grandTotal := sumPurchaseRequestTotals(computed)
		totalQty := sumLineQty(computed)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		dateSeq, purchaseRequestNo, seqErrs := allocatePurchaseRequestSequences(r.Context(), tx, tu.TenantID, requestDate, body.DateSeq, 0)
		if seqErrs != nil {
			response.Validation(w, seqErrs)
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.pr_purchase_requests (
			  tenant_id, request_date, date_seq, purchase_request_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
			  location_id, project_id, project_name, cc, domestic_foreign, send_status,
			  progress_status, total_qty, reference, notes,
			  subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
			returning id`,
			tu.TenantID, requestDate, dateSeq, purchaseRequestNo,
			body.TaxTypeID, body.CurrencyID, headerPartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.LocationID, body.ProjectID, body.ProjectName, body.CC,
			defaultDomesticForeign(body.DomesticForeign), defaultSendStatus(body.SendStatus),
			defaultProgress(body.ProgressStatus), totalQty, body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert purchase request.", "ERR_INTERNAL")
			return
		}

		if _, err := insertPurchaseRequestLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.create", "pr_purchase_request", &id, nil, body)
		pr, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pr, "Created.")
	}
}

func updatePurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body purchaseRequestBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validatePurchaseRequestBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		requestDate, err := parseDate(body.RequestDate)
		if err != nil {
			response.Validation(w, map[string]string{"request_date": "Invalid date."})
			return
		}

		tt, err := loadTaxCalcType(r.Context(), pool, tu.TenantID, body.TaxTypeID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Tax type not found."})
			return
		}

		computed, errs := computePurchaseRequestLines(tt, applyBuyingRatesToPRLines(r.Context(), pool, tu.TenantID, body.PartnerID, body.Lines))
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		if len(computed) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line with quantity is required."})
			return
		}

		headerPartnerID := resolveHeaderPartnerID(body.PartnerID, computed)
		subtotal, taxTotal, grandTotal := sumPurchaseRequestTotals(computed)
		totalQty := sumLineQty(computed)
		progress := defaultProgress(body.ProgressStatus)
		blocked, err := manualConfirmBlocked(r.Context(), pool, tu.TenantID, progress)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load process policies.", "ERR_INTERNAL")
			return
		}
		if blocked {
			response.Validation(w, map[string]string{"progress_status": "Use Approve when purchase request approval is required."})
			return
		}
		before, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		if err := tx.QueryRow(r.Context(), `
			select date_seq from public.pr_purchase_requests
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&dateSeq); err != nil {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}
		if body.DateSeq != nil && *body.DateSeq > 0 && *body.DateSeq != dateSeq {
			if err := assertDateSeqAvailable(r.Context(), tx, tu.TenantID, requestDate, *body.DateSeq, id); err != nil {
				response.Validation(w, map[string]string{"date_seq": err.Error()})
				return
			}
			dateSeq = *body.DateSeq
		}

		tag, err := tx.Exec(r.Context(), `
			update public.pr_purchase_requests set
			  request_date = $1, date_seq = $2, tax_type_id = $3, currency_id = $4, partner_id = $5,
			  pic_user_id = $6, pic_name = $7, location_id = $8,
			  project_id = $9, project_name = $10, cc = $11, domestic_foreign = $12,
			  send_status = $13, progress_status = $14, total_qty = $15,
			  reference = $16, notes = $17,
			  subtotal = $18, tax_total = $19, grand_total = $20, updated_at = now()
			where id = $21 and tenant_id = $22 and deleted_at is null`,
			requestDate, dateSeq, body.TaxTypeID, body.CurrencyID, headerPartnerID,
			body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName, body.CC,
			defaultDomesticForeign(body.DomesticForeign), defaultSendStatus(body.SendStatus),
			progress, totalQty,
			body.Reference, body.Notes,
			subtotal, taxTotal, grandTotal, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		if err := replacePurchaseRequestLines(r.Context(), tx, id, computed); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		after, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_request.update", "pr_purchase_request", &id, before, after)
		response.OK(w, after, "Updated.")
	}
}

func allocatePurchaseRequestSequences(ctx context.Context, tx pgx.Tx, tenantID int64, requestDate time.Time, requestedSeq *int, excludeID int64) (dateSeq int, purchaseRequestNo string, errs map[string]string) {
	if requestedSeq != nil && *requestedSeq > 0 {
		dateSeq = *requestedSeq
		if err := assertDateSeqAvailable(ctx, tx, tenantID, requestDate, dateSeq, excludeID); err != nil {
			return 0, "", map[string]string{"date_seq": err.Error()}
		}
		if err := tx.QueryRow(ctx,
			`select public.allocate_purchase_request_no($1, $2::date)`,
			tenantID, requestDate).Scan(&purchaseRequestNo); err != nil {
			return 0, "", map[string]string{"body": "Failed to allocate reference number."}
		}
		if _, err := tx.Exec(ctx, `
			insert into public.tenant_daily_sequences (tenant_id, sequence_key, bucket_date, last_value)
			values ($1, 'purchase_request_date_seq', $2::date, $3)
			on conflict (tenant_id, sequence_key, bucket_date)
			do update set last_value = greatest(tenant_daily_sequences.last_value, excluded.last_value)`,
			tenantID, requestDate, dateSeq); err != nil {
			return 0, "", map[string]string{"body": "Failed to update date sequence."}
		}
		return dateSeq, purchaseRequestNo, nil
	}
	if err := tx.QueryRow(ctx,
		`select date_seq, purchase_request_no from public.allocate_purchase_request_sequences($1, $2::date)`,
		tenantID, requestDate).Scan(&dateSeq, &purchaseRequestNo); err != nil {
		return 0, "", map[string]string{"body": "Failed to allocate sequences."}
	}
	return dateSeq, purchaseRequestNo, nil
}

func deletePurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "pr_purchase_requests", "purchase_request.delete", "pr_purchase_request")
	}
}

func assertDateSeqAvailable(ctx context.Context, tx pgx.Tx, tenantID int64, requestDate time.Time, dateSeq int, excludeID int64) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.pr_purchase_requests
		  where tenant_id = $1 and request_date = $2::date and date_seq = $3
		    and deleted_at is null and ($4 = 0 or id <> $4)
		)`, tenantID, requestDate, dateSeq, excludeID).Scan(&exists)
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

func sumLineQty(lines []computedLine) float64 {
	var total float64
	for _, ln := range lines {
		total += ln.Qty
	}
	return total
}

func insertPurchaseRequestLines(ctx context.Context, tx pgx.Tx, purchaseRequestID int64, lines []computedLine) ([]int64, error) {
	var ids []int64
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		var id int64
		err := tx.QueryRow(ctx, `
			insert into public.pr_purchase_request_lines (
			  purchase_request_id, line_no, partner_id, partner_code, partner_name,
			  item_id, item_code, item_name, spec_name, description,
			  qty, input_basis, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark,
			  source_sales_order_line_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
			returning id`,
			purchaseRequestID, lineNo, ln.PartnerID, strings.TrimSpace(ln.PartnerCode), strings.TrimSpace(ln.PartnerName),
			ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName), ln.SpecName, ln.Description,
			ln.Qty, ln.InputBasis, ln.Amounts.UnitNonVat, ln.Amounts.NonVatTotal, ln.Amounts.TaxAmount,
			ln.Amounts.UnitVatInc, ln.Amounts.LineTotal, ln.Remark,
			ln.SourceSalesOrderLineID).Scan(&id)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

func replacePurchaseRequestLines(ctx context.Context, tx pgx.Tx, purchaseRequestID int64, lines []computedLine) error {
	if _, err := tx.Exec(ctx, `delete from public.pr_purchase_request_lines where purchase_request_id = $1`, purchaseRequestID); err != nil {
		return err
	}
	_, err := insertPurchaseRequestLines(ctx, tx, purchaseRequestID, lines)
	return err
}

func applyBuyingRatesToPRLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, headerPartnerID *int64, lines []purchaseRequestLineBody) []purchaseRequestLineBody {
	out := make([]purchaseRequestLineBody, len(lines))
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

func computePurchaseRequestLines(tt taxcalc.TaxType, lines []purchaseRequestLineBody) ([]computedLine, map[string]string) {
	errs := map[string]string{}
	var out []computedLine
	for i, ln := range lines {
		if ln.Qty <= 0 {
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
		out = append(out, computedLine{
			LineNo:      ln.LineNo,
			PartnerID:   ln.PartnerID,
			PartnerCode: ln.PartnerCode,
			PartnerName: ln.PartnerName,
			ItemID:      ln.ItemID,
			ItemCode:    ln.ItemCode,
			ItemName:    ln.ItemName,
			SpecName:    ln.SpecName,
			Description: ln.Description,
			Qty:         ln.Qty,
			InputBasis:  inputBasis,
			Amounts:     amounts,
			Remark:      ln.Remark,

			SourceSalesOrderLineID: ln.SourceSalesOrderLineID,
		})
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}

func sumPurchaseRequestTotals(lines []computedLine) (subtotal, taxTotal, grandTotal float64) {
	for _, ln := range lines {
		subtotal += ln.Amounts.NonVatTotal
		taxTotal += ln.Amounts.TaxAmount
		grandTotal += ln.Amounts.LineTotal
	}
	return subtotal, taxTotal, grandTotal
}

func validatePurchaseRequestBody(b purchaseRequestBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.RequestDate) == "" {
		errs["request_date"] = "Request date is required."
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
	if b.ProgressStatus != "" && !isValidProgressStatus(b.ProgressStatus) {
		errs["progress_status"] = "Invalid progress status."
	}
	if b.SendStatus != "" && b.SendStatus != "unsent" && b.SendStatus != "sent" {
		errs["send_status"] = "Must be unsent or sent."
	}
	if b.DomesticForeign != "" && b.DomesticForeign != "domestic" && b.DomesticForeign != "foreign" {
		errs["domestic_foreign"] = "Must be domestic or foreign."
	}
	if b.DateSeq != nil && *b.DateSeq <= 0 {
		errs["date_seq"] = "Date sequence must be positive."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func createPurchaseRequestFromSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		soID, err := strconv.ParseInt(chi.URLParam(r, "soId"), 10, 64)
		if err != nil || soID <= 0 {
			response.Validation(w, map[string]string{"soId": "Invalid sales order id."})
			return
		}
		id, err := CreateFromSalesOrder(r.Context(), pool, tu, soID)
		if err != nil {
			if fields, ok := AsDocflowValidation(err); ok {
				response.Validation(w, fields)
				return
			}
			if errors.Is(err, ErrSalesOrderNotFound) {
				response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create purchase request.", "ERR_INTERNAL")
			return
		}
		pr, _ := loadPurchaseRequest(r.Context(), pool, tu.TenantID, id)
		response.OK(w, pr, "Created.")
	}
}

type openSalesOrderLineForPR struct {
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	LineNo           int     `json:"line_no"`
	ItemID           *int64  `json:"item_id,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Description      *string `json:"description,omitempty"`
	OpenQty          float64 `json:"open_qty"`
	UnitVatInc       float64 `json:"unit_vat_inc"`
	Remark           *string `json:"remark,omitempty"`
}

func listOpenSalesOrderLinesForPR(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		soID, ok := optionalInt64Query(r, "sales_order_id")
		if !ok || *soID <= 0 {
			response.Validation(w, map[string]string{"sales_order_id": "sales_order_id is required."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.so_sales_orders where id = $1 and tenant_id = $2 and deleted_at is null)`,
			*soID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
			  (ln.qty - coalesce(req.requested, 0))::float8, ln.unit_vat_inc::float8, ln.remark
			from public.so_sales_order_lines ln
			left join (
			  select source_sales_order_line_id, sum(qty) as requested
			  from public.pr_purchase_request_lines
			  where source_sales_order_line_id is not null
			  group by source_sales_order_line_id
			) req on req.source_sales_order_line_id = ln.id
			where ln.sales_order_id = $1
			order by ln.line_no`, *soID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openSalesOrderLineForPR{}
		for rows.Next() {
			var ln openSalesOrderLineForPR
			if err := rows.Scan(&ln.SalesOrderLineID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName,
				&ln.Description, &ln.OpenQty, &ln.UnitVatInc, &ln.Remark); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read lines.", "ERR_INTERNAL")
				return
			}
			if ln.OpenQty <= 0.0001 {
				continue
			}
			out = append(out, ln)
		}
		response.OK(w, out, "OK")
	}
}

// openSalesOrderSlipLine is a residual Sales Order line offered by the "Load Slip
// (from Sales Order)" picker inside a Purchase Request. It carries enough header
// context so the PR editor can adopt the source document's tax type, currency,
// location, partner and PIC when lines are pulled in.
type openSalesOrderSlipLine struct {
	SalesOrderID     int64   `json:"sales_order_id"`
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	DateNoDisplay    string  `json:"date_no_display"`
	ReferenceNo      string  `json:"reference_no"`
	CustomerName     string  `json:"customer_name"`
	LocationID       int64   `json:"location_id"`
	LocationName     string  `json:"location_name"`
	PartnerID        int64   `json:"partner_id"`
	TaxTypeID        int64   `json:"tax_type_id"`
	CurrencyID       int64   `json:"currency_id"`
	PicName          string  `json:"pic_name"`
	ItemID           *int64  `json:"item_id,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Description      *string `json:"description,omitempty"`
	Qty              float64 `json:"qty"`
	BalanceQty       float64 `json:"balance_qty"`
	UnitVatInc       float64 `json:"unit_vat_inc"`
	Remark           *string `json:"remark,omitempty"`
}

// listOpenSalesOrderSlipLines lists residual lines across all Sales Orders for the
// PR "Load Slip" picker. Residual is derived from PR lines that already reference a
// SO line (source_sales_order_line_id), never from the SO slip ledger, so procurement
// pulls never reduce the sales-fulfilment balance of the Sales Order.
func listOpenSalesOrderSlipLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":    "so.order_date",
			"reference_no":  "so.sales_order_no",
			"customer_name": "pt.company_name",
			"item_code":     "ln.item_code",
		})
		offset := httputil.Offset(p)

		where := `so.tenant_id = $1 and so.deleted_at is null
			and (ln.qty - coalesce(req.requested, 0)) > 0.0001`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				so.sales_order_no ilike $%d or pt.company_name ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

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
			select so.id, ln.id, so.order_date, so.date_seq, so.sales_order_no,
			  pt.company_name, so.location_id, l.location_name, so.partner_id,
			  so.tax_type_id, so.currency_id, so.pic_name,
			  ln.item_id, ln.item_code, ln.item_name, ln.description,
			  ln.qty::float8,
			  (ln.qty - coalesce(req.requested, 0))::float8,
			  ln.unit_vat_inc::float8, ln.remark,
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners pt on pt.id = so.partner_id
			join public.inv_locations l on l.id = so.location_id
			join public.so_sales_order_lines ln on ln.sales_order_id = so.id
			left join (
			  select source_sales_order_line_id, sum(qty) as requested
			  from public.pr_purchase_request_lines
			  where source_sales_order_line_id is not null
			  group by source_sales_order_line_id
			) req on req.source_sales_order_line_id = ln.id
			where %s
			order by so.order_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales order lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openSalesOrderSlipLine{}
		var total int64
		for rows.Next() {
			var row openSalesOrderSlipLine
			var orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.SalesOrderID, &row.SalesOrderLineID, &orderDate, &dateSeq, &row.ReferenceNo,
				&row.CustomerName, &row.LocationID, &row.LocationName, &row.PartnerID,
				&row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.Description,
				&row.Qty, &row.BalanceQty, &row.UnitVatInc, &row.Remark, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales order lines.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
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
			`select exists(select 1 from public.pr_purchase_requests where id = $1 and tenant_id = $2 and deleted_at is null)`,
			id, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
			return
		}

		rows, err := pool.Query(r.Context(), `
			select ln.id, ln.line_no, ln.item_code, ln.item_name, ln.qty::float8,
			  coalesce(sl.slipped, 0)::float8
			from public.pr_purchase_request_lines ln
			left join (
			  select purchase_request_line_id, sum(qty) as slipped
			  from public.pr_purchase_request_slip_lines
			  group by purchase_request_line_id
			) sl on sl.purchase_request_line_id = ln.id
			where ln.purchase_request_id = $1
			order by ln.line_no`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load slips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []createdSlipLine
		for rows.Next() {
			var line createdSlipLine
			var slipped float64
			if err := rows.Scan(&line.LineID, &line.LineNo, &line.ItemCode, &line.ItemName, &line.Qty, &slipped); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read slips.", "ERR_INTERNAL")
				return
			}
			line.BalanceQty = line.Qty - slipped
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
				select id, purchase_request_line_id, slip_type, slip_ref, slip_date_no, qty::float8
				from public.pr_purchase_request_slip_lines
				where purchase_request_line_id = any($1)
				order by purchase_request_line_id, created_at`, lineIDs)
			if err == nil {
				defer slipRows.Close()
				byLine := map[int64][]createdSlipRow{}
				for slipRows.Next() {
					var s createdSlipRow
					var lineID int64
					if err := slipRows.Scan(&s.ID, &lineID, &s.SlipType, &s.SlipRef, &s.SlipDateNo, &s.Qty); err == nil {
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
