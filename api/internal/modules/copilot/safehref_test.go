package copilot

import "testing"

func TestSafeAppPath(t *testing.T) {
	okCases := map[string]string{
		"/app/dashboard":                "/app/dashboard",
		"/app/quotation/quotations/new": "/app/quotation/quotations/new",
		"/app/inventory/items?q=abc":    "/app/inventory/items?q=abc",
	}
	for in, want := range okCases {
		got, ok := SafeAppPath(in)
		if !ok || got != want {
			t.Fatalf("SafeAppPath(%q)=(%q,%v) want (%q,true)", in, got, ok, want)
		}
	}
	bad := []string{
		"",
		"https://evil.com",
		"http://evil.com",
		"//evil.com",
		"javascript:alert(1)",
		"/app/../etc/passwd",
		"/app/foo\\bar",
		"/dashboard",
		"/app",
		"data:text/html,hi",
	}
	for _, in := range bad {
		if _, ok := SafeAppPath(in); ok {
			t.Fatalf("SafeAppPath(%q) should be false", in)
		}
	}
}

func TestOpenUIFromDraftIgnoresEvilUI(t *testing.T) {
	draft := actionDraft{
		Type: "open_quotation",
		Payload: map[string]any{
			"ui":   "https://evil.com/phish",
			"hint": "ignore me for nav",
		},
	}
	res, errMsg, status := openUIFromDraft(draft)
	if errMsg != "" || status != 200 {
		t.Fatalf("unexpected err=%q status=%d", errMsg, status)
	}
	m := res.(map[string]any)
	next, _ := m["next"].(string)
	if next != "/app/quotation/quotations/new" {
		t.Fatalf("next=%q want catalog path", next)
	}
}

func TestRfqQuotationSeedIsAllowlistedAndCatalogRouted(t *testing.T) {
	draft := actionDraft{
		Type: "create_quotation_from_rfq",
		Payload: map[string]any{
			"ui":         "https://evil.example/phish",
			"partner_id": float64(42),
			"unknown":    "drop me",
			"lines": []any{
				map[string]any{
					"item_id":     float64(7),
					"item_code":   " LAP-1 ",
					"item_name":   "Laptop",
					"description": "16GB RAM",
					"qty":         "8",
					"unit":        "units",
					"unit_price":  "45000",
					"evil":        "drop me",
				},
				map[string]any{"item_id": float64(-1), "description": ""},
			},
		},
	}
	result, errMsg, status := openUIFromDraft(draft)
	if errMsg != "" || status != 200 {
		t.Fatalf("unexpected result: err=%q status=%d", errMsg, status)
	}
	m := result.(map[string]any)
	if m["next"] != "/app/quotation/quotations/new" {
		t.Fatalf("next=%v", m["next"])
	}
	seed := m["seed"].(map[string]any)
	if _, exists := seed["ui"]; exists {
		t.Fatal("unsafe ui leaked into seed")
	}
	lines := seed["lines"].([]any)
	if len(lines) != 1 {
		t.Fatalf("lines=%#v", lines)
	}
	line := lines[0].(map[string]any)
	if line["item_id"] != int64(7) || line["qty"] != float64(8) {
		t.Fatalf("sanitized line=%#v", line)
	}
	if _, exists := line["evil"]; exists {
		t.Fatal("unknown line key leaked")
	}
}

func TestDraftQuotationFromRfqCapsAndSanitizesLines(t *testing.T) {
	rows := make([]any, 205)
	for i := range rows {
		rows[i] = map[string]any{
			"item_id":     i + 1,
			"item_name":   "Laptop",
			"description": "Required specification",
			"qty":         8,
			"unit_price":  45000,
			"unknown":     "drop",
		}
	}
	result := toolDraftQuotationFromRFQ(map[string]any{"partner_id": 9, "lines": rows})
	if !result.OK || result.ActionDraft == nil {
		t.Fatalf("result=%+v", result)
	}
	lines := result.ActionDraft.Payload["lines"].([]any)
	if len(lines) != 200 {
		t.Fatalf("line count=%d, want 200", len(lines))
	}
	if _, exists := lines[0].(map[string]any)["unknown"]; exists {
		t.Fatal("unknown key leaked")
	}
}
