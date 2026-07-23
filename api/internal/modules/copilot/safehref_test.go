package copilot

import "testing"

func TestSafeAppPath(t *testing.T) {
	okCases := map[string]string{
		"/app/dashboard":                 "/app/dashboard",
		"/app/quotation/quotations/new":  "/app/quotation/quotations/new",
		"/app/inventory/items?q=abc":     "/app/inventory/items?q=abc",
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
