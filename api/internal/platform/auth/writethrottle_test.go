package auth

import (
	"testing"
	"time"
)

func TestShouldStampActivityThrottlesFreshRows(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_WRITE_SECONDS", "30")
	now := time.Now()

	if shouldStampActivity(now.Add(-5*time.Second), now) {
		t.Fatal("expected a 5s-old stamp to skip the UPDATE")
	}
	if !shouldStampActivity(now.Add(-31*time.Second), now) {
		t.Fatal("expected a 31s-old stamp to be rewritten")
	}
	if !shouldStampActivity(now.Add(-30*time.Second), now) {
		t.Fatal("expected the interval boundary to be inclusive")
	}
}

func TestShouldStampActivityDisabled(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_WRITE_SECONDS", "0")
	now := time.Now()
	if !shouldStampActivity(now, now) {
		t.Fatal("interval 0 must restore write-on-every-bump behavior")
	}
}

// The throttle must stay far below the idle timeout or active users get logged out.
func TestActivityThrottleWellUnderIdleTimeout(t *testing.T) {
	t.Setenv("SESSION_ACTIVITY_WRITE_SECONDS", "30")
	if activityWriteInterval()*4 > sessionIdleTimeout() {
		t.Fatalf("activity throttle %v is too close to idle timeout %v",
			activityWriteInterval(), sessionIdleTimeout())
	}
}

func TestShouldStampPlatformSignIn(t *testing.T) {
	now := time.Now()
	recent := now.Add(-time.Minute)
	stale := now.Add(-16 * time.Minute)

	if !shouldStampPlatformSignIn(nil, now) {
		t.Fatal("a never-signed-in staff row must be stamped")
	}
	if shouldStampPlatformSignIn(&recent, now) {
		t.Fatal("a 1m-old sign-in must not be rewritten")
	}
	if !shouldStampPlatformSignIn(&stale, now) {
		t.Fatal("a 16m-old sign-in must be rewritten")
	}
}
