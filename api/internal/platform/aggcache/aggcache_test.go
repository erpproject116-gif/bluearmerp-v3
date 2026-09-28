package aggcache

import (
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestSingleflightSharesOneLoad(t *testing.T) {
	t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "")
	Reset()
	t.Cleanup(Reset)

	var calls atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once

	load := func() (int, error) {
		calls.Add(1)
		once.Do(func() { close(started) })
		<-release
		return 7, nil
	}

	const n = 8
	var wg sync.WaitGroup
	wg.Add(n)
	errCh := make(chan error, n)
	for i := 0; i < n; i++ {
		go func() {
			defer wg.Done()
			v, err := Load("42|summary|", false, load)
			if err != nil {
				errCh <- err
				return
			}
			if v != 7 {
				t.Errorf("got %d", v)
			}
		}()
	}
	<-started
	close(release)
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatal(err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("loads = %d, want 1", got)
	}
}

func TestInvalidateTenantForcesReload(t *testing.T) {
	t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "")
	Reset()
	t.Cleanup(Reset)

	var calls atomic.Int32
	key := Key(9, "summary", "")
	if _, err := Load(key, false, func() (string, error) {
		calls.Add(1)
		return "a", nil
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(key, false, func() (string, error) {
		calls.Add(1)
		return "b", nil
	}); err != nil {
		t.Fatal(err)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("loads before invalidate = %d, want 1", got)
	}
	InvalidateTenant(9)
	v, err := Load(key, false, func() (string, error) {
		calls.Add(1)
		return "c", nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if v != "c" || calls.Load() != 2 {
		t.Fatalf("after invalidate v=%q loads=%d", v, calls.Load())
	}
}

func TestKillSwitchQueriesEveryTime(t *testing.T) {
	t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "0")
	Reset()
	t.Cleanup(func() {
		t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "")
		Reset()
	})

	var calls atomic.Int32
	for i := 0; i < 3; i++ {
		if _, err := Load(Key(1, "summary", ""), false, func() (int, error) {
			calls.Add(1)
			return 1, nil
		}); err != nil {
			t.Fatal(err)
		}
	}
	if got := calls.Load(); got != 3 {
		t.Fatalf("loads = %d, want 3 when cache is disabled", got)
	}
}

func TestErrorIsNotCached(t *testing.T) {
	t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "")
	Reset()
	t.Cleanup(Reset)

	key := Key(3, "summary", "")
	_, err := Load(key, false, func() (int, error) {
		return 0, errSentinel
	})
	if err == nil {
		t.Fatal("expected error")
	}
	v, err := Load(key, false, func() (int, error) {
		return 4, nil
	})
	if err != nil || v != 4 {
		t.Fatalf("v=%d err=%v", v, err)
	}
}

var errSentinel = sentinelErr{}

type sentinelErr struct{}

func (sentinelErr) Error() string { return "load failed" }

func TestTrendBucketSurvivesPastShortTTL(t *testing.T) {
	// Distinct defaults: unset env uses 30s vs 60s. A value stored in the long
	// bucket must still be readable immediately.
	t.Setenv("DASHBOARD_CACHE_TTL_SECONDS", "")
	Reset()
	t.Cleanup(Reset)
	key := Key(5, "sales-trend", "12")
	if _, err := Load(key, true, func() (string, error) { return "trend", nil }); err != nil {
		t.Fatal(err)
	}
	time.Sleep(10 * time.Millisecond)
	v, err := Load(key, true, func() (string, error) { return "fresh", nil })
	if err != nil || v != "trend" {
		t.Fatalf("v=%q err=%v", v, err)
	}
}
