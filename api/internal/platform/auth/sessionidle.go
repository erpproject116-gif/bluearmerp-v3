package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const UserActivityHeader = "X-User-Activity"

// ErrSessionIdle is returned when the user has been inactive longer than the idle timeout.
var ErrSessionIdle = errors.New("session idle")

// activityNow is overridden in tests so cache expiry does not need a real sleep.
var activityNow = time.Now

func sessionIdleTimeout() time.Duration {
	if v := strings.TrimSpace(os.Getenv("SESSION_IDLE_MINUTES")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Minute
		}
	}
	return 20 * time.Minute
}

// activityWriteInterval is the minimum age of last_activity_at before an
// interactive request re-stamps it. Without it every foreground call issues an
// UPDATE. Derived from the row we already SELECT, so it stays correct across
// API instances. 0 disables the throttle (write on every bump).
func activityWriteInterval() time.Duration {
	secs := 30
	if v := strings.TrimSpace(os.Getenv("SESSION_ACTIVITY_WRITE_SECONDS")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			secs = n
		}
	}
	return time.Duration(secs) * time.Second
}

// activityReadCacheTTL is the process-local lifetime of a not-idle stamp.
// SESSION_ACTIVITY_READ_CACHE_SECONDS=0 disables it. Idle denials are never stored.
func activityReadCacheTTL() time.Duration {
	secs := 10
	if v := strings.TrimSpace(os.Getenv("SESSION_ACTIVITY_READ_CACHE_SECONDS")); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n <= 0 {
			return 0
		}
		secs = n
	}
	return time.Duration(secs) * time.Second
}

// shouldStampActivity reports whether an interactive request should re-write
// last_activity_at given how recently it was stamped.
func shouldStampActivity(lastActivity, now time.Time) bool {
	interval := activityWriteInterval()
	if interval <= 0 {
		return true
	}
	return now.Sub(lastActivity) >= interval
}

func isSessionIdleExemptPath(path string) bool {
	if path == "/api/v1/auth/session-ended" {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/presence/") {
		return true
	}
	if strings.HasPrefix(path, "/api/v1/usage/") {
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

// activityStore is the last_activity_at read/write path. Tests substitute a fake.
type activityStore interface {
	loadActivity(ctx context.Context, authUserID string) (time.Time, bool, error)
	touchActivity(ctx context.Context, authUserID string) error
}

type poolActivityStore struct {
	pool *pgxpool.Pool
}

func (s poolActivityStore) loadActivity(ctx context.Context, authUserID string) (time.Time, bool, error) {
	var lastActivity time.Time
	err := s.pool.QueryRow(ctx, `
		select last_activity_at
		from public.auth_session_activity
		where auth_user_id = $1::uuid`,
		authUserID,
	).Scan(&lastActivity)
	if err == pgx.ErrNoRows {
		return time.Time{}, false, nil
	}
	if err != nil {
		return time.Time{}, false, err
	}
	return lastActivity, true, nil
}

func (s poolActivityStore) touchActivity(ctx context.Context, authUserID string) error {
	_, err := s.pool.Exec(ctx, `
		insert into public.auth_session_activity (auth_user_id, last_activity_at)
		values ($1::uuid, now())
		on conflict (auth_user_id) do update set last_activity_at = now()`,
		authUserID,
	)
	return err
}

type activityCacheEntry struct {
	lastActivity time.Time
	expiresAt    time.Time
}

var (
	activityCacheMu sync.RWMutex
	activityCache   = map[string]activityCacheEntry{}
)

func activityCacheGet(authUserID string, now time.Time) (time.Time, bool) {
	if activityReadCacheTTL() <= 0 {
		return time.Time{}, false
	}
	activityCacheMu.RLock()
	e, ok := activityCache[authUserID]
	activityCacheMu.RUnlock()
	if !ok || now.After(e.expiresAt) {
		if ok {
			activityCacheMu.Lock()
			delete(activityCache, authUserID)
			activityCacheMu.Unlock()
		}
		return time.Time{}, false
	}
	timeout := sessionIdleTimeout()
	remaining := timeout - now.Sub(e.lastActivity)
	near := activityWriteInterval()
	if near <= 0 {
		near = time.Second
	}
	// Too close to the idle deadline to trust a cached stamp.
	if remaining <= near {
		return time.Time{}, false
	}
	return e.lastActivity, true
}

func activityCacheSet(authUserID string, lastActivity, now time.Time) {
	ttl := activityReadCacheTTL()
	if ttl <= 0 {
		return
	}
	activityCacheMu.Lock()
	activityCache[authUserID] = activityCacheEntry{lastActivity: lastActivity, expiresAt: now.Add(ttl)}
	activityCacheMu.Unlock()
}

func activityCacheDelete(authUserID string) {
	activityCacheMu.Lock()
	delete(activityCache, authUserID)
	activityCacheMu.Unlock()
}

func resetActivityCache() {
	activityCacheMu.Lock()
	activityCache = map[string]activityCacheEntry{}
	activityCacheMu.Unlock()
}

func enforceSessionActivity(ctx context.Context, pool *pgxpool.Pool, authUserID string, bump bool) error {
	return enforceSessionActivityStore(ctx, poolActivityStore{pool: pool}, authUserID, bump)
}

func enforceSessionActivityStore(ctx context.Context, store activityStore, authUserID string, bump bool) error {
	now := activityNow()
	timeout := sessionIdleTimeout()

	if cached, ok := activityCacheGet(authUserID, now); ok {
		return applyActivityStamp(ctx, store, authUserID, cached, true, bump, now, timeout)
	}

	lastActivity, found, err := store.loadActivity(ctx, authUserID)
	if err != nil {
		return err
	}
	if !found {
		if bump {
			if err := store.touchActivity(ctx, authUserID); err != nil {
				return err
			}
			activityCacheSet(authUserID, now, now)
		}
		return nil
	}
	return applyActivityStamp(ctx, store, authUserID, lastActivity, false, bump, now, timeout)
}

func applyActivityStamp(ctx context.Context, store activityStore, authUserID string, lastActivity time.Time, fromCache, bump bool, now time.Time, timeout time.Duration) error {
	if now.Sub(lastActivity) > timeout {
		if bump {
			if err := store.touchActivity(ctx, authUserID); err != nil {
				return err
			}
			activityCacheSet(authUserID, now, now)
			return nil
		}
		return ErrSessionIdle
	}

	if !fromCache {
		activityCacheSet(authUserID, lastActivity, now)
	}

	if !bump {
		return nil
	}
	if !shouldStampActivity(lastActivity, now) {
		return nil
	}
	if err := store.touchActivity(ctx, authUserID); err != nil {
		return err
	}
	activityCacheSet(authUserID, now, now)
	return nil
}

// ClearSessionActivity removes idle tracking on sign-out (optional hygiene).
func ClearSessionActivity(ctx context.Context, pool *pgxpool.Pool, authUserID string) {
	activityCacheDelete(authUserID)
	_, _ = pool.Exec(ctx, `delete from public.auth_session_activity where auth_user_id = $1::uuid`, authUserID)
}
