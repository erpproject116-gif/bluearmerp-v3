package copilot

import "testing"

func TestSanitizeDocSeedPayload(t *testing.T) {
	payload := map[string]any{
		"partner_id":       float64(7),
		"partner_name":     "Acme Corp",
		"ui":               "/evil",
		"api":              "/evil",
		"needs_qty_review": true,
		"lines": []any{
			map[string]any{"item_id": float64(3), "item_code": "PEN-01", "item_name": "Pen", "qty": float64(0)},
			map[string]any{"item_name": "", "item_code": "", "description": ""},
		},
	}
	out := sanitizeDocSeedPayload(payload)
	if out["partner_id"] != int64(7) || out["partner_name"] != "Acme Corp" {
		t.Fatalf("partner not kept: %v", out)
	}
	if _, ok := out["ui"]; ok {
		t.Fatal("ui must be dropped")
	}
	if _, ok := out["api"]; ok {
		t.Fatal("api must be dropped")
	}
	if out["needs_qty_review"] != true {
		t.Fatal("needs_qty_review must survive")
	}
	lines, _ := out["lines"].([]any)
	if len(lines) != 1 {
		t.Fatalf("expected 1 line (empty dropped), got %d", len(lines))
	}
	row := lines[0].(map[string]any)
	if row["qty"] != float64(1) {
		t.Fatalf("qty<=0 must default to 1, got %v", row["qty"])
	}
	if row["item_id"] != int64(3) || row["item_code"] != "PEN-01" {
		t.Fatalf("line fields lost: %v", row)
	}
}

func TestSanitizeSeedLinesCap(t *testing.T) {
	var raw []any
	for i := 0; i < 250; i++ {
		raw = append(raw, map[string]any{"item_name": "Item", "qty": float64(2)})
	}
	lines := sanitizeSeedLines(raw)
	if len(lines) != 200 {
		t.Fatalf("expected 200-line cap, got %d", len(lines))
	}
}

func TestDocSeedHasContent(t *testing.T) {
	if docSeedHasContent(map[string]any{"note": "x"}) {
		t.Fatal("note-only payload must not count as seed content")
	}
	if !docSeedHasContent(map[string]any{"partner_id": int64(1)}) {
		t.Fatal("partner_id counts")
	}
	if !docSeedHasContent(map[string]any{"lines": []any{map[string]any{"item_name": "Pen"}}}) {
		t.Fatal("lines count")
	}
}

func TestOpenDocDraftStagesSeedLines(t *testing.T) {
	tr := toolDraftOpenDocument("sales_order", map[string]any{
		"q": "create sales order for @Customer with @Item",
		"entities": []any{
			map[string]any{"type": "customer", "id": float64(5), "label": "Acme"},
			map[string]any{"type": "item", "id": float64(9), "code": "PEN-01", "label": "Pen"},
		},
	})
	if !tr.OK || tr.ActionDraft == nil {
		t.Fatalf("draft failed: %+v", tr)
	}
	payload := tr.ActionDraft.Payload
	lines, _ := payload["lines"].([]any)
	if len(lines) != 1 {
		t.Fatalf("expected 1 seed line, got %v", payload["lines"])
	}
	row := lines[0].(map[string]any)
	if row["qty"] != 1 || row["item_code"] != "PEN-01" {
		t.Fatalf("seed line = %v", row)
	}
	if payload["needs_qty_review"] != true {
		t.Fatal("needs_qty_review must be set for tagged items without qty")
	}
	// Sanitizer keeps the seed intact for this draft type.
	clean := sanitizeDraftPayload("open_sales_order", payload)
	cleanLines, _ := clean["lines"].([]any)
	if len(cleanLines) != 1 {
		t.Fatalf("sanitized lines = %v", clean["lines"])
	}
	if clean["partner_id"] != int64(5) {
		t.Fatalf("partner_id = %v", clean["partner_id"])
	}
}

func TestOpenDocDraftNoSeedForBundle(t *testing.T) {
	tr := toolDraftOpenDocument("product_bundle", map[string]any{
		"entities": []any{map[string]any{"type": "item", "id": float64(9), "code": "PEN-01", "label": "Pen"}},
	})
	if tr.ActionDraft == nil {
		t.Fatal("expected draft")
	}
	if _, ok := tr.ActionDraft.Payload["lines"]; ok {
		t.Fatal("non-line-doc drafts must not stage seed lines")
	}
}
