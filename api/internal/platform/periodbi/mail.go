package periodbi

import (
	"context"
	"fmt"
	"html"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/inviteemail"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/notify"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func formatMoney(n float64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%.2f", n)
	parts := strings.Split(s, ".")
	intPart := parts[0]
	var b strings.Builder
	for i, c := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(c)
	}
	out := "₱" + b.String() + "." + parts[1]
	if neg {
		return "-" + out
	}
	return out
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func Format(company string, rep Report, baseURL string) (subject, htmlBody, textBody string) {
	company = strings.TrimSpace(company)
	if company == "" {
		company = "BluearmERP"
	}
	baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
	link := func(path string) string {
		if baseURL == "" {
			return path
		}
		return baseURL + path
	}
	kindLabel := "Weekly"
	if rep.Period == "monthly" {
		kindLabel = "Monthly"
	}
	subject = fmt.Sprintf("%s %s BI — %s", company, strings.ToLower(kindLabel), rep.WindowLabel)
	if rep.RedFlagTotal > 0 {
		subject = fmt.Sprintf("%s %s BI — %d risk signal%s · %s", company, strings.ToLower(kindLabel), rep.RedFlagTotal, pluralS(int(rep.RedFlagTotal)), rep.WindowLabel)
	}

	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>`)
	b.WriteString(esc(subject))
	b.WriteString(`</title></head><body style="margin:0;padding:0;background-color:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6fb;padding:32px 16px;"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">`)
	b.WriteString(`<tr><td style="background-color:#3c50e0;padding:20px 28px;"><p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">BluearmERP</p></td></tr>`)
	b.WriteString(`<tr><td style="padding:24px 28px 8px;">`)
	b.WriteString(fmt.Sprintf(`<div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:6px;">%s business intelligence</div>`, esc(kindLabel)))
	b.WriteString(`<h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;">` + esc(company) + `</h1>`)
	b.WriteString(fmt.Sprintf(`<p style="margin:8px 0 0;font-size:14px;color:#64748b;">%s · as of %s</p>`, esc(rep.WindowLabel), esc(rep.AsOf)))
	if baseURL != "" {
		b.WriteString(fmt.Sprintf(`<p style="margin:12px 0 0;"><a href="%s" style="font-size:13px;font-weight:600;color:#3c50e0;text-decoration:none;">Open period summary in app →</a></p>`, esc(link("/app/dashboard/period-summary?period="+rep.Period))))
	}
	b.WriteString(`</td></tr>`)

	writeCard := func(label, value, href, hrefLabel string, risk bool) {
		color := "#3c50e0"
		if risk {
			color = "#b45309"
		}
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 10px;overflow:hidden;"><tr><td style="padding:12px 14px;background:#f8fafc;">`)
		b.WriteString(`<div style="font-size:12px;color:#64748b;font-weight:600;">` + esc(label) + `</div>`)
		b.WriteString(fmt.Sprintf(`<div style="font-size:20px;font-weight:700;color:%s;margin-top:6px;">%s</div>`, color, esc(value)))
		if href != "" {
			b.WriteString(fmt.Sprintf(`<div style="margin-top:8px;"><a href="%s" style="font-size:12px;font-weight:600;color:#3c50e0;text-decoration:none;">%s →</a></div>`, esc(link(href)), esc(hrefLabel)))
		}
		b.WriteString(`</td></tr></table>`)
	}
	openSec := func(title string) {
		b.WriteString(`<tr><td style="padding:16px 28px 4px;"><div style="font-size:12px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#64748b;margin-bottom:10px;">` + esc(title) + `</div>`)
	}
	closeSec := func() { b.WriteString(`</td></tr>`) }

	var text []string
	text = append(text, subject, "", "Company: "+company, "Window: "+rep.WindowLabel, "As of: "+rep.AsOf, "")

	openSec("Sales & cash")
	writeCard("Sales in window", formatMoney(rep.SalesInWindow), "/app/sales/sales", "Open sales", false)
	writeCard("Sales MTD", formatMoney(rep.SalesMTD), "/app/sales/sales", "Open sales", false)
	if rep.Period == "monthly" {
		writeCard("Sales YTD", formatMoney(rep.SalesYTD), "/app/sales/sales", "Open sales", false)
		writeCard("Cash net YTD", formatMoney(rep.CashNetYTD), "/app/finance/collections", "Collections", false)
	} else {
		writeCard("Cash net MTD", formatMoney(rep.CashNetMTD), "/app/finance/collections", "Collections", false)
	}
	writeCard("Cash in / out MTD", formatMoney(rep.CashInflowMTD)+" / "+formatMoney(rep.CashOutflowMTD), "/app/finance/disbursements", "Disbursements", false)
	closeSec()
	text = append(text, "SALES & CASH",
		fmt.Sprintf("- Sales in window: %s", formatMoney(rep.SalesInWindow)),
		fmt.Sprintf("- Sales MTD: %s", formatMoney(rep.SalesMTD)),
		fmt.Sprintf("- Cash net MTD: %s", formatMoney(rep.CashNetMTD)), "")

	openSec("Working capital")
	writeCard("AR total / overdue", formatMoney(rep.ARTotal)+" / "+formatMoney(rep.AROverdue), "/app/finance/collections", "Collections", rep.AROverdue > 0)
	writeCard("AP total / overdue", formatMoney(rep.APTotal)+" / "+formatMoney(rep.APOverdue), "/app/finance/disbursements", "Disbursements", rep.APOverdue > 0)
	writeCard("Overdue AR docs", fmt.Sprintf("%d", rep.OverdueARCount), "/app/finance/receivables", "Receivables", rep.OverdueARCount > 0)
	closeSec()

	if rep.Period == "monthly" && rep.HasJournalPnL {
		openSec("Profit & loss (posted journals)")
		writeCard("Income", formatMoney(rep.PnLIncome), "/app/finance/acct-i/reports/profit-and-loss", "Open P&L", false)
		writeCard("Expense", formatMoney(rep.PnLExpense), "/app/finance/acct-i/reports/profit-and-loss", "Open P&L", false)
		writeCard("Net", formatMoney(rep.PnLNet), "/app/finance/acct-i/reports/profit-and-loss", "Open P&L", rep.PnLNet < 0)
		closeSec()
	}

	openSec("Pipeline & stock")
	writeCard("Pending SO / PO / PR", fmt.Sprintf("%d / %d / %d", rep.PendingSO, rep.PendingPO, rep.PendingPR), "/app/sales-order/sales-orders", "Sales orders", false)
	writeCard("Quotes expiring (7d)", fmt.Sprintf("%d", rep.QuotesExpiring7d), "/app/quotation/quotations", "Quotations", rep.QuotesExpiring7d > 0)
	writeCard("Low / zero stock", fmt.Sprintf("%d / %d", rep.LowStockCount, rep.ZeroStockCount), "/app/inventory/find-stock", "Find stock", rep.LowStockCount+rep.ZeroStockCount > 0)
	if rep.RecurringBurnMonthly > 0 {
		writeCard("Recurring burn / mo", formatMoney(rep.RecurringBurnMonthly), "/app/purchases/recurring-expenses", "Recurring expenses", false)
	}
	closeSec()

	if len(rep.TopCustomers) > 0 {
		openSec("Top customers")
		for _, c := range rep.TopCustomers {
			writeCard(c.Label, formatMoney(c.Amount), "/app/sales/sales", "Sales", false)
		}
		closeSec()
	}
	if len(rep.TopItems) > 0 {
		openSec("Top items (qty)")
		for _, c := range rep.TopItems {
			writeCard(c.Label, fmt.Sprintf("%.0f", c.Amount), "/app/sales/sales", "Sales", false)
		}
		closeSec()
	}
	if len(rep.ProfitProducts) > 0 && rep.Period == "monthly" {
		openSec("Margin by product (90d)")
		for _, c := range rep.ProfitProducts {
			writeCard(c.Label, formatMoney(c.Amount), "/app/dashboard", "Dashboard", false)
		}
		closeSec()
	}
	openSec("Risk signals")
	if len(rep.RedFlags) == 0 {
		writeCard("Status", "No major risk signals", "/app/dashboard", "Dashboard", false)
	} else {
		for _, f := range rep.RedFlags {
			href := f.Href
			if href == "" {
				href = "/app/dashboard"
			}
			writeCard(f.Label, fmt.Sprintf("%d", f.Count), href, "Review", true)
		}
	}
	closeSec()

	b.WriteString(`<tr><td style="padding:12px 28px 24px;font-size:12px;color:#94a3b8;line-height:1.55;">Sent to business owners only. One email per period — not per transaction.</td></tr>`)
	b.WriteString(`</table></td></tr></table></body></html>`)
	text = append(text, "Sent to business owners only.", "", "— BluearmERP")
	return subject, b.String(), strings.Join(text, "\n")
}

// Drain sends weekly or monthly BI emails for due tenants.
func Drain(ctx context.Context, pool *pgxpool.Pool, kind Kind) (tenants, sent int, details []map[string]any, err error) {
	_, _ = pool.Exec(ctx, `
		insert into public.owner_change_alert_prefs (tenant_id)
		select t.id from public.tenants t where t.status = 'active'
		on conflict (tenant_id) do nothing`)

	enabledCol, lastCol, trunc := "weekly_bi_enabled", "last_weekly_bi_at", "week"
	if kind == Monthly {
		enabledCol, lastCol, trunc = "monthly_bi_enabled", "last_monthly_bi_at", "month"
	}
	q := fmt.Sprintf(`
		select p.tenant_id
		from public.owner_change_alert_prefs p
		join public.tenants t on t.id = p.tenant_id
		where t.status = 'active' and coalesce(p.%s, false)
		  and (p.%s is null or p.%s < date_trunc('%s', now() at time zone 'utc'))
		order by p.tenant_id limit 100`, enabledCol, lastCol, lastCol, trunc)
	rows, err := pool.Query(ctx, q)
	if err != nil {
		return 0, 0, nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var tid int64
		if rows.Scan(&tid) == nil {
			ids = append(ids, tid)
		}
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
		emails, eErr := notify.BusinessOwnerEmails(ctx, pool, tid)
		if eErr != nil || len(emails) == 0 {
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "reason": "no_recipients"})
			continue
		}
		if !outbox.MailConfigured() {
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "reason": "mail_not_configured"})
			continue
		}
		company := CompanyName(ctx, pool, tid)
		rep := Load(ctx, pool, tid, kind)
		rep.CompanyName = company
		subject, htmlBody, textBody := Format(company, rep, base)
		if err := outbox.DeliverHTMLToMany(emails, subject, htmlBody, textBody); err != nil {
			log.Printf("periodbi %s: tenant=%d: %v", kind, tid, err)
			details = append(details, map[string]any{"tenant_id": tid, "delivered": false, "error": err.Error()})
			continue
		}
		_, _ = pool.Exec(ctx, fmt.Sprintf(`
			update public.owner_change_alert_prefs set %s = now(), updated_at = now() where tenant_id = $1`, lastCol), tid)
		sent++
		details = append(details, map[string]any{"tenant_id": tid, "delivered": true, "recipients": emails, "period": string(kind)})
	}
	return tenants, sent, details, nil
}

func job(pool *pgxpool.Pool, kind Kind) http.HandlerFunc {
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
		tenants, sent, details, err := Drain(r.Context(), pool, kind)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Period BI digest failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"period": string(kind), "tenants": tenants, "sent": sent, "details": details,
			"ran_at": time.Now().UTC().Format(time.RFC3339),
		}, "Period BI digested.")
	}
}

// RegisterJobRoutes mounts weekly/monthly BI digest cron endpoints.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/platform/jobs/weekly-bi-digest", job(pool, Weekly))
	r.Post("/platform/jobs/monthly-bi-digest", job(pool, Monthly))
}
