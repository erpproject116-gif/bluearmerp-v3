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
