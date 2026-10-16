package purchaseorder

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/openlines"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

// openPurchaseRequestSlipLine is a residual Purchase Request line offered by the
// "Load Slip (from Purchase Request)" picker inside a Purchase Order. It carries
// header context so the PO editor can adopt the source document's tax type,
// currency, location, PIC and vendor when lines are pulled in. Residual is derived
// from the PR slip ledger (pr_purchase_request_slip_lines), which is written when a
// PO that references the PR line is confirmed.
type openPurchaseRequestSlipLine struct {
	PurchaseRequestID     int64    `json:"purchase_request_id"`
	PurchaseRequestLineID int64    `json:"purchase_request_line_id"`
	DateNoDisplay         string   `json:"date_no_display"`
	ReferenceNo           string   `json:"reference_no"`
	ProgressStatus        string   `json:"progress_status"`
	LocationID            int64    `json:"location_id"`
	LocationName          string   `json:"location_name"`
	TaxTypeID             int64    `json:"tax_type_id"`
	CurrencyID            int64    `json:"currency_id"`
	PicName               string   `json:"pic_name"`
	PartnerID             *int64   `json:"partner_id,omitempty"`
	PartnerCode           string   `json:"partner_code"`
	PartnerName           string   `json:"partner_name"`
	ItemID                *int64   `json:"item_id,omitempty"`
	ItemCode              string   `json:"item_code"`
	ItemName              string   `json:"item_name"`
	SpecName              *string  `json:"spec_name,omitempty"`
	Description           *string  `json:"description,omitempty"`
	Qty                   float64  `json:"qty"`
	BalanceQty            float64  `json:"balance_qty"`
	UnitID                *int64   `json:"unit_id,omitempty"`
	UnitCode              *string  `json:"unit_code,omitempty"`
	InputBasis            string   `json:"input_basis"`
	UnitPrice             float64  `json:"unit_price"`
	UnitNonVat            float64  `json:"unit_non_vat"`
	UnitVatInc            float64  `json:"unit_vat_inc"`
	Remark                *string  `json:"remark,omitempty"`
	TrackSerial           bool     `json:"track_serial,omitempty"`
	PlannedSerialNos      []string `json:"planned_serial_nos,omitempty"`
}

type openPurchaseRequestSlipDocument struct {
	PurchaseRequestID  int64                         `json:"purchase_request_id"`
	DateNoDisplay      string                        `json:"date_no_display"`
	ReferenceNo        string                        `json:"reference_no"`
	ProgressStatus     string                        `json:"progress_status"`
	PartnerName        string                        `json:"partner_name"`
	OpenLineCount      int                           `json:"open_line_count"`
	SourceLineCount    int                           `json:"source_line_count"`
	SkippedNoItemCount int                           `json:"skipped_no_item_count"`
	Lines              []openPurchaseRequestSlipLine `json:"lines"`
}

// listOpenPurchaseRequestSlipLines lists residual lines across all Purchase Requests
// for the PO "Load Slip" picker.
func listOpenPurchaseRequestSlipLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "request_date", map[string]string{
			"request_date": "pr.request_date",
			"reference_no": "pr.purchase_request_no",
			"item_code":    "ln.item_code",
		})
		pageSize := openlines.PageSize(r, p.PageSize)
		offset := (p.Page - 1) * pageSize

		// Load Slip lists every open PR residual by default (no vendor/date filter).
		where := `pr.tenant_id = $1 and pr.deleted_at is null
			and ln.item_id is not null
			and (ln.qty - coalesce(sl.slipped, 0)) > 0.0001`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				pr.purchase_request_no ilike $%d or ln.partner_name ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			LocationColumn: "pr.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		fromWhere := fmt.Sprintf(`
			from public.pr_purchase_requests pr
			join public.inv_locations l on l.id = pr.location_id
			join public.pr_purchase_request_lines ln on ln.purchase_request_id = pr.id
			left join public.inv_items i on i.id = ln.item_id
			left join (
			  select purchase_request_line_id, sum(qty) as slipped
			  from public.pr_purchase_request_slip_lines
			  group by purchase_request_line_id
			) sl on sl.purchase_request_line_id = ln.id
			where %s`, where)
		docIDs, total, err := openlines.QueryDocumentPage(r.Context(), pool, fromWhere, "pr.id", "pr.request_date", args, pageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase request lines.", "ERR_INTERNAL")
			return
		}
		if len(docIDs) == 0 {
			response.OKList(w, []openPurchaseRequestSlipDocument{}, p.Page, pageSize, total)
			return
		}
		lineSQL := fmt.Sprintf(`
			select pr.id, ln.id, pr.request_date, pr.date_seq, pr.purchase_request_no, pr.progress_status,
			  pr.location_id, l.location_name, pr.tax_type_id, pr.currency_id, pr.pic_name,
			  ln.partner_id, ln.partner_code, ln.partner_name,
			  ln.item_id, ln.item_code, ln.item_name, ln.spec_name, ln.description,
			  ln.qty::float8,
			  (ln.qty - coalesce(sl.slipped, 0))::float8,
			  ln.unit_id, ln.unit_code,
			  coalesce(nullif(ln.input_basis, ''), 'vat_inc_unit'),
			  ln.unit_non_vat::float8, ln.unit_vat_inc::float8, ln.remark,
			  coalesce(i.track_serial, false),
			  coalesce(ln.planned_serial_nos, '{}')
			%s
			  and pr.id = any($%d)
			order by pr.request_date desc, pr.id desc, ln.line_no asc`, fromWhere, argN)
		rows, err := pool.Query(r.Context(), lineSQL, append(append([]any{}, args...), docIDs)...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase request lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var lines []openPurchaseRequestSlipLine
		for rows.Next() {
			var row openPurchaseRequestSlipLine
			var requestDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.PurchaseRequestID, &row.PurchaseRequestLineID, &requestDate, &dateSeq, &row.ReferenceNo, &row.ProgressStatus,
				&row.LocationID, &row.LocationName, &row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.PartnerID, &row.PartnerCode, &row.PartnerName,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.Description,
				&row.Qty, &row.BalanceQty, &row.UnitID, &row.UnitCode, &row.InputBasis,
				&row.UnitNonVat, &row.UnitVatInc, &row.Remark, &row.TrackSerial, &row.PlannedSerialNos,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase request lines.", "ERR_INTERNAL")
				return
			}
			row.UnitPrice = row.UnitVatInc
			if row.InputBasis == taxcalc.InputNonVatUnit {
				row.UnitPrice = row.UnitNonVat
			}
			row.DateNoDisplay = formatDateNoDisplay(requestDate, dateSeq)
			lines = append(lines, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read purchase request lines.", "ERR_INTERNAL")
			return
		}
		counts, err := openlines.LoadSourceCounts(r.Context(), pool, `
			select purchase_request_id, count(*)::int, count(*) filter (where item_id is null)::int
			from public.pr_purchase_request_lines
			where purchase_request_id = any($1)
			group by purchase_request_id`, docIDs)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase request lines.", "ERR_INTERNAL")
			return
		}
		grouped := openlines.AssembleDocuments(docIDs, lines, func(row openPurchaseRequestSlipLine) int64 { return row.PurchaseRequestID }, counts, func(row openPurchaseRequestSlipLine) bool {
			return row.ItemID == nil
		})
		out := make([]openPurchaseRequestSlipDocument, 0, len(grouped))
		for _, doc := range grouped {
			first := doc.Lines[0]
			out = append(out, openPurchaseRequestSlipDocument{
				PurchaseRequestID:  doc.ID,
				DateNoDisplay:      first.DateNoDisplay,
				ReferenceNo:        first.ReferenceNo,
				ProgressStatus:     first.ProgressStatus,
				PartnerName:        first.PartnerName,
				OpenLineCount:      doc.OpenLineCount,
				SourceLineCount:    doc.SourceLineCount,
				SkippedNoItemCount: doc.SkippedNoItemCount,
				Lines:              doc.Lines,
			})
		}
		response.OKList(w, out, p.Page, pageSize, total)
	}
}
