package onboarding

import (
	"testing"
	"time"
)

func TestPlaybookEligible_NewUser(t *testing.T) {
	now := time.Date(2026, 7, 6, 12, 0, 0, 0, time.UTC)
	created := now.Add(-10 * 24 * time.Hour)
	s := userOnboardingState{UserCreatedAt: created}
	if !s.playbookEligible(now) {
		t.Fatal("expected new user to be eligible")
	}
}

func TestPlaybookEligible_Dismissed(t *testing.T) {
	now := time.Now()
	d := now.Add(-time.Hour)
	s := userOnboardingState{
		UserCreatedAt: now.Add(-24 * time.Hour),
		DismissedAt:   &d,
	}
	if s.playbookEligible(now) {
		t.Fatal("expected dismissed user to be ineligible")
	}
}

func TestPlaybookEligible_VeteranOnActiveTenant(t *testing.T) {
	now := time.Date(2026, 7, 6, 12, 0, 0, 0, time.UTC)
	seen := now.Add(-30 * 24 * time.Hour)
	s := userOnboardingState{
		UserCreatedAt:     now.Add(-60 * 24 * time.Hour),
		FirstAppSeenAt:    &seen,
		TenantHasActivity: true,
	}
	if s.playbookEligible(now) {
		t.Fatal("expected veteran on active tenant to be ineligible")
	}
}

func TestResolveVisibility(t *testing.T) {
	showSetup, showPlaybook := resolveVisibilityAt(false, userOnboardingState{}, time.Now())
	if !showSetup || showPlaybook {
		t.Fatalf("incomplete setup: showSetup=%v showPlaybook=%v", showSetup, showPlaybook)
	}
	showSetup, showPlaybook = resolveVisibilityAt(true, userOnboardingState{
		UserCreatedAt: time.Now().Add(-24 * time.Hour),
	}, time.Now())
	if showSetup || !showPlaybook {
		t.Fatalf("new user after setup: showSetup=%v showPlaybook=%v", showSetup, showPlaybook)
	}
}
