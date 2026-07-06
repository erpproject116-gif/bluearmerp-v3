package setupreadiness

import (
	"testing"
	"time"
)

func TestShowSetupBanner_Snoozed(t *testing.T) {
	until := time.Now().Add(24 * time.Hour)
	s := userReminderState{SnoozeUntil: &until}
	if showSetupBanner(false, true, s, time.Now()) {
		t.Fatal("expected snoozed banner hidden")
	}
	if !showBreadcrumbHint(false, true, s, time.Now()) {
		t.Fatal("expected breadcrumb hint when snoozed")
	}
}

func TestShowSetupBanner_IncompleteAdmin(t *testing.T) {
	if !showSetupBanner(false, true, userReminderState{}, time.Now()) {
		t.Fatal("expected banner for incomplete setup")
	}
}
