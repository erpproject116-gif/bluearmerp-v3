package notify

import (
	"context"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inviteemail"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type dailyOpsMetrics struct {
	SalesCompletedToday int64
	PendingSalesOrders  int64
	PendingPurchases    int64
	PendingPRs          int64
	OpenReceivables     int64
	OpenPayables        int64
	ZeroStockItems      int64
	LowStockItems       int64
	ReconGaps           int64
}

func countInt64(ctx context.Context, pool *pgxpool.Pool, q string, args ...any) int64 {
	var n int64
	if err := pool.QueryRow(ctx, q, args...).Scan(&n); err != nil {
		return 0
	}
	return n
}

func collectDailyOpsMetrics(ctx context.Context, pool *pgxpool.Pool, tenantID int64) dailyOpsMetrics {
	m := dailyOpsMetrics{}
	// Sales completed today (UTC day).
	m.SalesCompletedToday = countInt64(ctx, pool, `
		select count(*)::bigint from public.sa_sales
		where tenant_id = $1 and deleted_at is null
		  and progress_status = 'completed'
		  and coalesce(updated_at, created_at) >= date_trunc('day', now() at time zone 'utc')`, tenantID)
	m.PendingSalesOrders = countInt64(ctx, pool, `
		select count(*)::bigint from public.so_sales_orders
		where tenant_id = $1 and deleted_at is null
		  and progress_status in ('unconfirmed', 'e_approval', 'in_progress')`, tenantID)
	m.PendingPurchases = countInt64(ctx, pool, `
		select count(*)::bigint from public.po_purchase_orders
		where tenant_id = $1 and deleted_at is null
		  and status <> 'cancelled'
		  and progress_status is distinct from 'completed'`, tenantID)
	m.PendingPRs = countInt64(ctx, pool, `
		select count(*)::bigint from public.pr_purchase_requests
		where tenant_id = $1 and deleted_at is null
		  and progress_status in ('unconfirmed', 'e_approval', 'in_progress')`, tenantID)
	// Open AR: completed sales with outstanding balance (receipts + credits + retainers).
	m.OpenReceivables = countInt64(ctx, pool, `
		select count(*)::bigint
		from public.sa_sales s
		left join lateral (
		  select (
		    coalesce((
		      select sum(a.applied_amount + coalesce(a.discount_amount, 0))
		      from public.fin_receipt_applications a
		      join public.fin_official_receipts r on r.id = a.official_receipt_id
		      where a.sales_id = s.id and r.deleted_at is null
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_credit_note_applications a
		      join public.fin_credit_notes c on c.id = a.credit_note_id
		      where a.sales_id = s.id and c.deleted_at is null
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_retainer_applications a
		      join public.fin_retainer_invoices ri on ri.id = a.retainer_id
		      where a.sales_id = s.id and ri.deleted_at is null
		    ), 0)
		  )::float8 as received
		) recv on true
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.progress_status = 'completed'
		  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001`, tenantID)
	// Open AP: supplier invoices with outstanding balance.
	m.OpenPayables = countInt64(ctx, pool, `
		select count(*)::bigint
		from public.fin_supplier_invoices si
		left join lateral (
		  select (
		    coalesce((
		      select sum(a.applied_amount + coalesce(a.discount_amount, 0))
		      from public.fin_payment_applications a
		      join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
		      where a.supplier_invoice_id = si.id and pv.deleted_at is null
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_vendor_credit_applications a
		      join public.fin_vendor_credits vc on vc.id = a.vendor_credit_id
		      where a.supplier_invoice_id = si.id and vc.deleted_at is null
		    ), 0)
		  )::float8 as paid
		) paid on true
		where si.tenant_id = $1 and si.deleted_at is null
		  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`, tenantID)
	m.ZeroStockItems = countInt64(ctx, pool, `
		select count(distinct bal.item_id)::bigint
		from public.inv_item_location_balances bal
		where bal.tenant_id = $1 and bal.qty_on_hand <= 0`, tenantID)
	m.LowStockItems = countInt64(ctx, pool, `
		select count(*)::bigint
		from public.inv_item_location_balances bal
		join public.inv_items i on i.id = bal.item_id and i.tenant_id = bal.tenant_id
		where bal.tenant_id = $1
		  and coalesce(bal.reorder_level, i.reorder_level) is not null
		  and bal.qty_on_hand < coalesce(bal.reorder_level, i.reorder_level)`, tenantID)
	m.ReconGaps = countInt64(ctx, pool, `
		select
		  (select count(*) from (
		    select ln.id from public.sa_sales_lines ln
		    join public.sa_sales s on s.id = ln.sales_id
		    join public.inv_items i on i.id = ln.item_id
		    left join (select sales_line_id, count(*)::float8 as serial_cnt from public.inv_serial_unit_sales_lines group by sales_line_id) j on j.sales_line_id = ln.id
		    where s.tenant_id = $1 and s.deleted_at is null and i.track_serial = true and ln.qty > 0 and coalesce(j.serial_cnt, 0) <> ln.qty
		  ) x)
		+ (select count(*) from public.so_sales_order_lines ln
		    join public.so_sales_orders so on so.id = ln.sales_order_id
		    where so.tenant_id = $1 and so.deleted_at is null
		      and so.progress_status in ('in_progress', 'completed')
		      and (ln.delivered_qty - ln.billed_qty) > 0.0001)`, tenantID)
	return m
}

type dailyOpsKPI struct {
	Label string
	Value int64
	Href  string
	Link  string // short CTA label
	Empty string
	Risk  bool
}

type dailyOpsSection struct {
	Title string
	KPIs  []dailyOpsKPI
}

func dailyOpsSections(m dailyOpsMetrics, link func(string) string) []dailyOpsSection {
	return []dailyOpsSection{
		{
			Title: "Today",
			KPIs: []dailyOpsKPI{
				{"Sales completed", m.SalesCompletedToday, link("/app/sales/sales"), "Open sales", "None completed today", false},
			},
		},
		{
			Title: "Open pipeline",
			KPIs: []dailyOpsKPI{
				{"Sales orders", m.PendingSalesOrders, link("/app/sales-order/sales-orders"), "Open sales orders", "No pending sales orders", false},
				{"Purchase orders", m.PendingPurchases, link("/app/purchase-order/purchase-orders"), "Open purchase orders", "No pending purchase orders", false},
				{"Purchase requests", m.PendingPRs, link("/app/purchase-request/purchase-requests"), "Open purchase requests", "No pending purchase requests", false},
			},
		},
		{
			Title: "Cash position",
			KPIs: []dailyOpsKPI{
				{"Open receivables", m.OpenReceivables, link("/app/finance/collections"), "Open collections", "No open receivables", false},
				{"Open payables", m.OpenPayables, link("/app/finance/disbursements"), "Open disbursements", "No open payables", false},
			},
		},
		{
			Title: "Stock & risk",
			KPIs: []dailyOpsKPI{
				{"Zero stock items", m.ZeroStockItems, link("/app/inventory/find-stock"), "Find stock", "No zero-stock items", true},
				{"Below reorder", m.LowStockItems, link("/app/inventory/reports/inventory-status"), "Inventory status", "No below-reorder items", true},
				{"Reconciliation gaps", m.ReconGaps, link("/app/inventory/stock-reconciliation"), "Stock reconciliation", "No reconciliation gaps", true},
			},
		},
	}
}

func formatDailyOps(company string, m dailyOpsMetrics, baseURL string) (subject, htmlBody, textBody string) {
	company = strings.TrimSpace(company)
	if company == "" {
		company = "BluearmERP"
	}
	day := time.Now().UTC().Format("2006-01-02")
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	link := func(path string) string {
		if baseURL == "" {
			return path
		}
		return baseURL + path
	}
	sections := dailyOpsSections(m, link)

	riskHits := m.ZeroStockItems + m.LowStockItems + m.ReconGaps
	activityHits := m.SalesCompletedToday + m.PendingSalesOrders + m.PendingPurchases + m.PendingPRs + m.OpenReceivables + m.OpenPayables + riskHits
	quiet := activityHits == 0
	switch {
	case quiet:
		subject = fmt.Sprintf("%s daily ops — quiet day (%s)", company, day)
	case riskHits > 0:
		subject = fmt.Sprintf("%s daily ops — %d risk signal%s (%s)", company, riskHits, pluralS(int(riskHits)), day)
	default:
		subject = fmt.Sprintf("%s daily ops — %s", company, day)
	}

	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>`)
	b.WriteString(esc(subject))
	b.WriteString(`</title></head>`)
	b.WriteString(`<body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">`)

	// Header — aligned with invite + hourly digest brand
	b.WriteString(`<tr><td style="background-color:#3c50e0;padding:20px 28px;">`)
	b.WriteString(`<p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">BluearmERP</p>`)
	b.WriteString(`</td></tr>`)
	b.WriteString(`<tr><td style="padding:24px 28px 8px;">`)
	b.WriteString(`<div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">Daily ops digest</div>`)
	b.WriteString(`<h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;">`)
	b.WriteString(esc(company))
	b.WriteString(`</h1>`)
	b.WriteString(fmt.Sprintf(`<p style="margin:8px 0 0;font-size:14px;color:#64748b;">UTC day %s</p>`, esc(day)))
	b.WriteString(`</td></tr>`)

	if quiet {
		b.WriteString(`<tr><td style="padding:12px 28px 8px;">`)
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">`)
		b.WriteString(`<tr><td style="padding:16px 18px;">`)
		b.WriteString(`<div style="font-size:15px;font-weight:700;color:#0f172a;">No major movement today</div>`)
		b.WriteString(`<div style="font-size:13px;color:#64748b;margin-top:6px;line-height:1.5;">Sales, pipeline, cash, and stock risk counts are all clear for this UTC day. Open BluearmERP anytime for live detail.</div>`)
		if baseURL != "" {
			b.WriteString(fmt.Sprintf(`<div style="margin-top:12px;"><a href="%s" style="font-size:13px;font-weight:600;color:#3c50e0;text-decoration:none;">Go to dashboard →</a></div>`, esc(link("/app/dashboard"))))
		}
		b.WriteString(`</td></tr></table></td></tr>`)
	}

	for _, sec := range sections {
		b.WriteString(`<tr><td style="padding:16px 28px 4px;">`)
		b.WriteString(`<div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">`)
		b.WriteString(esc(sec.Title))
		b.WriteString(`</div>`)

		for i := 0; i < len(sec.KPIs); i += 2 {
			left := sec.KPIs[i]
			var right *dailyOpsKPI
			if i+1 < len(sec.KPIs) {
				right = &sec.KPIs[i+1]
			}
			b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>`)
			b.WriteString(`<td width="50%" valign="top" style="padding-right:5px;">`)
			writeDailyOpsKPICard(&b, left)
			b.WriteString(`</td><td width="50%" valign="top" style="padding-left:5px;">`)
			if right != nil {
				writeDailyOpsKPICard(&b, *right)
			} else {
				b.WriteString(`&nbsp;`)
			}
			b.WriteString(`</td></tr></table>`)
		}
		b.WriteString(`</td></tr>`)
	}

	b.WriteString(`<tr><td style="padding:12px 28px 24px;font-size:12px;color:#94a3b8;line-height:1.55;">`)
	b.WriteString(`Sent to business owners only. Instant per-sale emails are not sent on the free plan — use this digest and the in-app notification bell.`)
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)

	textParts := []string{subject, "", fmt.Sprintf("Company: %s", company), fmt.Sprintf("UTC day: %s", day), ""}
	if quiet {
		textParts = append(textParts, "No major movement today.", "Sales, pipeline, cash, and stock risk counts are all clear for this UTC day.", "")
	}
	for _, sec := range sections {
		textParts = append(textParts, strings.ToUpper(sec.Title))
		for _, k := range sec.KPIs {
			if k.Value == 0 {
				textParts = append(textParts, fmt.Sprintf("- %s: 0 (%s)", k.Label, k.Empty))
			} else {
				textParts = append(textParts, fmt.Sprintf("- %s: %d", k.Label, k.Value))
			}
			if k.Href != "" {
				textParts = append(textParts, fmt.Sprintf("  %s: %s", k.Link, k.Href))
			}
		}
		textParts = append(textParts, "")
	}
	textParts = append(textParts,
		"Sent to business owners only.",
		"Instant per-sale emails are not sent on the free plan — use this digest and the in-app notification bell.",
		"",
		"— BluearmERP",
	)
	return subject, b.String(), strings.Join(textParts, "\n")
}

func writeDailyOpsKPICard(b *strings.Builder, k dailyOpsKPI) {
	esc := html.EscapeString
	valueColor := "#3c50e0"
	if k.Risk && k.Value > 0 {
		valueColor = "#b45309"
	}
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">`)
	b.WriteString(`<tr><td style="padding:12px 14px;background:#f8fafc;">`)
	b.WriteString(`<div style="font-size:12px;color:#64748b;font-weight:600;">` + esc(k.Label) + `</div>`)
	if k.Value == 0 {
		b.WriteString(`<div style="font-size:22px;font-weight:700;color:#94a3b8;margin-top:6px;line-height:1.2;">0</div>`)
		b.WriteString(`<div style="font-size:12px;color:#94a3b8;margin-top:6px;line-height:1.4;">` + esc(k.Empty) + `</div>`)
	} else {
		b.WriteString(fmt.Sprintf(`<div style="font-size:22px;font-weight:700;color:%s;margin-top:6px;line-height:1.2;">%d</div>`, valueColor, k.Value))
	}
	if k.Href != "" {
		b.WriteString(fmt.Sprintf(`<div style="margin-top:8px;"><a href="%s" style="font-size:12px;font-weight:600;color:#3c50e0;text-decoration:none;">%s →</a></div>`, esc(k.Href), esc(k.Link)))
	}
	b.WriteString(`</td></tr></table>`)
}

// DrainDailyOpsDigests sends one daily ops email per due tenant.
func DrainDailyOpsDigests(ctx context.Context, pool *pgxpool.Pool) (tenants, sent int, details []map[string]any, err error) {
	// Ensure prefs rows exist.
	_, _ = pool.Exec(ctx, `
		insert into public.owner_change_alert_prefs (tenant_id)
		select t.id from public.tenants t
		where t.status = 'active'
		on conflict (tenant_id) do nothing`)

	rows, err := pool.Query(ctx, `
		select p.tenant_id
		from public.owner_change_alert_prefs p
		join public.tenants t on t.id = p.tenant_id
		where t.status = 'active'
		  and coalesce(p.daily_ops_enabled, false)
		  and (
		    p.last_daily_ops_at is null
		    or p.last_daily_ops_at < date_trunc('day', now() at time zone 'utc')
		  )
		order by p.tenant_id
		limit 100`)
	if err != nil {
		return 0, 0, nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var tid int64
		if rows.Scan(&tid) != nil {
			continue
		}
		ids = append(ids, tid)
	}
	if err := rows.Err(); err != nil {
		return 0, 0, nil, err
	}

	base := strings.TrimRight(strings.TrimSpace(os.Getenv("APP_PUBLIC_URL")), "/")
	if base == "" {
		base = strings.TrimRight(inviteemail.AbsoluteSignInURL(), "/signin")
	}

	for _, tid := range ids {
		tenants++
		emails, eErr := BusinessOwnerEmails(ctx, pool, tid)
		if eErr != nil || len(emails) == 0 {
			log.Printf("daily-ops: tenant=%d no recipients (%v)", tid, eErr)
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "reason": "no_recipients"})
			continue
		}
		if !outbox.MailConfigured() {
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "reason": "mail_not_configured"})
			continue
		}
		company := tenantCompanyName(ctx, pool, tid)
		metrics := collectDailyOpsMetrics(ctx, pool, tid)
		subject, htmlBody, textBody := formatDailyOps(company, metrics, base)
		if err := outbox.DeliverHTMLToMany(emails, subject, htmlBody, textBody); err != nil {
			log.Printf("daily-ops: tenant=%d send: %v", tid, err)
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "error": err.Error()})
			continue
		}
		_, _ = pool.Exec(ctx, `
			update public.owner_change_alert_prefs
			set last_daily_ops_at = now(), updated_at = now()
			where tenant_id = $1`, tid)
		sent++
		details = append(details, map[string]any{"tenant_id": tid, "delivered": true, "recipients": emails})
	}
	return tenants, sent, details, nil
}

func dailyOpsDigestJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("CHANGE_ALERT_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(os.Getenv("CRM_JOB_SECRET"))
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Change-alert job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		hdr := strings.TrimSpace(r.Header.Get("X-Change-Alert-Job-Secret"))
		if hdr == "" {
			hdr = strings.TrimSpace(r.Header.Get("X-CRM-Job-Secret"))
		}
		if hdr != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}
		if SkipDailyOpsDigest() {
			response.OK(w, map[string]any{
				"tenants": 0,
				"sent":    0,
				"details": []map[string]any{},
				"skipped": true,
				"reason":  "OPS_EMAIL_SKIP_DAILY_OPS_DIGEST",
			}, "Daily ops digest skipped (env).")
			return
		}
		tenants, sent, details, err := DrainDailyOpsDigests(r.Context(), pool)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Daily ops digest failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"tenants": tenants,
			"sent":    sent,
			"details": details,
		}, "Daily ops digested.")
	}
}
