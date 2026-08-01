package copilot

import (
	"fmt"
	"sync"
	"time"
)

// Per-user Baiko ask/approve rate limits (in-process token buckets).
const (
	copilotAskRPM     = 20
	copilotApproveRPM = 30
)

type rateBucket struct {
	count   int
	resetAt time.Time
}

var (
	copilotRateMu sync.Mutex
	copilotRates  = map[string]*rateBucket{}
)

func allowCopilotRate(tenantID, userID int64, kind string) bool {
	limit := copilotAskRPM
	if kind == "approve" {
		limit = copilotApproveRPM
	}
	key := fmt.Sprintf("%s:%d:%d", kind, tenantID, userID)
	now := time.Now()
	copilotRateMu.Lock()
	defer copilotRateMu.Unlock()
	b, ok := copilotRates[key]
	if !ok || now.After(b.resetAt) {
		copilotRates[key] = &rateBucket{count: 1, resetAt: now.Add(time.Minute)}
		return true
	}
	if b.count >= limit {
		return false
	}
	b.count++
	return true
}
