package setupreadiness

import "testing"

func TestReadyCacheInvalidate(t *testing.T) {
	if !readyCache.Enabled() {
		t.Skip("setup readiness cache disabled in this environment")
	}
	t.Cleanup(ResetCache)
	ResetCache()

	readyCache.Set("4", true)
	if ready, ok := readyCache.Get("4"); !ok || !ready {
		t.Fatal("expected the cached ready flag")
	}
	InvalidateTenant(4)
	if _, ok := readyCache.Get("4"); ok {
		t.Fatal("expected InvalidateTenant to force re-detection")
	}
}

// A cached "not ready" must never short-circuit detection, so finishing the last
// setup step unblocks the very next request instead of after the TTL.
func TestNotReadyDoesNotShortCircuit(t *testing.T) {
	t.Cleanup(ResetCache)
	ResetCache()

	if cachedReady(5) {
		t.Fatal("empty cache must not report ready")
	}
	readyCache.Set("5", false)
	if cachedReady(5) {
		t.Fatal("a cached not-ready must still re-detect")
	}
	readyCache.Set("5", true)
	if readyCache.Enabled() && !cachedReady(5) {
		t.Fatal("a cached ready must short-circuit")
	}
}
