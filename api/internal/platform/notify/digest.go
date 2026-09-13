package notify

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/comms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// QueueChangeAlert stores an audit-derived event for owner email digests when prefs allow.
func QueueChangeAlert(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, title, body, entityType string, entityID *int64) {
	if pool == nil || tenantID <= 0 {
		return
	}
	var mode string
	var emailEnabled bool
	var prefixes []string
	err := pool.QueryRow(ctx, `
		select digest_mode, email_enabled, coalesce(module_prefixes, '{}')
		from public.owner_change_alert_prefs where tenant_id = $1`, tenantID,
	).Scan(&mode, &emailEnabled, &prefixes)
	if err != nil {
		// Prefs table may not exist yet on older DBs — ignore.
		return
	}
	if !emailEnabled || mode == "off" {
		return
	}
	if len(prefixes) > 0 {
		ok := false
		for _, p := range prefixes {
			p = strings.TrimSpace(p)
			if p != "" && strings.HasPrefix(actionCode, p) {
				ok = true
				break
			}
		}
		if !ok {
			return
		}
	}
	var eid any
	if entityID != nil {
		eid = *entityID
	}
	var actor any
	if actorUserID > 0 {
		actor = actorUserID
	}
	var qid int64
	err = pool.QueryRow(ctx, `
		insert into public.owner_change_alert_queue
		  (tenant_id, action_code, title, body, entity_type, entity_id, actor_user_id)
		values ($1,$2,$3,$4,$5,$6,$7) returning id`,
		tenantID, actionCode, title, body, nullIfEmpty(entityType), eid, actor,
	).Scan(&qid)
	if err != nil {
		return
	}
	if mode == "immediate" {
		_, _, _, _ = sendImmediateDigest(ctx, pool, tenantID, []queueRow{{
			ID: qid, Title: title, Body: body, ActionCode: actionCode, CreatedAt: time.Now().UTC(),
		}})
	}
}

type queueRow struct {
	ID         int64
	Title      string
	Body       string
	ActionCode string
	CreatedAt  time.Time
}

func sendImmediateDigest(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rows []queueRow) (delivered bool, recipients []string, via string, err error) {
	emails, err := digestRecipientEmails(ctx, pool, tenantID)
	if err != nil {
		return false, nil, "", err
	}
	if len(emails) == 0 {
		log.Printf("change-alert: tenant=%d no digest recipient email; leaving queue pending", tenantID)
		return false, nil, "", nil
	}
	company := tenantCompanyName(ctx, pool, tenantID)
	subject, html := formatDigest(company, rows)

	if smtpErr := trySendDigestMail(emails, subject, html); smtpErr == nil {
		via = "resend_or_smtp"
	} else {
		log.Printf("change-alert: tenant=%d Resend/SMTP unavailable (%v); trying Gmail", tenantID, smtpErr)
		if gmailErr := trySendDigestGmail(ctx, pool, tenantID, emails, subject, html); gmailErr != nil {
			log.Printf("change-alert: tenant=%d delivery failed (Resend/SMTP + Gmail): %v; leaving queue pending", tenantID, gmailErr)
			return false, emails, "", nil
		}
		via = "gmail"
	}

	ids := make([]int64, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	_, _ = pool.Exec(ctx, `
		update public.owner_change_alert_queue set digested_at = now()
		where tenant_id = $1 and id = any($2)`, tenantID, ids)
	_, _ = pool.Exec(ctx, `
		update public.owner_change_alert_prefs set last_digest_at = now(), updated_at = now()
		where tenant_id = $1`, tenantID)
	return true, emails, via, nil
}

func trySendDigestMail(emails []string, subject, html string) error {
	if !outbox.MailConfigured() {
		return fmt.Errorf("email not configured")
	}
	return outbox.DeliverHTMLToMany(emails, subject, html, "")
}

func trySendDigestGmail(ctx context.Context, pool *pgxpool.Pool, tenantID int64, emails []string, subject, html string) error {
	senderID, err := digestGmailSenderUserID(ctx, pool, tenantID)
	if err != nil || senderID <= 0 {
		return fmt.Errorf("no active Gmail connection for tenant: %w", err)
	}
	return comms.SendHTMLViaGmail(ctx, pool, tenantID, senderID, emails, subject, html)
}

func digestGmailSenderUserID(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var ownerID int64
	_ = pool.QueryRow(ctx, `
		select coalesce(owner_user_id, 0) from public.tenants where id = $1`, tenantID).Scan(&ownerID)
	if ownerID > 0 {
		var ok int
		err := pool.QueryRow(ctx, `
			select 1 from public.com_gmail_connections
			where tenant_id = $1 and user_id = $2 and status = 'active'`, tenantID, ownerID).Scan(&ok)
		if err == nil {
			return ownerID, nil
		}
	}
	return comms.FirstActiveGmailUserID(ctx, pool, tenantID)
}

// digestRecipientEmails returns CHANGE_ALERT_DIGEST_TO when set; otherwise the tenant owner email.
func digestRecipientEmails(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]string, error) {
	if override := parseDigestToEnv(); len(override) > 0 {
		return override, nil
	}
	return tenantOwnerEmails(ctx, pool, tenantID)
}

func parseDigestToEnv() []string {
	raw := strings.TrimSpace(os.Getenv("CHANGE_ALERT_DIGEST_TO"))
	if raw == "" || strings.EqualFold(raw, "owner") {
		return nil
	}
	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == ';' || r == ' '
	})
	var out []string
	seen := map[string]bool{}
	for _, p := range parts {
		p = strings.ToLower(strings.TrimSpace(p))
		if p == "" || seen[p] || p == "owner" {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

// tenantOwnerEmails returns the tenant owner's email only (not store_admins / platform SAs).
func tenantOwnerEmails(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]string, error) {
	var email string
	err := pool.QueryRow(ctx, `
		select lower(trim(u.email))
		from public.tenants t
		join public.users u on u.id = t.owner_user_id
		where t.id = $1
		  and u.status = 'active'
		  and coalesce(trim(u.email), '') <> ''`, tenantID).Scan(&email)
	if err != nil {
		return nil, err
	}
	email = strings.TrimSpace(email)
	if email == "" {
		return nil, nil
	}
	return []string{email}, nil
}

func tenantCompanyName(ctx context.Context, pool *pgxpool.Pool, tenantID int64) string {
	var name string
	_ = pool.QueryRow(ctx, `
		select coalesce(nullif(trim(company_name), ''), 'BluearmERP')
		from public.tenants where id = $1`, tenantID).Scan(&name)
	if strings.TrimSpace(name) == "" {
		return "BluearmERP"
	}
	return strings.TrimSpace(name)
}

type digestBodyParts struct {
	Summary string
	By      string
	Doc     string
	Changed string
	At      string
}

func parseDigestBody(body string) digestBodyParts {
	p := digestBodyParts{Summary: strings.TrimSpace(body)}
	chunks := strings.Split(body, " · ")
	if len(chunks) == 0 {
		return p
	}
	p.Summary = strings.TrimSpace(chunks[0])
	for _, chunk := range chunks[1:] {
		chunk = strings.TrimSpace(chunk)
		switch {
		case strings.HasPrefix(chunk, "by "):
			p.By = strings.TrimSpace(strings.TrimPrefix(chunk, "by "))
		case strings.HasPrefix(chunk, "doc "):
			p.Doc = strings.TrimSpace(strings.TrimPrefix(chunk, "doc "))
		case strings.HasPrefix(chunk, "changed:"):
			p.Changed = strings.TrimSpace(strings.TrimPrefix(chunk, "changed:"))
		case strings.HasPrefix(chunk, "at "):
			p.At = strings.TrimSpace(strings.TrimPrefix(chunk, "at "))
		default:
			if p.Summary != "" && chunk != "" {
				p.Summary = p.Summary + " · " + chunk
			}
		}
	}
	return p
}

func formatEventWhen(r queueRow, parsedAt string) string {
	if !r.CreatedAt.IsZero() {
		return r.CreatedAt.UTC().Format("Jan 2, 2006 · 15:04 UTC")
	}
	if strings.TrimSpace(parsedAt) != "" {
		return parsedAt
	}
	return "—"
}

func formatDigest(company string, rows []queueRow) (subject, html string) {
	n := len(rows)
	company = strings.TrimSpace(company)
	if company == "" {
		company = "BluearmERP"
	}
	subject = fmt.Sprintf("%s activity digest (%d changes)", company, n)

	var b strings.Builder
	b.WriteString(`<!DOCTYPE html><html lang="en"><body style="margin:0;padding:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;">`)
	b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:32px 16px;"><tr><td align="center">`)
	b.WriteString(`<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">`)

	// Header — brand unified with invites / daily ops (#3c50e0)
	b.WriteString(`<tr><td style="background:#3c50e0;color:#ffffff;padding:20px 28px;">`)
	b.WriteString(`<div style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;opacity:0.85;margin-bottom:6px;">Hourly activity digest</div>`)
	b.WriteString(`<div style="font-size:20px;font-weight:700;line-height:1.3;">`)
	b.WriteString(htmlEscape(company))
	b.WriteString(`</div>`)
	b.WriteString(fmt.Sprintf(`<div style="font-size:13px;opacity:0.9;margin-top:8px;">%d change%s since last digest</div>`, n, pluralS(n)))
	b.WriteString(`</td></tr>`)

	// Cards
	b.WriteString(`<tr><td style="padding:18px 20px 8px;">`)
	for i, r := range rows {
		parts := parseDigestBody(r.Body)
		when := formatEventWhen(r, parts.At)
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;margin:0 0 12px;overflow:hidden;">`)
		b.WriteString(`<tr><td style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">`)
		b.WriteString(`<div style="font-size:12px;color:#64748b;margin-bottom:4px;">`)
		b.WriteString(htmlEscape(when))
		if i+1 <= n {
			b.WriteString(fmt.Sprintf(` · #%d`, i+1))
		}
		b.WriteString(`</div>`)
		b.WriteString(`<div style="font-size:15px;font-weight:700;color:#0f172a;line-height:1.35;">`)
		b.WriteString(htmlEscape(strings.TrimSpace(r.Title)))
		b.WriteString(`</div></td></tr>`)

		b.WriteString(`<tr><td style="padding:10px 14px 12px;">`)
		b.WriteString(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.45;color:#334155;">`)
		writeDigestRow(&b, "What", parts.Summary)
		writeDigestRow(&b, "By", parts.By)
		writeDigestRow(&b, "Document", parts.Doc)
		writeDigestRow(&b, "Changes", parts.Changed)
		if strings.TrimSpace(r.ActionCode) != "" {
			writeDigestRow(&b, "Action", r.ActionCode)
		}
		b.WriteString(`</table></td></tr></table>`)
	}
	b.WriteString(`</td></tr>`)

	// Footer
	b.WriteString(`<tr><td style="padding:8px 24px 22px;font-size:12px;color:#94a3b8;line-height:1.5;">`)
	b.WriteString(`Sent to the tenant owner. To stop these emails, set digest mode to off in change-alert preferences.`)
	b.WriteString(`</td></tr>`)

	b.WriteString(`</table></td></tr></table></body></html>`)
	return subject, b.String()
}

func writeDigestRow(b *strings.Builder, label, value string) {
	value = strings.TrimSpace(value)
	if value == "" {
		return
	}
	b.WriteString(`<tr>`)
	b.WriteString(`<td style="padding:5px 10px 5px 0;width:88px;vertical-align:top;color:#64748b;font-weight:600;white-space:nowrap;">`)
	b.WriteString(htmlEscape(label))
	b.WriteString(`</td>`)
	b.WriteString(`<td style="padding:5px 0;vertical-align:top;color:#1e293b;word-break:break-word;">`)
	b.WriteString(htmlEscape(value))
	b.WriteString(`</td></tr>`)
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

// DrainHourlyDigests sends pending queue rows for tenants due for an hourly digest.
func DrainHourlyDigests(ctx context.Context, pool *pgxpool.Pool) (tenants int, events int, details []map[string]any, err error) {
	rows, err := pool.Query(ctx, `
		select p.tenant_id
		from public.owner_change_alert_prefs p
		where p.email_enabled and p.digest_mode = 'hourly'
		  and exists (
		    select 1 from public.owner_change_alert_queue q
		    where q.tenant_id = p.tenant_id and q.digested_at is null
		  )
		  and (p.last_digest_at is null or p.last_digest_at < now() - interval '55 minutes')`)
	if err != nil {
		return 0, 0, nil, err
	}
	defer rows.Close()
	var tenantIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return tenants, events, details, err
		}
		tenantIDs = append(tenantIDs, id)
	}
	for _, tid := range tenantIDs {
		qrows, qerr := pool.Query(ctx, `
			select id, title, body, action_code, created_at
			from public.owner_change_alert_queue
			where tenant_id = $1 and digested_at is null
			order by created_at
			limit 200`, tid)
		if qerr != nil {
			return tenants, events, details, qerr
		}
		var batch []queueRow
		for qrows.Next() {
			var r queueRow
			if err := qrows.Scan(&r.ID, &r.Title, &r.Body, &r.ActionCode, &r.CreatedAt); err != nil {
				qrows.Close()
				return tenants, events, details, err
			}
			batch = append(batch, r)
		}
		qrows.Close()
		if len(batch) == 0 {
			continue
		}
		ok, recipients, via, sendErr := sendImmediateDigest(ctx, pool, tid, batch)
		if sendErr != nil {
			log.Printf("change-alert digest tenant=%d: %v", tid, sendErr)
			details = append(details, map[string]any{
				"tenant_id": tid, "pending": len(batch), "delivered": false, "error": sendErr.Error(),
			})
			continue
		}
		if !ok {
			details = append(details, map[string]any{
				"tenant_id": tid, "pending": len(batch), "delivered": false,
				"recipients": recipients,
				"error":      "no delivery channel (connect Gmail under Communications → Settings, or configure SMTP)",
			})
			continue
		}
		tenants++
		events += len(batch)
		details = append(details, map[string]any{
			"tenant_id": tid, "events": len(batch), "delivered": true, "via": via, "recipients": recipients,
		})
	}
	return tenants, events, details, nil
}

// RegisterJobRoutes mounts change-alert and daily-ops digest cron endpoints.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/platform/jobs/change-alert-digest", changeAlertDigestJob(pool))
	r.Post("/platform/jobs/daily-ops-digest", dailyOpsDigestJob(pool))
}

func changeAlertDigestJob(pool *pgxpool.Pool) http.HandlerFunc {
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
		if SkipHourlyChangeAlertDigest() {
			response.OK(w, map[string]any{
				"tenants":  0,
				"events":   0,
				"details":  []map[string]any{},
				"skipped":  true,
				"reason":   "OPS_EMAIL_SKIP_HOURLY_DIGEST",
			}, "Digested.")
			return
		}
		tenants, events, details, err := DrainHourlyDigests(r.Context(), pool)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Digest failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"tenants":  tenants,
			"events":   events,
			"details":  details,
		}, "Digested.")
	}
}
