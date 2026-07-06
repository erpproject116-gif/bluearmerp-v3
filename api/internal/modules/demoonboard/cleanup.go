package demoonboard

import (
	"net/http"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/retention"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// postCleanup deletes expired demo tenants (cascade removes all their data) and
// marks the related signups expired. Guarded by a shared secret so it can be
// driven by an external scheduler (cron / GitHub Action / Supabase scheduled fn).
func (s *service) postCleanup(w http.ResponseWriter, r *http.Request) {
	secret := strings.TrimSpace(s.cfg.DemoJobSecret)
	if secret == "" {
		response.Err(w, http.StatusServiceUnavailable, "Demo job secret not configured.", "ERR_UNAVAILABLE")
		return
	}
	if strings.TrimSpace(r.Header.Get("X-Demo-Job-Secret")) != secret {
		response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
		return
	}

	ctx := r.Context()

	rows, err := s.pool.Query(ctx, `
		select id from public.tenants
		where is_demo = true and demo_expires_at is not null and demo_expires_at < now()`)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to scan expired demos.", "ERR_INTERNAL")
		return
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			response.Err(w, http.StatusInternalServerError, "Failed to read expired demos.", "ERR_INTERNAL")
			return
		}
		ids = append(ids, id)
	}
	rows.Close()

	if len(ids) == 0 {
		response.OK(w, map[string]any{"deleted": 0}, "No expired demos.")
		return
	}

	// Mark signups + platform subscriptions expired before the cascade nulls their tenant_id.
	retention.MarkDemoSubscriptionsExpired(ctx, s.pool, ids)

	_, _ = s.pool.Exec(ctx, `
		update public.demo_signups
		set status = 'expired', updated_at = now()
		where tenant_id = any($1) and status <> 'expired'`, ids)

	tag, err := s.pool.Exec(ctx, `delete from public.tenants where id = any($1)`, ids)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to delete expired demos.", "ERR_INTERNAL")
		return
	}

	response.OK(w, map[string]any{"deleted": tag.RowsAffected()}, "Expired demos removed.")
}
