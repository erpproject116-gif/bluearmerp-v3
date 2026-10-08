package inventory

import "testing"

func TestRepairProgressAllowed(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{"received", "released", false},
		{"finished", "released", true},
		{"received", "diagnosing", true},
		{"received", "finished", true},
		{"diagnosing", "released", false},
		{"awaiting_parts", "finished", true},
		{"finished", "repairing", true},
		{"finished", "received", false},
		{"released", "finished", false},
		{"released", "released", true},
		{"received", "received", true},
	}
	for _, c := range cases {
		if got := repairProgressAllowed(c.from, c.to); got != c.ok {
			t.Errorf("repairProgressAllowed(%q, %q) = %v, want %v", c.from, c.to, got, c.ok)
		}
	}
}

func TestRepairProgressCreateStartsReceived(t *testing.T) {
	base := repairOrderBody{PartnerID: 1, LocationID: 1, OrderDate: "2026-01-01"}
	released := base
	released.ProgressStatus = "released"
	if errs := validateRepairOrderBody(released, true); errs["progress_status"] == "" {
		t.Fatal("create as released should be rejected")
	}
	received := base
	received.ProgressStatus = "received"
	if errs := validateRepairOrderBody(received, true); errs != nil {
		t.Fatalf("create as received: %v", errs)
	}
}
