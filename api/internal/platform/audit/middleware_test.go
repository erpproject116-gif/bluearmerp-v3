package audit

import "testing"

func TestDeriveHTTPAudit(t *testing.T) {
	code, target, id, meta := deriveHTTPAudit("PATCH", "/api/v1/inventory/partners/42")
	if code != "api.patch.inventory.partners.{id}" {
		t.Fatalf("actionCode = %q", code)
	}
	if target != "inventory.partner" {
		t.Fatalf("targetType = %q", target)
	}
	if id == nil || *id != 42 {
		t.Fatalf("targetID = %v", id)
	}
	if meta["method"] != "PATCH" {
		t.Fatalf("meta = %#v", meta)
	}
}

func TestShouldSkipHTTPAudit(t *testing.T) {
	if !shouldSkipHTTPAudit("/api/v1/presence/heartbeat") {
		t.Fatal("expected presence skip")
	}
	if !shouldSkipHTTPAudit("/api/v1/document-drafts/quo_quotation") {
		t.Fatal("expected draft skip")
	}
	if shouldSkipHTTPAudit("/api/v1/inventory/partners") {
		t.Fatal("expected partners audit")
	}
}
