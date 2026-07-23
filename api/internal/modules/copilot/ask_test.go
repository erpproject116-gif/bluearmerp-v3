package copilot

import "testing"

func TestClassifyIntent(t *testing.T) {
	cases := []struct {
		q, want string
	}{
		{"how do I confirm a quotation", "docs"},
		{"what is overdue", "ops"},
		{"find stock WIDGET-1", "ops"},
		{"import rfq pdf", "action"},
		{"create recurring expense for rent", "action"},
	}
	for _, c := range cases {
		if got := classifyIntent(c.q); got != c.want {
			t.Fatalf("classifyIntent(%q)=%q want %q", c.q, got, c.want)
		}
	}
}
