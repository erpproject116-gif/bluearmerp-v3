package chat

import (
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestCanUseBaikoSlash(t *testing.T) {
	if canUseBaikoSlash(auth.TenantUser{}) {
		t.Fatal("member must not use Baiko slash")
	}
	if canUseBaikoSlash(auth.TenantUser{IsTenantOwner: true}) != true {
		t.Fatal("tenant owner should use Baiko slash")
	}
	if canUseBaikoSlash(auth.TenantUser{IsPlatformSuperadmin: true}) != true {
		t.Fatal("superadmin should use Baiko slash")
	}
}

func TestAllowedReactionEmojis(t *testing.T) {
	if !allowedReactionEmojis["👍"] {
		t.Fatal("thumbsup required")
	}
	if allowedReactionEmojis["🔥"] {
		t.Fatal("arbitrary emoji must be rejected")
	}
}

func TestSlashOpenDocsCatalog(t *testing.T) {
	for _, cmd := range []string{"quotation", "sales-order", "sales", "purchase-request", "purchase-order", "rfq", "purchase"} {
		if _, ok := slashOpenDocs[cmd]; !ok {
			t.Fatalf("missing slash open doc for %s", cmd)
		}
	}
	if slashOpenDocs["quotation"].DraftType != "open_quotation" {
		t.Fatal("quotation draft type mismatch")
	}
}

func TestIsNavigateOnlyDraftType(t *testing.T) {
	if !IsNavigateOnlyDraftType("open_support_tickets") || !IsNavigateOnlyDraftType("open_crm") || !IsNavigateOnlyDraftType("open_baiko") {
		t.Fatal("ticket/crm/baiko must be navigate-only")
	}
	if IsNavigateOnlyDraftType("open_quotation") {
		t.Fatal("open_quotation must use approve API")
	}
}

func TestDecodeActionDraft(t *testing.T) {
	if decodeActionDraft(nil) != nil {
		t.Fatal("nil raw")
	}
	v := decodeActionDraft([]byte(`{"type":"open_quotation","payload":{}}`))
	m, ok := v.(map[string]any)
	if !ok || m["type"] != "open_quotation" {
		t.Fatalf("got %#v", v)
	}
}
