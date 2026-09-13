package notify

import (
	"context"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// businessOwnerEmailsQuery selects tenant owner_user_id and owner / store_owner roles only.
const businessOwnerEmailsQuery = `
		select distinct lower(trim(u.email))
		from public.users u
		left join public.tenants t on t.id = u.tenant_id
		where u.tenant_id = $1
		  and u.status = 'active'
		  and coalesce(trim(u.email), '') <> ''
		  and (
		    u.id = t.owner_user_id
		    or u.tenant_role in ('owner', 'store_owner')
		  )`

// BusinessOwnerEmails returns CHANGE_ALERT_DIGEST_TO override, else business owners only
// (tenant owner_user_id and active owner / store_owner roles — not store_admin).
func BusinessOwnerEmails(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]string, error) {
	if override := parseDigestToEnv(); len(override) > 0 {
		return override, nil
	}
	rows, err := pool.Query(ctx, businessOwnerEmailsQuery, tenantID)
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

func envTruthy(key string) bool {
	v := strings.TrimSpace(os.Getenv(key))
	return v == "1" || strings.EqualFold(v, "true") || strings.EqualFold(v, "yes")
}

// SkipHourlyChangeAlertDigest is true when hourly change-alert cron should no-op (env kill-switch).
func SkipHourlyChangeAlertDigest() bool {
	return envTruthy("OPS_EMAIL_SKIP_HOURLY_DIGEST") || envTruthy("CHANGE_ALERT_SKIP_HOURLY_DIGEST")
}

// SkipDailyOpsDigest is true when daily ops digest cron should no-op (env kill-switch).
func SkipDailyOpsDigest() bool {
	return envTruthy("OPS_EMAIL_SKIP_DAILY_OPS_DIGEST") || envTruthy("CHANGE_ALERT_SKIP_DAILY_OPS")
}
