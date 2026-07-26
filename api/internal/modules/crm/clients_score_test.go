package crm

import "testing"

func TestComputeClientHealthScore(t *testing.T) {
	base := clientHealthRow{}
	if got := computeClientHealthScore(base); got != 90 {
		// no activity → -10
		t.Fatalf("empty row score=%d want 90", got)
	}

	days := 100
	withInactive := clientHealthRow{DaysSinceActivity: &days}
	if got := computeClientHealthScore(withInactive); got != 75 {
		t.Fatalf("inactive>90 score=%d want 75", got)
	}

	withAR := clientHealthRow{OpenARBalance: 100, DaysSinceActivity: ptrInt(10)}
	if got := computeClientHealthScore(withAR); got != 75 {
		t.Fatalf("open AR score=%d want 75", got)
	}

	withOverdue := clientHealthRow{
		OpenARBalance:      50,
		OverdueFollowUps:   2,
		OverdueWorkItems:   1,
		CreditLimitOnHold:  true,
		DaysSinceActivity:  ptrInt(10),
	}
	// 100 -25 AR -15 hold - min(30, 30) overdue tasks = 30
	if got := computeClientHealthScore(withOverdue); got != 30 {
		t.Fatalf("heavy penalty score=%d want 30", got)
	}
}

func ptrInt(v int) *int { return &v }
