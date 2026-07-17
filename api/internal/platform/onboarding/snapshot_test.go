package onboarding

import "testing"

func TestSnapshotForTenantNoTenant(t *testing.T) {
	// Ensure zero tenant returns a stable empty projection without panicking.
	// Pool is unused when tenantID <= 0.
	out, err := SnapshotForTenant(t.Context(), nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	if out["ready"] != false {
		t.Fatalf("ready = %v", out["ready"])
	}
	if out["blocking_reason"] == "" {
		t.Fatal("expected blocking reason")
	}
}
