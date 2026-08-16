package onboarding

import (
	"testing"
	"time"
)

func TestPlaybookEligible_NewUser(t *testing.T) {
	now := time.Date(2026, 7, 6, 12, 0, 0, 0, time.UTC)
	created := now.Add(-10 * 24 * time.Hour)
	s := userOnboardingState{UserCreatedAt: created, IsStoreAdmin: true}
	if !s.playbookEligible(now) {
		t.Fatal("expected new store admin to be eligible")
	}
}

func TestPlaybookEligible_MemberNotEligible(t *testing.T) {
	now := time.Date(2026, 7, 6, 12, 0, 0, 0, time.UTC)
	s := userOnboardingState{UserCreatedAt: now.Add(-24 * time.Hour)}
	if s.playbookEligible(now) {
		t.Fatal("plain members must not see owner playbook")
	}
}

func TestPlaybookEligible_Dismissed(t *testing.T) {
	now := time.Now()
	d := now.Add(-time.Hour)
	s := userOnboardingState{
		UserCreatedAt: now.Add(-24 * time.Hour),
		DismissedAt:   &d,
		IsTenantOwner: true,
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
		IsStoreAdmin:      true,
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
		IsStoreAdmin:  true,
	}, time.Now())
	if showSetup || !showPlaybook {
		t.Fatalf("new store admin after setup: showSetup=%v showPlaybook=%v", showSetup, showPlaybook)
	}
	showSetup, showPlaybook = resolveVisibilityAt(true, userOnboardingState{
		UserCreatedAt: time.Now().Add(-24 * time.Hour),
	}, time.Now())
	if showSetup || showPlaybook {
		t.Fatalf("member after setup must not see playbook: showSetup=%v showPlaybook=%v", showSetup, showPlaybook)
	}
}
