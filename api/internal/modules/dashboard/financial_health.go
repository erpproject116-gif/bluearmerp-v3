package dashboard

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type cashPulseMonth struct {
	Period  string  `json:"period"`
	Inflow  float64 `json:"inflow"`
	Outflow float64 `json:"outflow"`
	Net     float64 `json:"net"`
}

type cashPulse struct {
	InflowYTD  float64          `json:"inflow_ytd"`
	OutflowYTD float64          `json:"outflow_ytd"`
	NetYTD     float64          `json:"net_ytd"`
	InflowMTD  float64          `json:"inflow_mtd"`
	OutflowMTD float64          `json:"outflow_mtd"`
	NetMTD     float64          `json:"net_mtd"`
	Months     []cashPulseMonth `json:"months"`
}

type agingBuckets struct {
	Current    float64 `json:"current"`
	Days1To30  float64 `json:"days_1_30"`
	Days31To60 float64 `json:"days_31_60"`
	Days61To90 float64 `json:"days_61_90"`
	Over90     float64 `json:"over_90"`
	Total      float64 `json:"total"`
	Overdue    float64 `json:"overdue"`
}

type overdueInvoiceAlert struct {
	SalesID      int64   `json:"sales_id"`
	SalesNo      string  `json:"sales_no"`
	CustomerName string  `json:"customer_name"`
	DueDate      string  `json:"due_date"`
	Balance      float64 `json:"balance"`
	AgeDays      int     `json:"age_days"`
	AgeBucket    string  `json:"age_bucket"`
}

type pipelinePulse struct {
	OpenOpportunities      int64   `json:"open_opportunities"`
	WeightedPipelineValue  float64 `json:"weighted_pipeline_value"`
	ExpectedPipelineValue  float64 `json:"expected_pipeline_value"`
	FollowUpsDue           int64   `json:"follow_ups_due"`
	OpenQuotationsValue    float64 `json:"open_quotations_value"`
	QuotesExpiring7d       int64   `json:"quotes_expiring_7d"`
}

type profitRow struct {
	Key         string  `json:"key"`
	Label       string  `json:"label"`
	Revenue     float64 `json:"revenue"`
	Cost        float64 `json:"cost"`
	Margin      float64 `json:"margin"`
	MarginPct   float64 `json:"margin_pct"`
	TxnCount    int64   `json:"txn_count,omitempty"`
	ItemID      *int64  `json:"item_id,omitempty"`
	ProjectID   *int64  `json:"project_id,omitempty"`
}

type recurringRow struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	Category     string  `json:"category"`
	VendorName   string  `json:"vendor_name"`
	Amount       float64 `json:"amount"`
	Frequency    string  `json:"frequency"`
	MonthlyEquiv float64 `json:"monthly_equiv"`
	NextDueDate  *string `json:"next_due_date,omitempty"`
	IsActive     bool    `json:"is_active"`
}

type recurringPulse struct {
	MonthlyBurn float64        `json:"monthly_burn"`
	YearlyBurn  float64        `json:"yearly_burn"`
	ActiveCount int64          `json:"active_count"`
	Items       []recurringRow `json:"items"`
}

type financialHealthResponse struct {
	AsOf             string                `json:"as_of"`
	Cash             cashPulse             `json:"cash"`
	Receivables      agingBuckets          `json:"receivables"`
	Payables         agingBuckets          `json:"payables"`
	OverdueAlerts    []overdueInvoiceAlert `json:"overdue_alerts"`
	OverdueAlertCount int64                `json:"overdue_alert_count"`
	Pipeline         pipelinePulse         `json:"pipeline"`
	ProfitByProduct  []profitRow           `json:"profit_by_product"`
	ProfitByProject  []profitRow           `json:"profit_by_project"`
	Recurring        recurringPulse        `json:"recurring"`
}

func financialHealthHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		out := LoadFinancialHealth(r.Context(), pool, tu.TenantID)
		w.Header().Set("Cache-Control", "private, max-age=30")
		response.OK(w, out, "OK")
	}
}

// LoadFinancialHealth builds the dashboard financial-health payload (also used by Copilot tools).
func LoadFinancialHealth(ctx context.Context, pool *pgxpool.Pool, tenantID int64) financialHealthResponse {
	today := todayDate()
	out := financialHealthResponse{
		AsOf:            today.Format("2006-01-02"),
		OverdueAlerts:   []overdueInvoiceAlert{},
		ProfitByProduct: []profitRow{},
		ProfitByProject: []profitRow{},
		Recurring:       recurringPulse{Items: []recurringRow{}},
		Cash:            cashPulse{Months: []cashPulseMonth{}},
	}
	out.Cash = loadCashPulse(ctx, pool, tenantID, today)
	out.Receivables = loadARBuckets(ctx, pool, tenantID, today)
	out.Payables = loadAPBuckets(ctx, pool, tenantID, today)
	out.OverdueAlerts, out.OverdueAlertCount = loadOverdueAlerts(ctx, pool, tenantID, today, 12)
	out.Pipeline = loadPipelinePulse(ctx, pool, tenantID, today)
	out.ProfitByProduct = loadProfitByProduct(ctx, pool, tenantID, 90, 8)
	out.ProfitByProject = loadProfitByProject(ctx, pool, tenantID, 90, 8)
	out.Recurring = loadRecurringPulse(ctx, pool, tenantID)
	return out
}

func loadCashPulse(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time) cashPulse {
	var out cashPulse
	out.Months = []cashPulseMonth{}

	_ = pool.QueryRow(ctx, `
		select coalesce(sum(amount_total), 0)::float8
		from public.fin_official_receipts
		where tenant_id = $1 and deleted_at is null
		  and receipt_date >= date_trunc('year', $2::date)::date
		  and receipt_date <= $2::date`, tenantID, today).Scan(&out.InflowYTD)
	_ = pool.QueryRow(ctx, `
		select coalesce(sum(amount_total), 0)::float8
		from public.fin_payment_vouchers
		where tenant_id = $1 and deleted_at is null
		  and payment_date >= date_trunc('year', $2::date)::date
		  and payment_date <= $2::date`, tenantID, today).Scan(&out.OutflowYTD)
	out.NetYTD = out.InflowYTD - out.OutflowYTD

	_ = pool.QueryRow(ctx, `
		select coalesce(sum(amount_total), 0)::float8
		from public.fin_official_receipts
		where tenant_id = $1 and deleted_at is null
		  and receipt_date >= date_trunc('month', $2::date)::date
		  and receipt_date <= $2::date`, tenantID, today).Scan(&out.InflowMTD)
	_ = pool.QueryRow(ctx, `
		select coalesce(sum(amount_total), 0)::float8
		from public.fin_payment_vouchers
		where tenant_id = $1 and deleted_at is null
		  and payment_date >= date_trunc('month', $2::date)::date
		  and payment_date <= $2::date`, tenantID, today).Scan(&out.OutflowMTD)
	out.NetMTD = out.InflowMTD - out.OutflowMTD

	rows, err := pool.Query(ctx, `
		with months as (
		  select generate_series(
		    date_trunc('month', $2::date) - interval '11 months',
		    date_trunc('month', $2::date),
		    interval '1 month'
		  )::date as m
		),
		inflows as (
		  select date_trunc('month', receipt_date)::date as m, sum(amount_total)::float8 as amt
		  from public.fin_official_receipts
		  where tenant_id = $1 and deleted_at is null
		    and receipt_date >= (date_trunc('month', $2::date) - interval '11 months')::date
		    and receipt_date <= $2::date
		  group by 1
		),
		outflows as (
		  select date_trunc('month', payment_date)::date as m, sum(amount_total)::float8 as amt
		  from public.fin_payment_vouchers
		  where tenant_id = $1 and deleted_at is null
		    and payment_date >= (date_trunc('month', $2::date) - interval '11 months')::date
		    and payment_date <= $2::date
		  group by 1
		)
		select to_char(months.m, 'YYYY-MM'),
		  coalesce(inflows.amt, 0)::float8,
		  coalesce(outflows.amt, 0)::float8
		from months
		left join inflows on inflows.m = months.m
		left join outflows on outflows.m = months.m
		order by months.m`, tenantID, today)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var m cashPulseMonth
		if err := rows.Scan(&m.Period, &m.Inflow, &m.Outflow); err != nil {
			continue
		}
		m.Net = m.Inflow - m.Outflow
		out.Months = append(out.Months, m)
	}
	return out
}

func loadARBuckets(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time) agingBuckets {
	var out agingBuckets
	rows, err := pool.Query(ctx, `
		select
		  case
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 0 then 'current'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 30 then '1-30'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 60 then '31-60'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 90 then '61-90'
		    else '90+'
		  end as bucket,
		  sum((s.grand_total - coalesce(recv.received, 0)))::float8
		from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		group by 1`, tenantID, today)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var bucket string
		var amt float64
		if err := rows.Scan(&bucket, &amt); err != nil {
			continue
		}
		out.Total += amt
		switch bucket {
		case "current":
			out.Current += amt
		case "1-30":
			out.Days1To30 += amt
		case "31-60":
			out.Days31To60 += amt
		case "61-90":
			out.Days61To90 += amt
		default:
			out.Over90 += amt
		}
	}
	out.Overdue = out.Days1To30 + out.Days31To60 + out.Days61To90 + out.Over90
	return out
}

func loadAPBuckets(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time) agingBuckets {
	var out agingBuckets
	rows, err := pool.Query(ctx, `
		select
		  case
		    when ($2::date - si.invoice_date::date) <= 0 then 'current'
		    when ($2::date - si.invoice_date::date) <= 30 then '1-30'
		    when ($2::date - si.invoice_date::date) <= 60 then '31-60'
		    when ($2::date - si.invoice_date::date) <= 90 then '61-90'
		    else '90+'
		  end as bucket,
		  sum((si.grand_total - coalesce(paid.paid, 0)))::float8
		from public.fin_supplier_invoices si
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as paid
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  where a.supplier_invoice_id = si.id and pv.deleted_at is null
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null
		  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001
		group by 1`, tenantID, today)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var bucket string
		var amt float64
		if err := rows.Scan(&bucket, &amt); err != nil {
			continue
		}
		out.Total += amt
		switch bucket {
		case "current":
			out.Current += amt
		case "1-30":
			out.Days1To30 += amt
		case "31-60":
			out.Days31To60 += amt
		case "61-90":
			out.Days61To90 += amt
		default:
			out.Over90 += amt
		}
	}
	out.Overdue = out.Days1To30 + out.Days31To60 + out.Days61To90 + out.Over90
	return out
}

func loadOverdueAlerts(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time, limit int) ([]overdueInvoiceAlert, int64) {
	out := []overdueInvoiceAlert{}
	var total int64
	_ = pool.QueryRow(ctx, `
		select count(*) from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and ($2::date - coalesce(s.due_date, s.order_date)::date) > 0`,
		tenantID, today).Scan(&total)

	rows, err := pool.Query(ctx, `
		select s.id, s.sales_no, p.company_name,
		  coalesce(s.due_date, s.order_date)::date::text,
		  (s.grand_total - coalesce(recv.received, 0))::float8,
		  ($2::date - coalesce(s.due_date, s.order_date)::date)::int,
		  case
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 30 then '1-30'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 60 then '31-60'
		    when ($2::date - coalesce(s.due_date, s.order_date)::date) <= 90 then '61-90'
		    else '90+'
		  end
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and ($2::date - coalesce(s.due_date, s.order_date)::date) > 0
		order by ($2::date - coalesce(s.due_date, s.order_date)::date) desc, balance desc
		limit $3`, tenantID, today, limit)
	if err != nil {
		return out, total
	}
	defer rows.Close()
	for rows.Next() {
		var row overdueInvoiceAlert
		if err := rows.Scan(&row.SalesID, &row.SalesNo, &row.CustomerName, &row.DueDate, &row.Balance, &row.AgeDays, &row.AgeBucket); err != nil {
			continue
		}
		out = append(out, row)
	}
	return out, total
}

func loadPipelinePulse(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time) pipelinePulse {
	var out pipelinePulse
	_ = pool.QueryRow(ctx, `
		select count(*),
		  coalesce(sum(coalesce(expected_value, 0) * coalesce(probability, 0) / 100.0), 0)::float8,
		  coalesce(sum(coalesce(expected_value, 0)), 0)::float8
		from public.crm_opportunities
		where tenant_id = $1
		  and stage not in ('won', 'lost')`, tenantID).Scan(
		&out.OpenOpportunities, &out.WeightedPipelineValue, &out.ExpectedPipelineValue)

	_ = pool.QueryRow(ctx, `
		select count(*) from public.crm_follow_up_tasks
		where tenant_id = $1 and stage in ('due_soon', 'overdue')`, tenantID).Scan(&out.FollowUpsDue)

	_ = pool.QueryRow(ctx, `
		select coalesce(sum(grand_total), 0)::float8 from public.quo_quotations
		where tenant_id = $1 and deleted_at is null
		  and progress_status <> 'cancelled'
		  and voucher_status = 'none'`, tenantID).Scan(&out.OpenQuotationsValue)

	_ = pool.QueryRow(ctx, `
		select count(*) from public.quo_quotations
		where tenant_id = $1 and deleted_at is null
		  and valid_until is not null
		  and valid_until >= $2::date
		  and valid_until <= ($2::date + interval '7 days')::date`,
		tenantID, today).Scan(&out.QuotesExpiring7d)
	return out
}

func loadProfitByProduct(ctx context.Context, pool *pgxpool.Pool, tenantID int64, days, limit int) []profitRow {
	out := []profitRow{}
	rows, err := pool.Query(ctx, `
		select ln.item_id, coalesce(nullif(ln.item_code, ''), '—'), coalesce(nullif(ln.item_name, ''), 'Unnamed'),
		  sum(ln.line_total)::float8 as revenue,
		  sum(ln.qty * coalesce(i.purchase_price, 0))::float8 as cost,
		  count(distinct s.id)::bigint
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id
		left join public.inv_items i on i.id = ln.item_id and i.tenant_id = s.tenant_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= ($2::date - make_interval(days => $3))::date
		  and s.order_date <= $2::date
		group by ln.item_id, ln.item_code, ln.item_name
		order by revenue desc
		limit $4`, tenantID, todayDate(), days, limit)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var row profitRow
		var itemID *int64
		var code, name string
		if err := rows.Scan(&itemID, &code, &name, &row.Revenue, &row.Cost, &row.TxnCount); err != nil {
			continue
		}
		row.ItemID = itemID
		row.Key = code
		row.Label = name
		if code != "—" && code != "" {
			row.Label = code + " — " + name
		}
		row.Margin = row.Revenue - row.Cost
		if row.Revenue > 0 {
			row.MarginPct = (row.Margin / row.Revenue) * 100
		}
		out = append(out, row)
	}
	return out
}

func loadProfitByProject(ctx context.Context, pool *pgxpool.Pool, tenantID int64, days, limit int) []profitRow {
	out := []profitRow{}
	rows, err := pool.Query(ctx, `
		select s.project_id, coalesce(nullif(s.project_name, ''), 'No project'),
		  sum(s.grand_total)::float8 as revenue,
		  coalesce(sum(line_cost.cost), 0)::float8 as cost,
		  count(*)::bigint
		from public.sa_sales s
		left join lateral (
		  select sum(ln.qty * coalesce(i.purchase_price, 0))::float8 as cost
		  from public.sa_sales_lines ln
		  left join public.inv_items i on i.id = ln.item_id and i.tenant_id = s.tenant_id
		  where ln.sales_id = s.id
		) line_cost on true
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= ($2::date - make_interval(days => $3))::date
		  and s.order_date <= $2::date
		group by s.project_id, s.project_name
		order by revenue desc
		limit $4`, tenantID, todayDate(), days, limit)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var row profitRow
		var projectID *int64
		var name string
		if err := rows.Scan(&projectID, &name, &row.Revenue, &row.Cost, &row.TxnCount); err != nil {
			continue
		}
		row.ProjectID = projectID
		row.Key = name
		row.Label = name
		row.Margin = row.Revenue - row.Cost
		if row.Revenue > 0 {
			row.MarginPct = (row.Margin / row.Revenue) * 100
		}
		out = append(out, row)
	}
	return out
}

func monthlyEquiv(amount float64, frequency string) float64 {
	switch frequency {
	case "weekly":
		return amount * 52 / 12
	case "quarterly":
		return amount / 3
	case "yearly":
		return amount / 12
	default:
		return amount
	}
}

func loadRecurringPulse(ctx context.Context, pool *pgxpool.Pool, tenantID int64) recurringPulse {
	out := recurringPulse{Items: []recurringRow{}}
	rows, err := pool.Query(ctx, `
		select id, name, category, vendor_name, amount::float8, frequency,
		  next_due_date::text, is_active
		from public.fin_recurring_expenses
		where tenant_id = $1 and deleted_at is null and is_active = true
		order by amount desc, name
		limit 50`, tenantID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var row recurringRow
		var nextDue *string
		if err := rows.Scan(&row.ID, &row.Name, &row.Category, &row.VendorName, &row.Amount, &row.Frequency, &nextDue, &row.IsActive); err != nil {
			continue
		}
		row.NextDueDate = nextDue
		row.MonthlyEquiv = monthlyEquiv(row.Amount, row.Frequency)
		out.MonthlyBurn += row.MonthlyEquiv
		out.ActiveCount++
		out.Items = append(out.Items, row)
	}
	out.YearlyBurn = out.MonthlyBurn * 12
	return out
}
