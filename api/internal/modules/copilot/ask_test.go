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
		{"generate quotation for @[customer:1|Acme]", "action"},
		{"send email quotation", "action"},
		{"create follow-up for customer", "action"},
		{"look up serial SN-1", "ops"},
	}
	for _, c := range cases {
		if got := classifyIntent(c.q); got != c.want {
			t.Fatalf("classifyIntent(%q)=%q want %q", c.q, got, c.want)
		}
	}
}

func TestParseMentionTokens(t *testing.T) {
	got := parseMentionTokens(`Email @[customer:9|Acme Co] about @[quotation:3|QT-1]`)
	if len(got) != 2 {
		t.Fatalf("got %d mentions", len(got))
	}
	if got[0].Type != "customer" || got[0].ID != 9 || got[0].Label != "Acme Co" {
		t.Fatalf("customer parse: %+v", got[0])
	}
	if got[1].Type != "quotation" || got[1].ID != 3 {
		t.Fatalf("quotation parse: %+v", got[1])
	}
}
