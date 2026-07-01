package finance

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type paymentEntryRow struct {
	EntryType     string  `json:"entry_type"`
	ID            int64   `json:"id"`
	EntryDate     string  `json:"entry_date"`
	DocumentNo    string  `json:"document_no"`
	PartnerName   string  `json:"partner_name"`
	PaymentMethod string  `json:"payment_method"`
	ReferenceNo   string  `json:"reference_no,omitempty"`
	Amount        float64 `json:"amount"`
	Direction     string  `json:"direction"`
}

func registerPaymentEntryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/payment-entries", listPaymentEntries(pool))
}

func listPaymentEntries(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"entry_date": "entry_date", "amount": "amount", "document_no": "document_no",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "entry_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		base := `
		select entry_type, id, entry_date, document_no, partner_name, payment_method,
		  coalesce(reference_no, ''), amount, direction
		from (
		  select 'official_receipt'::text as entry_type, r.id, r.receipt_date as entry_date,
		    r.receipt_no as document_no, coalesce(p.company_name, '') as partner_name,
		    r.payment_method, r.reference_no, r.amount_total::float8 as amount, 'inbound'::text as direction
		  from public.fin_official_receipts r
		  left join public.inv_partners p on p.id = r.partner_id
		  where r.tenant_id = $1 and r.deleted_at is null
		  union all
		  select 'payment_voucher'::text, pv.id, pv.payment_date,
		    pv.payment_no, coalesce(p.company_name, ''),
		    pv.payment_method, pv.reference_no, pv.amount_total::float8, 'outbound'::text
		  from public.fin_payment_vouchers pv
		  left join public.inv_partners p on p.id = pv.partner_id
		  where pv.tenant_id = $1 and pv.deleted_at is null
		) entries`

		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, tu.TenantID).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count payment entries.", "ERR_INTERNAL")
			return
		}

		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $2 offset $3", base, p.Sort, orderSQL(p.Order))
		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load payment entries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []paymentEntryRow
		for rows.Next() {
			var row paymentEntryRow
			var entryDate any
			if err := rows.Scan(
				&row.EntryType, &row.ID, &entryDate, &row.DocumentNo,
				&row.PartnerName, &row.PaymentMethod, &row.ReferenceNo, &row.Amount, &row.Direction,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payment entries.", "ERR_INTERNAL")
				return
			}
			row.EntryDate = fmt.Sprint(entryDate)
			if len(row.EntryDate) >= 10 {
				row.EntryDate = row.EntryDate[:10]
			}
			out = append(out, row)
		}
		if out == nil {
			out = []paymentEntryRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
