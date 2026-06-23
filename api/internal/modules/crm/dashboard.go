package crm

import (
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type topItemRow struct {
	ItemID   *int64  `json:"item_id,omitempty"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
}

type dashboardSummary struct {
	ScopedView                 bool         `json:"scoped_view"`
	ExpiredQuotationsCount     int64        `json:"expired_quotations_count"`
	QuotesExpiring7d           int64        `json:"quotes_expiring_7d"`
	QuotesNotConvertedToSO     int64        `json:"quotes_not_converted_to_so"`
	QuotesNotConvertedToSales  int64        `json:"quotes_not_converted_to_sales"`
	LowStockSKUCount           int64        `json:"low_stock_sku_count"`
	TopSellingItems            []topItemRow `json:"top_selling_items"`
	TopQuotedItems             []topItemRow `json:"top_quoted_items"`
	WarrantyFollowUpsDue       int64        `json:"warranty_follow_ups_due"`
	UnreadNotificationsCount   int64        `json:"unread_notifications_count"`
	QuotesMissingValidityCount int64        `json:"quotes_missing_validity_count"`
	CustomersWithARBalance     int64        `json:"customers_with_ar_balance"`
}

func registerDashboardRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/dashboard/summary", dashboardSummaryHandler(pool))
}

func dashboardSummaryHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		var s dashboardSummary
		s.ScopedView = !tu.CanViewAllCRM()
		s.TopSellingItems = []topItemRow{}
		s.TopQuotedItems = []topItemRow{}

		today := todayDate()
		analytics := tu.CanViewCrmAnalytics()

		qArgs := []any{tu.TenantID}
		qN := 2
		qScope, qN := tu.PicOrCreatedScopeSQL("q", qN, &qArgs)
		qArgs = append(qArgs, today)
		todayArg := qN
		qN++

		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null%s
			  and q.valid_until is not null and q.valid_until < $%d::date`, qScope, todayArg),
			qArgs...).Scan(&s.ExpiredQuotationsCount)

		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null%s
			  and q.valid_until is not null
			  and q.valid_until >= $%d::date and q.valid_until <= ($%d::date + interval '7 days')::date`,
			qScope, todayArg, todayArg),
			qArgs...).Scan(&s.QuotesExpiring7d)

		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null%s
			  and q.voucher_status = 'none'`, qScope),
			qArgs[:len(qArgs)-1]...).Scan(&s.QuotesNotConvertedToSO)

		if analytics {
			_ = pool.QueryRow(ctx, `
				select count(distinct so.id) from public.so_sales_orders so
				join public.so_sales_order_lines ln on ln.sales_order_id = so.id
				left join (
				  select sales_order_line_id, sum(qty) as qty_sold
				  from public.so_sales_order_slip_lines
				  group by sales_order_line_id
				) slip on slip.sales_order_line_id = ln.id
				where so.tenant_id = $1 and so.deleted_at is null
				  and ln.qty - coalesce(slip.qty_sold, 0) > 0.0001`,
				tu.TenantID).Scan(&s.QuotesNotConvertedToSales)
		} else {
			soArgs := []any{tu.TenantID}
			soN := 2
			soScope, _ := tu.PicOrCreatedScopeSQL("so", soN, &soArgs)
			_ = pool.QueryRow(ctx, fmt.Sprintf(`
				select count(distinct so.id) from public.so_sales_orders so
				join public.so_sales_order_lines ln on ln.sales_order_id = so.id
				left join (
				  select sales_order_line_id, sum(qty) as qty_sold
				  from public.so_sales_order_slip_lines
				  group by sales_order_line_id
				) slip on slip.sales_order_line_id = ln.id
				where so.tenant_id = $1 and so.deleted_at is null%s
				  and ln.qty - coalesce(slip.qty_sold, 0) > 0.0001`, soScope),
				soArgs...).Scan(&s.QuotesNotConvertedToSales)
		}

		if analytics {
			_ = pool.QueryRow(ctx, `
				select count(distinct bal.item_id || ':' || bal.location_id::text)
				from public.inv_item_location_balances bal
				join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
				where bal.tenant_id = $1
				  and coalesce(bal.reorder_level, i.reorder_level) is not null
				  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`,
				tu.TenantID).Scan(&s.LowStockSKUCount)
		}

		tArgs := []any{tu.TenantID}
		tN := 2
		tScope, _ := tu.PicOrCreatedScopeSQL("t", tN, &tArgs)
		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.crm_follow_up_tasks t
			where t.tenant_id = $1 and t.stage in ('due_soon', 'overdue')
			  and t.task_type = 'warranty_follow_up'%s`, tScope),
			tArgs...).Scan(&s.WarrantyFollowUpsDue)

		_ = pool.QueryRow(ctx, `
			select count(*) from public.crm_notifications n
			where n.tenant_id = $1 and n.read_at is null
			  and (n.user_id is null or n.user_id = $2)`,
			tu.TenantID, tu.AppUserID).Scan(&s.UnreadNotificationsCount)

		_ = pool.QueryRow(ctx, fmt.Sprintf(`
			select count(*) from public.quo_quotations q
			where q.tenant_id = $1 and q.deleted_at is null%s
			  and q.valid_until is null`, qScope),
			qArgs[:len(qArgs)-1]...).Scan(&s.QuotesMissingValidityCount)

		if analytics {
			_ = pool.QueryRow(ctx, `
				select count(*) from (
				  select s.partner_id
				  from public.sa_sales s
				  left join lateral (
				    select coalesce(sum(a.applied_amount), 0)::float8 as received
				    from public.fin_receipt_applications a
				    join public.fin_official_receipts r on r.id = a.official_receipt_id
				    where a.sales_id = s.id and r.deleted_at is null
				  ) recv on true
				  where s.tenant_id = $1 and s.deleted_at is null
				  group by s.partner_id
				  having coalesce(sum(s.grand_total), 0) - coalesce(sum(recv.received), 0) > 0
				) ar`,
				tu.TenantID).Scan(&s.CustomersWithARBalance)

			sellRows, err := pool.Query(ctx, `
				select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
				from public.sa_sales_lines ln
				join public.sa_sales s on s.id = ln.sales_id
				where s.tenant_id = $1 and s.deleted_at is null
				  and s.order_date >= (current_date - interval '90 days')::date
				group by ln.item_id, ln.item_code, ln.item_name
				order by qty desc
				limit 5`, tu.TenantID)
			if err == nil {
				defer sellRows.Close()
				for sellRows.Next() {
					var row topItemRow
					if err := sellRows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err == nil {
						s.TopSellingItems = append(s.TopSellingItems, row)
					}
				}
			}

			quoteRows, err := pool.Query(ctx, `
				select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
				from public.quo_quotation_lines ln
				join public.quo_quotations q on q.id = ln.quotation_id
				where q.tenant_id = $1 and q.deleted_at is null
				  and q.order_date >= (current_date - interval '90 days')::date
				group by ln.item_id, ln.item_code, ln.item_name
				order by qty desc
				limit 5`, tu.TenantID)
			if err == nil {
				defer quoteRows.Close()
				for quoteRows.Next() {
					var row topItemRow
					if err := quoteRows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err == nil {
						s.TopQuotedItems = append(s.TopQuotedItems, row)
					}
				}
			}
		} else {
			sArgs := []any{tu.TenantID}
			sN := 2
			sScope, _ := tu.PicOrCreatedScopeSQL("s", sN, &sArgs)
			sellRows, err := pool.Query(ctx, fmt.Sprintf(`
				select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
				from public.sa_sales_lines ln
				join public.sa_sales s on s.id = ln.sales_id
				where s.tenant_id = $1 and s.deleted_at is null%s
				  and s.order_date >= (current_date - interval '90 days')::date
				group by ln.item_id, ln.item_code, ln.item_name
				order by qty desc
				limit 5`, sScope), sArgs...)
			if err == nil {
				defer sellRows.Close()
				for sellRows.Next() {
					var row topItemRow
					if err := sellRows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err == nil {
						s.TopSellingItems = append(s.TopSellingItems, row)
					}
				}
			}

			quoteRows, err := pool.Query(ctx, fmt.Sprintf(`
				select ln.item_id, ln.item_code, ln.item_name, sum(ln.qty)::float8 as qty
				from public.quo_quotation_lines ln
				join public.quo_quotations q on q.id = ln.quotation_id
				where q.tenant_id = $1 and q.deleted_at is null%s
				  and q.order_date >= (current_date - interval '90 days')::date
				group by ln.item_id, ln.item_code, ln.item_name
				order by qty desc
				limit 5`, qScope), qArgs[:len(qArgs)-1]...)
			if err == nil {
				defer quoteRows.Close()
				for quoteRows.Next() {
					var row topItemRow
					if err := quoteRows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.Qty); err == nil {
						s.TopQuotedItems = append(s.TopQuotedItems, row)
					}
				}
			}
		}

		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, s, "OK")
	}
}
