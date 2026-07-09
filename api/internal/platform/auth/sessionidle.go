package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const UserActivityHeader = "X-User-Activity"

// ErrSessionIdle is returned when the user has been inactive longer than the idle timeout.
var ErrSessionIdle = errors.New("session idle")

func sessionIdleTimeout() time.Duration {
	if v := strings.TrimSpace(os.Getenv("SESSION_IDLE_MINUTES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Minute
		}
	}
	return 20 * time.Minute
}

func isSessionIdleExemptPath(path string) bool {
	if path == "/api/v1/auth/session-ended" {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/presence/") {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/pos/") {
		return true
	}
	return false
}

func shouldBumpSessionActivity(r *http.Request) bool {
	if isSessionIdleExemptPath(r.URL.Path) {
		return false
	}
	return strings.TrimSpace(r.Header.Get(UserActivityHeader)) == "1"
}

func enforceSessionActivity(ctx context.Context, pool *pgxpool.Pool, authUserID string, bump bool) error {
	timeout := sessionIdleTimeout()

	var lastActivity time.Time
	err := pool.QueryRow(ctx, `
		select last_activity_at
		from public.auth_session_activity
		where auth_user_id = $1::uuid`,
		authUserID,
	).Scan(&lastActivity)

	if err == pgx.ErrNoRows {
		if bump {
			_, _ = pool.Exec(ctx, `
				insert into public.auth_session_activity (auth_user_id, last_activity_at)
				values ($1::uuid, now())
				on conflict (auth_user_id) do update set last_activity_at = now()`,
				authUserID,
			)
		}
		return nil
	}
	if err != nil {
		return err
	}

	if time.Since(lastActivity) > timeout {
		if bump {
			_, err = pool.Exec(ctx, `
				insert into public.auth_session_activity (auth_user_id, last_activity_at)
				values ($1::uuid, now())
				on conflict (auth_user_id) do update set last_activity_at = now()`,
				authUserID,
			)
			return err
		}
		return ErrSessionIdle
	}

	if bump {
		_, err = pool.Exec(ctx, `
			update public.auth_session_activity
			set last_activity_at = now()
			where auth_user_id = $1::uuid`,
			authUserID,
		)
		return err
	}
	return nil
}

// ClearSessionActivity removes idle tracking on sign-out (optional hygiene).
func ClearSessionActivity(ctx context.Context, pool *pgxpool.Pool, authUserID string) {
	_, _ = pool.Exec(ctx, `delete from public.auth_session_activity where auth_user_id = $1::uuid`, authUserID)
}
