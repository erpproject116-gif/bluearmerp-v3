package copilot

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
)

func TestPackToolsTruncatesAndDropsEmpty(t *testing.T) {
	big := strings.Repeat("x", 50_000)
	raw, _ := json.Marshal(map[string]any{"note": "", "blob": big, "n": 1})
	tools := []toolResult{
		{Name: "get_financial_health", OK: true, Data: raw, DeepLinks: []deepLink{{Label: "Dash", Href: "/app/dashboard"}}},
		{Name: "evil", OK: true, DeepLinks: []deepLink{{Label: "x", Href: "javascript:alert(1)"}}},
	}
	packed, unpacked, packedN := PackTools(tools, 2000)
	if unpacked <= packedN {
		t.Fatalf("expected packed smaller: unpacked=%d packed=%d", unpacked, packedN)
	}
	if packedN > 2200 {
		t.Fatalf("packed too large: %d", packedN)
	}
	if strings.Contains(packed, "javascript:") {
		t.Fatal("unsafe deep link should be stripped")
	}
	if !strings.Contains(packed, "get_financial_health") {
		t.Fatalf("missing tool name in %q", packed)
	}
	if !strings.Contains(packed, "_truncated") && !strings.Contains(packed, "…[truncated]") {
		t.Fatalf("expected truncation marker: %s", packed[:min(200, len(packed))])
	}
}

func TestPackAttachmentsCap(t *testing.T) {
	atts := PackAttachments([]helpassistant.ComposeAttachment{
		{Name: "a.txt", Kind: "text", Text: strings.Repeat("a", 10_000)},
		{Name: "b.txt", Kind: "text", Text: strings.Repeat("b", 10_000)},
		{Name: "c.txt", Kind: "text", Text: "c"},
		{Name: "d.txt", Kind: "text", Text: "d"},
		{Name: "e.txt", Kind: "text", Text: "e"},
	}, 100, 250)
	if len(atts) > 4 {
		t.Fatalf("too many atts: %d", len(atts))
	}
	total := 0
	for _, a := range atts {
		total += len(a.Text)
		if len(a.Text) > 120 {
			t.Fatalf("per-file too long: %d", len(a.Text))
		}
	}
	if total > 280 {
		t.Fatalf("total too long: %d", total)
	}
}
