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
		{"create sales order for Acme", "action"},
		{"new purchase request", "action"},
		{"compare pricing WIDGET", "ops"},
		{"recommend items laptop", "ops"},
		{"show my notifications", "ops"},
		{"pc build for gaming", "action"},
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

func TestDocsInsufficient(t *testing.T) {
	if !docsInsufficient(askResult{Mode: "docs", UsedAI: false, Message: "I could not find a matching Bluearm guide for that."}) {
		t.Fatal("empty corpus should escalate")
	}
	if !docsInsufficient(askResult{Mode: "docs", UsedAI: false, Message: "Here are the closest guides:\n- Foo"}) {
		t.Fatal("ungrounded guide list should escalate")
	}
	if docsInsufficient(askResult{Mode: "docs", UsedAI: true, Message: "To confirm a quotation, open …", Hits: []map[string]any{{"score": 1.5}}}) {
		t.Fatal("successful grounded compose should not escalate")
	}
	if docsInsufficient(askResult{Mode: "ops", UsedAI: true, Message: "Cash is …"}) {
		t.Fatal("ops mode is never 'insufficient docs'")
	}
}
