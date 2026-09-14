package supportaccess

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// CheckResult describes support-session rails for the current request.
type CheckResult struct {
	Expired     bool
	ReadOnly    bool
	Destructive bool
	Session     *Session
}

// Check loads the open support session (if any), auto-ends expired sessions,
// and reports read-only / destructive blocks. Call InvalidateUser after Expired.
func Check(ctx context.Context, pool *pgxpool.Pool, supportSessionID int64, authUserID, method, path string) CheckResult {
	var out CheckResult
	if supportSessionID <= 0 && authUserID == "" {
		return out
	}

	var sess *Session
	var err error
	if supportSessionID > 0 {
		sess, err = GetByID(ctx, pool, supportSessionID)
		if err != nil || sess == nil || sess.EndedAt != nil {
			// Stale marker on user row — try open session by auth.
			sess, err = OpenSessionForAuth(ctx, pool, authUserID)
		}
	} else {
		sess, err = OpenSessionForAuth(ctx, pool, authUserID)
	}
	if err != nil || sess == nil {
		return out
	}
	out.Session = sess

	now := time.Now()
	if IsExpired(sess, now) {
		_ = EndSession(ctx, pool, sess.ID, EndedByExpire)
		out.Expired = true
		return out
	}

	if IsDestructiveRequest(method, path) {
		out.Destructive = true
		return out
	}
	if !MutationAllowed(method, path, sess.AccessMode) {
		out.ReadOnly = true
		return out
	}
	return out
}
