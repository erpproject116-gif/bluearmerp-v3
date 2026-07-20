package notify

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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
		_ = sendImmediateDigest(ctx, pool, tenantID, []queueRow{{
			ID: qid, Title: title, Body: body, ActionCode: actionCode,
		}})
	}
}

type queueRow struct {
	ID         int64
	Title      string
	Body       string
	ActionCode string
}

func sendImmediateDigest(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rows []queueRow) error {
	emails, err := tenantOwnerEmails(ctx, pool, tenantID)
	if err != nil {
		return err
	}
	if len(emails) == 0 {
		log.Printf("change-alert: tenant=%d no owner email; leaving queue pending", tenantID)
		return nil
	}
	subject, html := formatDigest(rows)
	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("change-alert: tenant=%d SMTP not configured; leaving queue pending (use Gmail OAuth on free Render or paid SMTP)", tenantID)
		return nil
	}
	if err := outbox.SendEmailMIME(cfg, emails, nil, subject, html, nil); err != nil {
		return err
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
	return nil
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

func formatDigest(rows []queueRow) (subject, html string) {
	subject = fmt.Sprintf("BluearmERP owner activity digest (%d changes)", len(rows))
	var b strings.Builder
	b.WriteString("<html><body><h2>Transaction trail (hourly)</h2><ul>")
	for _, r := range rows {
		b.WriteString("<li><strong>")
		b.WriteString(htmlEscape(r.Title))
		b.WriteString("</strong> — ")
		b.WriteString(htmlEscape(r.Body))
		b.WriteString(" <code>")
		b.WriteString(htmlEscape(r.ActionCode))
		b.WriteString("</code></li>")
	}
	b.WriteString("</ul><p>Sent to the tenant owner only. Turn digests off under change-alert preferences, or set digest_mode to off.</p>")
	b.WriteString("<p><em>Delivery requires SMTP (paid Render) or document email via Gmail OAuth on free Render.</em></p></body></html>")
	return subject, b.String()
}

func htmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

// DrainHourlyDigests sends pending queue rows for tenants due for an hourly digest.
func DrainHourlyDigests(ctx context.Context, pool *pgxpool.Pool) (tenants int, events int, err error) {
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
		return 0, 0, err
	}
	defer rows.Close()
	var tenantIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return tenants, events, err
		}
		tenantIDs = append(tenantIDs, id)
	}
	for _, tid := range tenantIDs {
		qrows, qerr := pool.Query(ctx, `
			select id, title, body, action_code
			from public.owner_change_alert_queue
			where tenant_id = $1 and digested_at is null
			order by created_at
			limit 200`, tid)
		if qerr != nil {
			return tenants, events, qerr
		}
		var batch []queueRow
		for qrows.Next() {
			var r queueRow
			if err := qrows.Scan(&r.ID, &r.Title, &r.Body, &r.ActionCode); err != nil {
				qrows.Close()
				return tenants, events, err
			}
			batch = append(batch, r)
		}
		qrows.Close()
		if len(batch) == 0 {
			continue
		}
		if err := sendImmediateDigest(ctx, pool, tid, batch); err != nil {
			log.Printf("change-alert digest tenant=%d: %v", tid, err)
			continue
		}
		tenants++
		events += len(batch)
	}
	return tenants, events, nil
}

// RegisterJobRoutes mounts the change-alert digest cron endpoint.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/platform/jobs/change-alert-digest", changeAlertDigestJob(pool))
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
		tenants, events, err := DrainHourlyDigests(r.Context(), pool)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Digest failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"tenants": tenants, "events": events}, "Digested.")
	}
}
