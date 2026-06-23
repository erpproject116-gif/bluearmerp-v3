package crm

import (
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type quotationPipelineCard struct {
	ID              int64   `json:"id"`
	OrderDate       string  `json:"order_date"`
	DateNoDisplay   string  `json:"date_no_display"`
	ReferenceNo     string  `json:"reference_no"`
	PartnerID       int64   `json:"partner_id"`
	CustomerName    string  `json:"customer_name"`
	PicName         string  `json:"pic_name"`
	GrandTotal      float64 `json:"grand_total"`
	ValidUntil      *string `json:"valid_until,omitempty"`
	ProgressStatus  string  `json:"progress_status"`
	VoucherStatus   string  `json:"voucher_status"`
	PipelineStage   string  `json:"pipeline_stage"`
	ItemNameSummary string  `json:"item_name_summary,omitempty"`
}

type quotationPipelinePayload struct {
	Stages map[string][]quotationPipelineCard `json:"stages"`
}

func registerPipelineRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/pipelines/quotations", quotationPipeline(pool))
}

func quotationPipeline(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		today := todayDate()
		args := []any{tu.TenantID, today}
		argN := 3
		scope, _ := tu.PicOrCreatedScopeSQL("q", argN, &args)
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select q.id, q.order_date, q.date_seq, q.reference_no, q.partner_id,
			  p.company_name, coalesce(q.pic_name, ''),
			  q.grand_total::float8, q.valid_until, q.progress_status, q.voucher_status,
			  case
			    when q.progress_status = 'completed' then 'won'
			    when q.valid_until is not null and q.valid_until < $2::date then 'expired'
			    when q.voucher_status in ('partial', 'completed') then 'converted_so'
			    when exists (
			      select 1 from public.quo_quotation_lines ln
			      left join (
			        select quotation_line_id, sum(qty) as qty_fulfilled
			        from public.quo_quotation_slip_lines group by quotation_line_id
			      ) slip on slip.quotation_line_id = ln.id
			      where ln.quotation_id = q.id
			        and ln.qty - coalesce(slip.qty_fulfilled, 0) <= 0.0001
			    ) and q.voucher_status = 'completed' then 'converted_sales'
			    else 'open'
			  end as pipeline_stage,
			  (
			    select case
			      when cnt = 0 then ''
			      when cnt = 1 then item_name
			      else item_name || ' +' || (cnt - 1)::text || ' more'
			    end
			    from (
			      select ln.item_name,
			        row_number() over (order by ln.line_no) as rn,
			        count(*) over () as cnt
			      from public.quo_quotation_lines ln
			      where ln.quotation_id = q.id
			    ) x
			    where rn = 1
			  ) as item_summary
			from public.quo_quotations q
			join public.inv_partners p on p.id = q.partner_id
			where q.tenant_id = $1 and q.deleted_at is null%s
			order by q.order_date desc
			limit 500`, scope), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load pipeline.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		payload := quotationPipelinePayload{
			Stages: map[string][]quotationPipelineCard{
				"open": {}, "expired": {}, "converted_so": {}, "converted_sales": {}, "won": {},
			},
		}
		for rows.Next() {
			var card quotationPipelineCard
			var orderDate time.Time
			var dateSeq int
			var validUntil *time.Time
			var itemSummary *string
			if err := rows.Scan(
				&card.ID, &orderDate, &dateSeq, &card.ReferenceNo, &card.PartnerID,
				&card.CustomerName, &card.PicName,
				&card.GrandTotal, &validUntil, &card.ProgressStatus, &card.VoucherStatus,
				&card.PipelineStage, &itemSummary,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pipeline.", "ERR_INTERNAL")
				return
			}
			card.OrderDate = dateToStr(orderDate)
			card.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			card.ValidUntil = datePtrToStr(validUntil)
			if itemSummary != nil {
				card.ItemNameSummary = *itemSummary
			}
			if _, ok := payload.Stages[card.PipelineStage]; !ok {
				payload.Stages[card.PipelineStage] = []quotationPipelineCard{}
			}
			payload.Stages[card.PipelineStage] = append(payload.Stages[card.PipelineStage], card)
		}
		response.OK(w, payload, "OK")
	}
}
