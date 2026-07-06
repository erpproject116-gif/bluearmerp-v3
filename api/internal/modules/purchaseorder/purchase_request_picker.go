package purchaseorder

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
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
	PurchaseRequestID     int64   `json:"purchase_request_id"`
	PurchaseRequestLineID int64   `json:"purchase_request_line_id"`
	DateNoDisplay         string  `json:"date_no_display"`
	ReferenceNo           string  `json:"reference_no"`
	LocationID            int64   `json:"location_id"`
	LocationName          string  `json:"location_name"`
	TaxTypeID             int64   `json:"tax_type_id"`
	CurrencyID            int64   `json:"currency_id"`
	PicName               string  `json:"pic_name"`
	PartnerID             *int64  `json:"partner_id,omitempty"`
	PartnerCode           string  `json:"partner_code"`
	PartnerName           string  `json:"partner_name"`
	ItemID                *int64  `json:"item_id,omitempty"`
	ItemCode              string  `json:"item_code"`
	ItemName              string  `json:"item_name"`
	SpecName              *string `json:"spec_name,omitempty"`
	Description           *string `json:"description,omitempty"`
	Qty                   float64 `json:"qty"`
	BalanceQty            float64 `json:"balance_qty"`
	InputBasis            string  `json:"input_basis"`
	UnitPrice             float64 `json:"unit_price"`
	UnitNonVat            float64 `json:"unit_non_vat"`
	UnitVatInc            float64 `json:"unit_vat_inc"`
	Remark                *string `json:"remark,omitempty"`
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
		offset := httputil.Offset(p)

		where := `pr.tenant_id = $1 and pr.deleted_at is null
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

		q := fmt.Sprintf(`
			select pr.id, ln.id, pr.request_date, pr.date_seq, pr.purchase_request_no,
			  pr.location_id, l.location_name, pr.tax_type_id, pr.currency_id, pr.pic_name,
			  ln.partner_id, ln.partner_code, ln.partner_name,
			  ln.item_id, ln.item_code, ln.item_name, ln.spec_name, ln.description,
			  ln.qty::float8,
			  (ln.qty - coalesce(sl.slipped, 0))::float8,
			  coalesce(nullif(ln.input_basis, ''), 'vat_inc_unit'),
			  ln.unit_non_vat::float8, ln.unit_vat_inc::float8, ln.remark,
			  count(*) over()
			from public.pr_purchase_requests pr
			join public.inv_locations l on l.id = pr.location_id
			join public.pr_purchase_request_lines ln on ln.purchase_request_id = pr.id
			left join (
			  select purchase_request_line_id, sum(qty) as slipped
			  from public.pr_purchase_request_slip_lines
			  group by purchase_request_line_id
			) sl on sl.purchase_request_line_id = ln.id
			where %s
			order by pr.request_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list purchase request lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openPurchaseRequestSlipLine{}
		var total int64
		for rows.Next() {
			var row openPurchaseRequestSlipLine
			var requestDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&row.PurchaseRequestID, &row.PurchaseRequestLineID, &requestDate, &dateSeq, &row.ReferenceNo,
				&row.LocationID, &row.LocationName, &row.TaxTypeID, &row.CurrencyID, &row.PicName,
				&row.PartnerID, &row.PartnerCode, &row.PartnerName,
				&row.ItemID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.Description,
				&row.Qty, &row.BalanceQty, &row.InputBasis,
				&row.UnitNonVat, &row.UnitVatInc, &row.Remark, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read purchase request lines.", "ERR_INTERNAL")
				return
			}
			row.UnitPrice = row.UnitVatInc
			if row.InputBasis == taxcalc.InputNonVatUnit {
				row.UnitPrice = row.UnitNonVat
			}
			row.DateNoDisplay = formatDateNoDisplay(requestDate, dateSeq)
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
