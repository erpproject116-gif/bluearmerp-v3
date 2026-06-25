package audit

import (
	"context"
	"sync/atomic"
)

type loggedKeyType struct{}

var loggedKey loggedKeyType

// WithRequestFlag attaches a per-request flag handlers use to skip duplicate HTTP fallback logs.
func WithRequestFlag(ctx context.Context) context.Context {
	return context.WithValue(ctx, loggedKey, &atomic.Bool{})
}

func markLogged(ctx context.Context) {
	if v, ok := ctx.Value(loggedKey).(*atomic.Bool); ok && v != nil {
		v.Store(true)
	}
}

func wasLogged(ctx context.Context) bool {
	if v, ok := ctx.Value(loggedKey).(*atomic.Bool); ok && v != nil {
		return v.Load()
	}
	return false
}
