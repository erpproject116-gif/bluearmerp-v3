package auth

import "testing"

func TestCrossTenantOccupancyMessage(t *testing.T) {
	msg := CrossTenantOccupancyMessage(EmailOccupancy{CompanyName: "Acme Corp"})
	if msg == "" || !contains(msg, "Acme Corp") {
		t.Fatalf("unexpected message: %q", msg)
	}
	msg2 := CrossTenantOccupancyMessage(EmailOccupancy{})
	if !contains(msg2, "another business") {
		t.Fatalf("expected fallback name, got %q", msg2)
	}
}

func TestOwnBusinessRequiresDifferentEmailMessage(t *testing.T) {
	msg := OwnBusinessRequiresDifferentEmailMessage(EmailOccupancy{CompanyName: "Bluearm DEMO"})
	if !contains(msg, "Bluearm DEMO") || !contains(msg, "different Google email") {
		t.Fatalf("unexpected message: %q", msg)
	}
}

func TestIsBootstrapExemptFromOccupancyConcept(t *testing.T) {
	// Documented contract: bootstrap emails skip occupancy (Occupied=false without DB).
	if !isBootstrapSuperadminEmail("bluearmph@gmail.com") {
		t.Fatal("expected bootstrap email")
	}
}

func TestReleaseCustomerEmailClaimSkipsBootstrap(t *testing.T) {
	n, err := ReleaseCustomerEmailClaim(t.Context(), nil, "bluearmph@gmail.com")
	if err != nil {
		t.Fatal(err)
	}
	if n != 0 {
		t.Fatalf("expected 0 rows for bootstrap, got %d", n)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 ||
		(func() bool {
			for i := 0; i+len(sub) <= len(s); i++ {
				if s[i:i+len(sub)] == sub {
					return true
				}
			}
			return false
		})())
}
