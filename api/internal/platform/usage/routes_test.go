package usage

import "testing"

func TestNormalizeRoutePattern(t *testing.T) {
	cases := []struct {
		in, want string
	}{
		{"/app/support/tickets/1", "/app/support/tickets/:id"},
		{"/app/dashboard", "/app/dashboard"},
		{"/app/sales/42/lines/7", "/app/sales/:id/lines/:id"},
		{"", "/"},
	}
	for _, tc := range cases {
		got := normalizeRoutePattern(tc.in)
		if got != tc.want {
			t.Fatalf("normalizeRoutePattern(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
