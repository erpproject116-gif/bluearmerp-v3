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

// opsAdminEmails returns CHANGE_ALERT_DIGEST_TO override, else owner + active store_admins.
func opsAdminEmails(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]string, error) {
	if override := parseDigestToEnv(); len(override) > 0 {
		return override, nil
	}
	rows, err := pool.Query(ctx, `
		select distinct lower(trim(u.email))
		from public.users u
		left join public.tenants t on t.id = u.tenant_id
		where u.tenant_id = $1
		  and u.status = 'active'
		  and coalesce(trim(u.email), '') <> ''
		  and (
		    u.tenant_role = 'store_admin'
		    or u.id = t.owner_user_id
		  )`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	seen := map[string]bool{}
	for rows.Next() {
		var e string
		if rows.Scan(&e) != nil {
			continue
		}
		e = strings.TrimSpace(e)
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		out = append(out, e)
	}
	return out, rows.Err()
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

func formatDailyOps(company string, m dailyOpsMetrics, baseURL string) (subject, htmlBody, textBody string) {
	company = strings.TrimSpace(company)
	if company == "" {
		company = "BluearmERP"
	}
	day := time.Now().UTC().Format("2006-01-02")
	subject = fmt.Sprintf("%s daily ops — %s", company, day)
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	link := func(path string) string {
		if baseURL == "" {
			return path
		}
		return baseURL + path
	}

	type row struct {
		Label string
		Value int64
		Href  string
		Empty string
	}
	rows := []row{
		{"Sales completed today", m.SalesCompletedToday, link("/app/sales/sales"), "No completed sales today"},
		{"Pending sales orders", m.PendingSalesOrders, link("/app/selling/sales-orders"), "No pending sales orders"},
		{"Pending purchase orders", m.PendingPurchases, link("/app/buying/purchase-orders"), "No pending purchase orders"},
		{"Pending purchase requests", m.PendingPRs, link("/app/buying/purchase-requests"), "No pending purchase requests"},
		{"Open receivables (docs)", m.OpenReceivables, link("/app/finance/collections"), "No open receivables counted"},
		{"Open payables (docs)", m.OpenPayables, link("/app/finance/disbursements"), "No open payables counted"},
		{"Zero stock items", m.ZeroStockItems, link("/app/inventory/stocks"), "No zero-stock items"},
		{"Below reorder items", m.LowStockItems, link("/app/inventory/stocks"), "No below-reorder items"},
		{"Reconciliation gaps", m.ReconGaps, link("/app/dashboard"), "No reconciliation gaps counted"},
	}

	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px;"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">`)
	b.WriteString(`<tr><td style="background:#3c50e0;color:#ffffff;padding:20px 24px;">`)
	b.WriteString(`<div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.85;margin-bottom:6px;">Daily ops digest</div>`)
	b.WriteString(`<div style="font-size:20px;font-weight:700;">`)
	b.WriteString(html.EscapeString(company))
	b.WriteString(`</div>`)
	b.WriteString(fmt.Sprintf(`<div style="font-size:13px;opacity:0.9;margin-top:6px;">UTC day %s</div>`, html.EscapeString(day)))
	b.WriteString(`</td></tr><tr><td style="padding:18px 24px;">`)

	var textParts []string
	textParts = append(textParts, fmt.Sprintf("%s daily ops — %s\n", company, day))
	for _, r := range rows {
		label := html.EscapeString(r.Label)
		if r.Value == 0 {
			b.WriteString(`<div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">`)
			b.WriteString(`<div style="font-size:13px;font-weight:600;color:#0f172a;">` + label + `</div>`)
			b.WriteString(`<div style="font-size:13px;color:#64748b;margin-top:4px;">` + html.EscapeString(r.Empty) + `</div></div>`)
			textParts = append(textParts, fmt.Sprintf("%s: 0 (%s)", r.Label, r.Empty))
			continue
		}
		b.WriteString(`<div style="padding:10px 0;border-bottom:1px solid #e2e8f0;">`)
		b.WriteString(`<div style="font-size:13px;font-weight:600;color:#0f172a;">` + label + `</div>`)
		b.WriteString(fmt.Sprintf(`<div style="font-size:22px;font-weight:700;color:#3c50e0;margin-top:4px;">%d</div>`, r.Value))
		if r.Href != "" {
			b.WriteString(fmt.Sprintf(`<div style="margin-top:6px;"><a href="%s" style="font-size:13px;color:#3c50e0;">Open in BluearmERP</a></div>`, html.EscapeString(r.Href)))
		}
		b.WriteString(`</div>`)
		textParts = append(textParts, fmt.Sprintf("%s: %d", r.Label, r.Value))
	}

	b.WriteString(`</td></tr><tr><td style="padding:12px 24px 22px;font-size:12px;color:#94a3b8;line-height:1.5;">`)
	b.WriteString(`Sent to the tenant owner and store admins. Instant per-sale emails are not sent on the free plan — use this digest and the in-app notification bell.`)
	b.WriteString(`</td></tr></table></td></tr></table></body></html>`)

	return subject, b.String(), strings.Join(textParts, "\n")
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
		  and coalesce(p.daily_ops_enabled, true)
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
		emails, eErr := opsAdminEmails(ctx, pool, tid)
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
