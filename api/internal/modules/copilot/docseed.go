package copilot

import (
	"encoding/json"
	"strings"
)

// docSeedSpec gates the approve-to-seed handoff for "open document" drafts:
// Approve returns a sanitized seed the create form consumes; the user still
// reviews and saves — Baiko never posts commercial documents.
type docSeedSpec struct {
	WritePermission string
	// SeedKind is the client sessionStorage suffix (bluearm.docSeed.<kind>).
	SeedKind string
}

var docSeedSpecs = map[string]docSeedSpec{
	"open_quotation":        {WritePermission: "quotation.quotations", SeedKind: "quotation"},
	"open_sales_order":      {WritePermission: "sales_order.sales_orders_new", SeedKind: "sales_order"},
	"open_sales":            {WritePermission: "sales.sales_new", SeedKind: "sales"},
	"open_purchase_request": {WritePermission: "purchase_request.purchase_requests_new", SeedKind: "purchase_request"},
	"open_rfq":              {WritePermission: "purchase_order.rfq_create", SeedKind: "rfq"},
	"open_purchase_order":   {WritePermission: "purchase_order.purchase_orders", SeedKind: "purchase_order"},
	"open_purchases":        {WritePermission: "purchases.purchases_new", SeedKind: "purchases"},
}

// sanitizeSeedLines bounds and allowlists document seed lines (shared by the
// RFQ quotation seed and the generalized doc seeds). Max 200 lines.
func sanitizeSeedLines(rawLines any) []any {
	if rawLines == nil {
		return nil
	}
	encoded, err := json.Marshal(rawLines)
	if err != nil {
		return nil
	}
	var lines []map[string]any
	if json.Unmarshal(encoded, &lines) != nil {
		return nil
	}
	if len(lines) > 200 {
		lines = lines[:200]
	}
	clean := make([]any, 0, len(lines))
	for _, line := range lines {
		itemName := boundedString(line["item_name"], 240)
		itemCode := boundedString(line["item_code"], 100)
		description := boundedString(line["description"], 12_000)
		if itemName == "" && itemCode == "" && description == "" {
			continue
		}
		qty, ok := toFloat(line["qty"])
		if !ok || qty <= 0 {
			qty = 1
		}
		unitPrice, ok := toFloat(line["unit_price"])
		if !ok || unitPrice < 0 {
			unitPrice = 0
		}
		row := map[string]any{
			"item_code":   itemCode,
			"item_name":   itemName,
			"description": description,
			"qty":         qty,
			"unit":        boundedString(line["unit"], 40),
			"unit_price":  unitPrice,
			"remarks":     boundedString(line["remarks"], 2_000),
		}
		if id, ok := toPositiveInt64(line["item_id"]); ok {
			row["item_id"] = id
		}
		if id, ok := toPositiveInt64(line["unit_id"]); ok {
			row["unit_id"] = id
		}
		if code := boundedString(line["unit_code"], 30); code != "" {
			row["unit_code"] = code
		}
		clean = append(clean, row)
	}
	return clean
}

// sanitizeDocSeedPayload allowlists the generalized document seed:
// partner + bounded lines + review flag. ui/api and anything else is dropped.
func sanitizeDocSeedPayload(payload map[string]any) map[string]any {
	out := map[string]any{}
	if id, ok := toPositiveInt64(payload["partner_id"]); ok {
		out["partner_id"] = id
	}
	for _, key := range []string{"partner_name", "partner_code", "kind", "note", "hint"} {
		if value := boundedString(payload[key], 240); value != "" {
			out[key] = value
		}
	}
	if lines := sanitizeSeedLines(payload["lines"]); len(lines) > 0 {
		out["lines"] = lines
	}
	if flag, ok := payload["needs_qty_review"].(bool); ok && flag {
		out["needs_qty_review"] = true
	}
	return out
}

// docSeedHasContent reports whether a sanitized doc-seed payload actually seeds
// anything (partner or lines) — pure navigation drafts skip the write gate.
func docSeedHasContent(payload map[string]any) bool {
	if _, ok := payload["partner_id"]; ok {
		return true
	}
	if s, ok := payload["partner_name"].(string); ok && strings.TrimSpace(s) != "" {
		return true
	}
	if lines, ok := payload["lines"].([]any); ok && len(lines) > 0 {
		return true
	}
	return false
}
