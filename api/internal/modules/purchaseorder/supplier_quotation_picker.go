package purchaseorder

import (
	"fmt"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type openSupplierQuotationSlipLine struct {
	SupplierQuotationID     int64   `json:"supplier_quotation_id"`
	SupplierQuotationLineID int64   `json:"supplier_quotation_line_id"`
	RFQID                   int64   `json:"rfq_id"`
	RFQRequestLineID        *int64  `json:"rfq_request_line_id,omitempty"`
	QuoteNo                 string  `json:"quote_no"`
	QuoteDate               string  `json:"quote_date"`
	PartnerID               int64   `json:"partner_id"`
	PartnerName             string  `json:"partner_name"`
	TaxTypeID               *int64  `json:"tax_type_id,omitempty"`
	CurrencyID              *int64  `json:"currency_id,omitempty"`
	LocationID              *int64  `json:"location_id,omitempty"`
	LocationName            string  `json:"location_name"`
	PicName                 string  `json:"pic_name"`
	ItemID                  *int64  `json:"item_id,omitempty"`
	ItemCode                string  `json:"item_code"`
	ItemName                string  `json:"item_name"`
	Qty                     float64 `json:"qty"`
	BalanceQty              float64 `json:"balance_qty"`
	UnitID                  *int64  `json:"unit_id,omitempty"`
	UnitCode                *string `json:"unit_code,omitempty"`
	UnitPrice               float64 `json:"unit_price"`
}

func listOpenSupplierQuotationSlipLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "quote_date", map[string]string{
			"quote_date":   "sq.quote_date",
			"quote_no":     "sq.quote_no",
			"partner_name": "p.company_name",
			"item_code":    "coalesce(rl.item_code, '')",
		})
		offset := httputil.Offset(p)

		// Item code/name live on rfq_request_lines (supplier quotation lines only store item_id).
		where := `sq.tenant_id = $1 and sq.status in ('accepted', 'received')
			and (ln.qty - coalesce(ord.ordered, 0)) > 0.0001
			and coalesce(ln.item_id, rl.item_id) is not null`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				sq.quote_no ilike $%d or p.company_name ilike $%d or
				coalesce(p.partner_code, '') ilike $%d or
				coalesce(rl.item_code, '') ilike $%d or coalesce(rl.item_name, '') ilike $%d)`, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if pid, ok := optionalInt64Query(r, "partner_id"); ok {
			where += fmt.Sprintf(" and sq.partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}

		q := fmt.Sprintf(`
			select sq.id, ln.id, sq.rfq_id, ln.rfq_request_line_id,
			  sq.quote_no, sq.quote_date, sq.partner_id, p.company_name,
			  pr.tax_type_id, pr.currency_id, pr.location_id, coalesce(l.location_name, ''),
			  coalesce(pr.pic_name, ''),
			  coalesce(ln.item_id, rl.item_id),
			  coalesce(rl.item_code, ''), coalesce(rl.item_name, ''),
			  ln.qty::float8,
			  (ln.qty - coalesce(ord.ordered, 0))::float8,
			  coalesce(ln.unit_id, rl.unit_id), coalesce(ln.unit_code, rl.unit_code),
			  ln.unit_price::float8,
			  count(*) over()
			from public.rfq_supplier_quotation_lines ln
			join public.rfq_supplier_quotations sq on sq.id = ln.supplier_quotation_id
			join public.inv_partners p on p.id = sq.partner_id
			join public.rfq_requests rf on rf.id = sq.rfq_id
			left join public.rfq_request_lines rl on rl.id = ln.rfq_request_line_id
			left join public.pr_purchase_requests pr on pr.id = rf.purchase_request_id and pr.deleted_at is null
			left join public.inv_locations l on l.id = pr.location_id
			left join (
			  select pol.supplier_quotation_line_id, sum(pol.qty) as ordered
			  from public.po_purchase_order_lines pol
			  join public.po_purchase_orders po on po.id = pol.purchase_order_id
			  where pol.supplier_quotation_line_id is not null
			    and po.deleted_at is null and po.status <> 'cancelled'
			  group by pol.supplier_quotation_line_id
			) ord on ord.supplier_quotation_line_id = ln.id
			where %s
			order by sq.quote_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list supplier quotation lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openSupplierQuotationSlipLine{}
		var total int64
		for rows.Next() {
			var row openSupplierQuotationSlipLine
			var quoteDate time.Time
			if err := rows.Scan(
				&row.SupplierQuotationID, &row.SupplierQuotationLineID, &row.RFQID, &row.RFQRequestLineID,
				&row.QuoteNo, &quoteDate, &row.PartnerID, &row.PartnerName,
				&row.TaxTypeID, &row.CurrencyID, &row.LocationID, &row.LocationName, &row.PicName,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.Qty, &row.BalanceQty, &row.UnitID, &row.UnitCode, &row.UnitPrice, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier quotation lines.", "ERR_INTERNAL")
				return
			}
			row.QuoteDate = quoteDate.Format("2006-01-02")
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
