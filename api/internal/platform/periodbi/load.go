package periodbi

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Kind selects weekly or monthly BI snapshot windows.
type Kind string

const (
	Weekly  Kind = "weekly"
	Monthly Kind = "monthly"
)

// NamedAmount is a labeled money/count row for email and UI.
type NamedAmount struct {
	Label  string  `json:"label"`
	Amount float64 `json:"amount"`
	Count  int64   `json:"count,omitempty"`
	Href   string  `json:"href,omitempty"`
}

// Report is the owner-facing weekly/monthly intelligence snapshot.
type Report struct {
	Period               string        `json:"period"`
	AsOf                 string        `json:"as_of"`
	WindowLabel          string        `json:"window_label"`
	LookbackDays         int           `json:"lookback_days"`
	CompanyName          string        `json:"company_name,omitempty"`
	SalesMTD             float64       `json:"sales_mtd"`
	SalesYTD             float64       `json:"sales_ytd"`
	SalesInWindow        float64       `json:"sales_in_window"`
	CashInflowMTD        float64       `json:"cash_inflow_mtd"`
	CashOutflowMTD       float64       `json:"cash_outflow_mtd"`
	CashNetMTD           float64       `json:"cash_net_mtd"`
	CashInflowYTD        float64       `json:"cash_inflow_ytd"`
	CashOutflowYTD       float64       `json:"cash_outflow_ytd"`
	CashNetYTD           float64       `json:"cash_net_ytd"`
	ARTotal              float64       `json:"ar_total"`
	AROverdue            float64       `json:"ar_overdue"`
	APTotal              float64       `json:"ap_total"`
	APOverdue            float64       `json:"ap_overdue"`
	OverdueARCount       int64         `json:"overdue_ar_count"`
	PendingSO            int64         `json:"pending_so"`
	PendingPO            int64         `json:"pending_po"`
	PendingPR            int64         `json:"pending_pr"`
	QuotesExpiring7d     int64         `json:"quotes_expiring_7d"`
	LowStockCount        int64         `json:"low_stock_count"`
	ZeroStockCount       int64         `json:"zero_stock_count"`
	RedFlagTotal         int64         `json:"red_flag_total"`
	RedFlags             []NamedAmount `json:"red_flags"`
	TopCustomers         []NamedAmount `json:"top_customers"`
	TopItems             []NamedAmount `json:"top_items"`
	ProfitProducts       []NamedAmount `json:"profit_products"`
	RecurringBurnMonthly float64       `json:"recurring_burn_monthly"`
	PnLIncome            float64       `json:"pnl_income"`
	PnLExpense           float64       `json:"pnl_expense"`
	PnLNet               float64       `json:"pnl_net"`
	HasJournalPnL        bool          `json:"has_journal_pnl"`
	OverdueAlerts        []NamedAmount `json:"overdue_alerts"`
}

func todayUTC() time.Time {
	now := time.Now().UTC()
	return time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
}

func countInt64(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) int64 {
	var n int64
	_ = pool.QueryRow(ctx, q, args...).Scan(&n)
	return n
}

func sumFloat(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) float64 {
	var n float64
	_ = pool.QueryRow(ctx, q, args...).Scan(&n)
	return n
}

// Load builds a weekly or monthly BI snapshot from existing operational tables.
func Load(ctx context.Context, pool *pgxpool.Pool, tenantID int64, kind Kind) Report {
	return LoadWindow(ctx, pool, tenantID, kind, time.Time{}, time.Time{})
}

// LoadWindow builds a BI snapshot. When from/to are zero, weekly/monthly windows are used.
func LoadWindow(ctx context.Context, pool *pgxpool.Pool, tenantID int64, kind Kind, from, to time.Time) Report {
	if kind != Monthly {
		kind = Weekly
	}
	today := todayUTC()
	if to.IsZero() {
		to = today
	}
	if from.IsZero() {
		if kind == Monthly {
			from = time.Date(to.Year(), to.Month(), 1, 0, 0, 0, 0, time.UTC)
		} else {
			from = to.AddDate(0, 0, -6)
		}
	}
	if to.Before(from) {
		from, to = to, from
	}
	lookback := int(to.Sub(from).Hours()/24) + 1
	if lookback < 1 {
		lookback = 1
	}
	windowLabel := from.Format("Jan 2, 2006") + " – " + to.Format("Jan 2, 2006")
	if kind == Monthly && from.Day() == 1 && from.Month() == to.Month() && from.Year() == to.Year() && to.Equal(today) {
		windowLabel = to.Format("January 2006") + " (MTD)"
	} else if kind == Weekly && lookback == 7 && to.Equal(today) && from.Equal(to.AddDate(0, 0, -6)) {
		windowLabel = "Last 7 days"
	}

	out := Report{
		Period:         string(kind),
		AsOf:           to.Format("2006-01-02"),
		WindowLabel:    windowLabel,
		LookbackDays:   lookback,
		RedFlags:       []NamedAmount{},
		TopCustomers:   []NamedAmount{},
		TopItems:       []NamedAmount{},
		ProfitProducts: []NamedAmount{},
		OverdueAlerts:  []NamedAmount{},
	}

	out.SalesMTD = sumFloat(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8 from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and order_date >= date_trunc('month', $2::date)::date and order_date <= $2::date`, tenantID, to)
	out.SalesYTD = sumFloat(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8 from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and order_date >= date_trunc('year', $2::date)::date and order_date <= $2::date`, tenantID, to)
  out.SalesInWindow = sumFloat(ctx, pool, `
		select coalesce(sum(grand_total), 0)::float8 from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and order_date >= $2::date
		  and order_date <= $3::date`, tenantID, from, to)

	out.CashInflowMTD = sumFloat(ctx, pool, `
		select coalesce(sum(amount_total), 0)::float8 from public.fin_official_receipts
		where tenant_id = $1 and deleted_at is null
		  and receipt_date >= date_trunc('month', $2::date)::date and receipt_date <= $2::date`, tenantID, today)
	out.CashOutflowMTD = sumFloat(ctx, pool, `
		select coalesce(sum(amount_total), 0)::float8 from public.fin_payment_vouchers
		where tenant_id = $1 and deleted_at is null
		  and payment_date >= date_trunc('month', $2::date)::date and payment_date <= $2::date`, tenantID, today)
	out.CashNetMTD = out.CashInflowMTD - out.CashOutflowMTD
	out.CashInflowYTD = sumFloat(ctx, pool, `
		select coalesce(sum(amount_total), 0)::float8 from public.fin_official_receipts
		where tenant_id = $1 and deleted_at is null
		  and receipt_date >= date_trunc('year', $2::date)::date and receipt_date <= $2::date`, tenantID, today)
	out.CashOutflowYTD = sumFloat(ctx, pool, `
		select coalesce(sum(amount_total), 0)::float8 from public.fin_payment_vouchers
		where tenant_id = $1 and deleted_at is null
		  and payment_date >= date_trunc('year', $2::date)::date and payment_date <= $2::date`, tenantID, today)
	out.CashNetYTD = out.CashInflowYTD - out.CashOutflowYTD

	out.ARTotal = sumFloat(ctx, pool, `
		select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8
		from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001`, tenantID)
	out.AROverdue = sumFloat(ctx, pool, `
		select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8
		from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and coalesce(s.due_date, s.order_date) < $2::date`, tenantID, today)
	out.OverdueARCount = countInt64(ctx, pool, `
		select count(*)::bigint from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and coalesce(s.due_date, s.order_date) < $2::date`, tenantID, today)

	out.APTotal = sumFloat(ctx, pool, `
		select coalesce(sum(si.grand_total - coalesce(paid.paid, 0)), 0)::float8
		from public.fin_supplier_invoices si
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as paid
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  where a.supplier_invoice_id = si.id and pv.deleted_at is null
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null
		  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`, tenantID)
	out.APOverdue = sumFloat(ctx, pool, `
		select coalesce(sum(si.grand_total - coalesce(paid.paid, 0)), 0)::float8
		from public.fin_supplier_invoices si
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as paid
		  from public.fin_payment_applications a
		  join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		  where a.supplier_invoice_id = si.id and pv.deleted_at is null
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null
		  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001
		  and ($2::date - si.invoice_date::date) > 0`, tenantID, today)

	out.PendingSO = countInt64(ctx, pool, `
		select count(*)::bigint from public.so_sales_orders
		where tenant_id = $1 and deleted_at is null
		  and progress_status in ('unconfirmed', 'e_approval', 'in_progress')`, tenantID)
	out.PendingPO = countInt64(ctx, pool, `
		select count(*)::bigint from public.po_purchase_orders
		where tenant_id = $1 and deleted_at is null and status <> 'cancelled'
		  and progress_status is distinct from 'completed'`, tenantID)
	out.PendingPR = countInt64(ctx, pool, `
		select count(*)::bigint from public.pr_purchase_requests
		where tenant_id = $1 and deleted_at is null
		  and progress_status in ('unconfirmed', 'e_approval', 'in_progress')`, tenantID)
	out.QuotesExpiring7d = countInt64(ctx, pool, `
		select count(*)::bigint from public.quo_quotations q
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.valid_until is not null
		  and q.valid_until >= $2::date and q.valid_until <= ($2::date + 7)`, tenantID, today)
	out.LowStockCount = countInt64(ctx, pool, `
		select count(*)::bigint from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tenantID)
	out.ZeroStockCount = countInt64(ctx, pool, `
		select count(distinct bal.item_id)::bigint from public.inv_item_location_balances bal
		where bal.tenant_id = $1 and bal.qty_on_hand <= 0`, tenantID)

	out.RecurringBurnMonthly = 0
	{
		rows, err := pool.Query(ctx, `
			select amount::float8, frequency
			from public.fin_recurring_expenses
			where tenant_id = $1 and deleted_at is null and is_active = true`, tenantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var amt float64
				var freq string
				if rows.Scan(&amt, &freq) != nil {
					continue
				}
				switch strings.ToLower(strings.TrimSpace(freq)) {
				case "yearly", "annual", "year":
					out.RecurringBurnMonthly += amt / 12
				case "weekly", "week":
					out.RecurringBurnMonthly += amt * 52 / 12
				default:
					out.RecurringBurnMonthly += amt
				}
			}
		}
	}

	out.RedFlags = loadRedFlags(ctx, pool, tenantID, today)
	for _, f := range out.RedFlags {
		out.RedFlagTotal += f.Count
	}
	out.TopCustomers = loadTopsRange(ctx, pool, `
		select p.company_name, coalesce(sum(s.grand_total), 0)::float8
		from public.sa_sales s
		join public.inv_partners p on p.id = s.partner_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= $2::date and s.order_date <= $3::date
		group by p.company_name order by 2 desc limit $4`, tenantID, from, to, 5, "/app/sales/sales")
	out.TopItems = loadTopsRange(ctx, pool, `
		select coalesce(nullif(trim(ln.item_name), ''), nullif(trim(ln.item_code), ''), 'Item'),
		  coalesce(sum(ln.qty), 0)::float8
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= $2::date and s.order_date <= $3::date
		group by 1 order by 2 desc limit $4`, tenantID, from, to, 5, "/app/sales/sales")
	out.OverdueAlerts = loadOverdueAlerts(ctx, pool, tenantID, today, 5)

	out.PnLIncome, out.PnLExpense, out.HasJournalPnL = loadPnL(ctx, pool, tenantID, from, to)
	out.PnLNet = out.PnLIncome - out.PnLExpense
	out.ProfitProducts = loadProfitProducts(ctx, pool, tenantID, 5)
	return out
}

func loadTopsRange(ctx context.Context, pool *pgxpool.Pool, q string, tenantID int64, from, to time.Time, limit int, href string) []NamedAmount {
	rows, err := pool.Query(ctx, q, tenantID, from, to, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []NamedAmount
	for rows.Next() {
		var row NamedAmount
		if rows.Scan(&row.Label, &row.Amount) != nil {
			continue
		}
		row.Href = href
		out = append(out, row)
	}
	return out
}

func loadOverdueAlerts(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time, limit int) []NamedAmount {
	rows, err := pool.Query(ctx, `
		select coalesce(p.company_name, 'Customer') || ' · ' || coalesce(s.sales_no, ''),
		  (s.grand_total - coalesce(recv.received, 0))::float8,
		  ($2::date - coalesce(s.due_date, s.order_date)::date)::int
		from public.sa_sales s
		left join public.inv_partners p on p.id = s.partner_id
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and coalesce(s.due_date, s.order_date) < $2::date
		order by 3 desc
		limit $3`, tenantID, today, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []NamedAmount
	for rows.Next() {
		var row NamedAmount
		if rows.Scan(&row.Label, &row.Amount, &row.Count) != nil {
			continue
		}
		row.Href = "/app/finance/collections"
		out = append(out, row)
	}
	return out
}

func loadPnL(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) (income, expense float64, ok bool) {
	var hasData bool
	_ = pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.fin_journal_entries
		  where tenant_id = $1 and deleted_at is null and status = 'posted'
		    and entry_date >= $2::date and entry_date <= $3::date
		)`, tenantID, from, to).Scan(&hasData)
	if !hasData {
		return 0, 0, false
	}
	_ = pool.QueryRow(ctx, `
		select
		  coalesce(sum(case when a.account_type = 'income' then -(l.debit - l.credit) else 0 end), 0)::float8,
		  coalesce(sum(case when a.account_type = 'expense' then (l.debit - l.credit) else 0 end), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries e on e.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		where e.tenant_id = $1 and e.deleted_at is null and e.status = 'posted'
		  and e.entry_date >= $2::date and e.entry_date <= $3::date
		  and a.account_type in ('income', 'expense')`, tenantID, from, to).Scan(&income, &expense)
	return income, expense, true
}

func loadProfitProducts(ctx context.Context, pool *pgxpool.Pool, tenantID int64, limit int) []NamedAmount {
	rows, err := pool.Query(ctx, `
		select coalesce(nullif(ln.item_name, ''), 'Unnamed'),
		  (sum(ln.line_total) - sum(ln.qty * coalesce(i.purchase_price, 0)))::float8
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id
		left join public.inv_items i on i.id = ln.item_id and i.tenant_id = s.tenant_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.order_date >= (current_date - interval '90 days')::date
		group by ln.item_name
		order by 2 desc
		limit $2`, tenantID, limit)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []NamedAmount
	for rows.Next() {
		var row NamedAmount
		if rows.Scan(&row.Label, &row.Amount) != nil {
			continue
		}
		out = append(out, row)
	}
	return out
}

func loadRedFlags(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today time.Time) []NamedAmount {
	type flag struct {
		label, href string
		count       int64
	}
	flags := []flag{
		{"Low stock", "/app/inventory/find-stock", 0},
		{"Expired quotes", "/app/quotation/quotations", 0},
		{"Open PO lines", "/app/purchase-order/purchase-orders", 0},
		{"Overdue AR", "/app/finance/collections", 0},
		{"Serial qty mismatch", "/app/inventory/stock-reconciliation", 0},
	}
	flags[0].count = countInt64(ctx, pool, `
		select count(distinct bal.item_id || ':' || bal.location_id::text)
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tenantID)
	flags[1].count = countInt64(ctx, pool, `
		select count(*) from public.quo_quotations q
		where q.tenant_id = $1 and q.deleted_at is null
		  and q.valid_until is not null and q.valid_until < $2::date`, tenantID, today)
	flags[2].count = countInt64(ctx, pool, `
		select count(*) from public.po_purchase_order_lines ln
		join public.po_purchase_orders po on po.id = ln.purchase_order_id
		where po.tenant_id = $1 and po.deleted_at is null
		  and po.status not in ('cancelled', 'received')
		  and (ln.qty - ln.received_qty) > 0.0001`, tenantID)
	flags[3].count = countInt64(ctx, pool, `
		select count(*) from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount + coalesce(a.discount_amount, 0)), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001
		  and coalesce(s.due_date, s.order_date) < $2::date`, tenantID, today)
	flags[4].count = countInt64(ctx, pool, `
		select count(*) from (
		  select ln.id from public.sa_sales_lines ln
		  join public.sa_sales s on s.id = ln.sales_id
		  join public.inv_items i on i.id = ln.item_id
		  left join (select sales_line_id, count(*)::float8 as serial_cnt from public.inv_serial_unit_sales_lines group by sales_line_id) j on j.sales_line_id = ln.id
		  where s.tenant_id = $1 and s.deleted_at is null and i.track_serial = true and ln.qty > 0 and coalesce(j.serial_cnt, 0) <> ln.qty
		) x`, tenantID)

	bookkeeping := []flag{
		{"Draft journals", "/app/finance/bookkeeping", countInt64(ctx, pool, `
			select count(*) from public.fin_journal_entries
			where tenant_id = $1 and status = 'draft'`, tenantID)},
		{"Unmatched bank lines", "/app/finance/bookkeeping", countInt64(ctx, pool, `
			select count(*) from public.fin_bank_statement_lines
			where tenant_id = $1 and matched_payment_id is null`, tenantID)},
		{"Credits missing JE", "/app/finance/bookkeeping", countInt64(ctx, pool, `
			select (
			  (select count(*) from public.fin_credit_notes
			   where tenant_id = $1 and deleted_at is null and status = 'open'
			     and journal_entry_id is null and amount_total > 0.0001)
			  +
			  (select count(*) from public.fin_vendor_credits
			   where tenant_id = $1 and deleted_at is null and status = 'open'
			     and journal_entry_id is null and amount_total > 0.0001)
			)`, tenantID)},
	}
	flags = append(flags, bookkeeping...)

	var out []NamedAmount
	for _, f := range flags {
		if f.count <= 0 {
			continue
		}
		out = append(out, NamedAmount{Label: f.label, Count: f.count, Href: f.href})
	}
	return out
}

// CompanyName returns the tenant display name.
func CompanyName(ctx context.Context, pool *pgxpool.Pool, tenantID int64) string {
	var name string
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(company_name), ''), 'BluearmERP')
		from public.tenants where id = $1`, tenantID).Scan(&name)
	return strings.TrimSpace(name)
}
