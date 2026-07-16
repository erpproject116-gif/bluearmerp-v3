package auth

import "testing"

func TestNormalizeEmail(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  User@Example.COM ", "user@example.com"},
		{"", ""},
		{"a@b.co", "a@b.co"},
	}
	for _, tc := range tests {
		if got := normalizeEmail(tc.in); got != tc.want {
			t.Fatalf("normalizeEmail(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestIsBootstrapSuperadminEmail(t *testing.T) {
	for _, email := range []string{
		"itsjohnranel@gmail.com",
		"bluearmph@gmail.com",
		"erpproject116@gmail.com",
		"ItsJohnRanel@Gmail.com",
	} {
		if !isBootstrapSuperadminEmail(email) {
			t.Fatalf("expected platform console email %q", email)
		}
	}
	if isBootstrapSuperadminEmail("other@example.com") {
		t.Fatal("unexpected bootstrap email")
	}
	if IsPlatformConsoleEmail("demo@customer.com") {
		t.Fatal("customer email must not access platform console")
	}
}
