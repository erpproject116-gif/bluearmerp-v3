package sales

import (
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type customerCreditBalanceRow struct {
	PartnerID       int64    `json:"partner_id"`
	CustomerName    string   `json:"customer_name"`
	CreditLimit     *float64 `json:"credit_limit"`
	CreditOnHold    bool     `json:"credit_on_hold"`
	OpenARBalance   float64  `json:"open_ar_balance"`
	AvailableCredit *float64 `json:"available_credit"`
}

func registerCustomerCreditBalanceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("sales.customer_credit_balance", auth.AccessRead)).
		Get("/reports/customer-credit-balance", listCustomerCreditBalance(pool))
}

func listCustomerCreditBalance(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"customer_name":    "customer_name",
		"open_ar_balance":  "open_ar_balance",
		"available_credit": "available_credit",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "customer_name", allowed)
		offset := httputil.Offset(p)

		q := fmt.Sprintf(`
			select partner_id, customer_name, credit_limit, credit_on_hold, open_ar_balance, available_credit, total_count
			from (
			  select p.id as partner_id,
			    p.company_name as customer_name,
			    p.credit_limit::float8 as credit_limit,
			    coalesce(p.credit_limit_on_hold, false) as credit_on_hold,
			    coalesce(ar.open_balance, 0)::float8 as open_ar_balance,
			    case when p.credit_limit is not null
			      then (p.credit_limit - coalesce(ar.open_balance, 0))::float8
			      else null end as available_credit,
			    count(*) over() as total_count
			  from public.inv_partners p
			  left join lateral (
			    select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8 as open_balance
			    from public.sa_sales s
			    left join lateral (
			      select coalesce(sum(a.applied_amount), 0)::float8 as received
			      from public.fin_receipt_applications a
			      join public.fin_official_receipts rcp on rcp.id = a.official_receipt_id
			      where a.sales_id = s.id and rcp.deleted_at is null
			    ) recv on true
			    where s.tenant_id = p.tenant_id and s.partner_id = p.id and s.deleted_at is null
			  ) ar on true
			  where p.tenant_id = $1 and p.deleted_at is null
			    and p.partner_kind in ('customer', 'both')
			    and (p.credit_limit is not null or coalesce(ar.open_balance, 0) > 0.0001)
			) ranked
			order by %s %s
			limit $2 offset $3`, p.Sort, orderSQL(p.Order))

		rows, err := pool.Query(r.Context(), q, tu.TenantID, p.PageSize, offset)
		if err != nil {
			log.Printf("customer-credit-balance query failed: %v", err)
			response.Err(w, http.StatusInternalServerError, fmt.Sprintf("Failed to load credit balance report. [debug: %v]", err), "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []customerCreditBalanceRow
		var total int64
		for rows.Next() {
			var row customerCreditBalanceRow
			var totalCount int64
			if err := rows.Scan(&row.PartnerID, &row.CustomerName, &row.CreditLimit, &row.CreditOnHold,
				&row.OpenARBalance, &row.AvailableCredit, &totalCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read row.", "ERR_INTERNAL")
				return
			}
			total = totalCount
			out = append(out, row)
		}
		if out == nil {
			out = []customerCreditBalanceRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
