package copilot

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// Mirrors MIG_ENTITY_FIELDS / MIG_REQUIRED in web/src/shared/migrationCsvImport.ts.
// Keep both sides in sync when Migration Center gains fields.
var migEntityFields = map[string][]string{
	"items": {
		"item_code", "item_name", "purchase_price", "sales_price", "vip_price", "status",
		"track_serial", "track_lot", "serial_policy", "lot_policy", "track_inventory_qty", "warranty_duration_months",
		"spec_name", "unit", "item_category", "item_type", "oe_price",
	},
	"partners": {"partner_code", "company_name", "partner_kind", "ceo_name", "phone", "mobile", "email", "address", "tin", "status"},
	"accounts": {"account_code", "account_name", "account_type", "is_group", "is_active", "sort_order"},
}

var migKindLabels = map[string]string{
	"items":    "Products / items",
	"partners": "Customers & suppliers",
	"accounts": "Chart of accounts",
}

const migrationCenterPath = "/app/user-management/migration-center"

// Header aliases so common export column names still auto-map (case-insensitive,
// compared after normalizeHeaderKey). Field -> extra accepted keys.
var migHeaderAliases = map[string][]string{
	"item_name":      {"name", "product_name", "description", "item"},
	"purchase_price": {"cost", "cost_price", "buy_price"},
	"sales_price":    {"price", "sell_price", "selling_price", "srp"},
	"unit":           {"uom", "unit_of_measure", "units"},
	"item_category":  {"category"},
	"company_name":   {"company", "partner_name", "customer_name", "vendor_name", "supplier_name", "name"},
	"partner_kind":   {"kind", "partner_type", "type"},
	"phone":          {"telephone", "tel", "phone_no", "contact_no"},
	"email":          {"email_address", "e_mail"},
	"account_code":   {"code", "acct_code", "gl_code"},
	"account_name":   {"name", "acct_name", "account_title"},
	"account_type":   {"type", "acct_type"},
}

var nonAlnumRe = regexp.MustCompile(`[^a-z0-9]+`)

func normalizeHeaderKey(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonAlnumRe.ReplaceAllString(s, "_")
	return strings.Trim(s, "_")
}

var rfqTextSignals = []string{
	"request for quotation", "philgeps", "request for price quotation", "abstract of quotation",
}

// looksLikeRfqSheetText reports whether attached sheet/document text is an RFQ,
// which should hand off to Import RFQ instead of a dataset import.
func looksLikeRfqSheetText(text string) bool {
	t := strings.ToLower(text)
	for _, sig := range rfqTextSignals {
		if strings.Contains(t, sig) {
			return true
		}
	}
	return false
}

// firstSheetCSV strips the "## Sheet: name" wrapper produced by extractAttachment.ts
// for multi-sheet workbooks and returns the CSV of the first sheet only.
func firstSheetCSV(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "## Sheet:") {
		return trimmed
	}
	lines := strings.Split(trimmed, "\n")
	var out []string
	started := false
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "## Sheet:") {
			if started {
				break // next sheet begins
			}
			started = true
			continue
		}
		if started {
			out = append(out, line)
		}
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// csvHeaderCells parses the first non-empty CSV line into trimmed header cells.
// Handles simple quoted cells; mirrors the client modal's parseHeaders behavior.
func csvHeaderCells(csvText string) []string {
	var first string
	for _, line := range strings.Split(csvText, "\n") {
		if strings.TrimSpace(line) != "" {
			first = line
			break
		}
	}
	if first == "" {
		return nil
	}
	var cells []string
	var cur strings.Builder
	inQuotes := false
	for i := 0; i < len(first); i++ {
		c := first[i]
		switch {
		case c == '"':
			inQuotes = !inQuotes
		case c == ',' && !inQuotes:
			cells = append(cells, strings.TrimSpace(cur.String()))
			cur.Reset()
		default:
			cur.WriteByte(c)
		}
	}
	cells = append(cells, strings.TrimSpace(cur.String()))
	// Drop trailing empties
	for len(cells) > 0 && cells[len(cells)-1] == "" {
		cells = cells[:len(cells)-1]
	}
	if len(cells) > 100 {
		cells = cells[:100]
	}
	for i, c := range cells {
		if len(c) > 120 {
			cells[i] = c[:120]
		}
	}
	return cells
}

// guessMigKind picks the Migration Center entity from header names.
func guessMigKind(headers []string) string {
	keys := map[string]bool{}
	for _, h := range headers {
		keys[normalizeHeaderKey(h)] = true
	}
	score := func(kind string) int {
		n := 0
		for _, f := range migEntityFields[kind] {
			if keys[f] {
				n++
			}
			for _, alias := range migHeaderAliases[f] {
				if keys[alias] {
					n++
					break
				}
			}
		}
		return n
	}
	// Strong single-field signals first.
	if keys["account_code"] || keys["account_type"] || keys["gl_code"] {
		return "accounts"
	}
	if keys["company_name"] || keys["partner_kind"] || keys["tin"] || keys["vendor_name"] || keys["supplier_name"] || keys["customer_name"] {
		return "partners"
	}
	best, bestScore := "items", score("items")
	for _, kind := range []string{"partners", "accounts"} {
		if s := score(kind); s > bestScore {
			best, bestScore = kind, s
		}
	}
	return best
}

// autoColumnMap maps Bluearm fields to CSV headers: exact (case-insensitive) first,
// then normalized-key match, then aliases. Same spirit as the modal's auto-map.
func autoColumnMap(kind string, headers []string) map[string]string {
	byExact := map[string]string{}
	byNorm := map[string]string{}
	for _, h := range headers {
		if h == "" {
			continue
		}
		lower := strings.ToLower(h)
		if _, ok := byExact[lower]; !ok {
			byExact[lower] = h
		}
		norm := normalizeHeaderKey(h)
		if _, ok := byNorm[norm]; !ok && norm != "" {
			byNorm[norm] = h
		}
	}
	out := map[string]string{}
	for _, field := range migEntityFields[kind] {
		if h, ok := byExact[field]; ok {
			out[field] = h
			continue
		}
		if h, ok := byNorm[field]; ok {
			out[field] = h
			continue
		}
		for _, alias := range migHeaderAliases[field] {
			if h, ok := byNorm[alias]; ok {
				out[field] = h
				break
			}
		}
	}
	// One header must not satisfy two fields (e.g. "name" for item_name and account_name is fine
	// per kind, but "description" should not double-map inside the same kind).
	seen := map[string]string{}
	for field, h := range out {
		if prev, dup := seen[h]; dup {
			// Keep the earlier (more canonical) field, drop the alias-based duplicate.
			if fieldRank(kind, prev) <= fieldRank(kind, field) {
				delete(out, field)
			} else {
				delete(out, prev)
				seen[h] = field
			}
			continue
		}
		seen[h] = field
	}
	return out
}

func fieldRank(kind, field string) int {
	for i, f := range migEntityFields[kind] {
		if f == field {
			return i
		}
	}
	return len(migEntityFields[kind])
}

// toolMapImportDataset builds an approve-to-act draft that stages a chat-attached
// sheet into the existing Migration Center mapped import (no import happens here).
func toolMapImportDataset(tu auth.TenantUser, args map[string]any) toolResult {
	if !tu.HasPermission("migration.center", auth.AccessRead) {
		return toolResult{Name: "map_import_dataset", Denied: true, Error: "Missing migration.center permission."}
	}
	fileName := boundedString(args["file_name"], 240)
	csvText, _ := args["csv_text"].(string)
	csvText = firstSheetCSV(csvText)
	if strings.TrimSpace(csvText) == "" {
		return toolResult{Name: "map_import_dataset", OK: false, Error: "The attached sheet has no readable rows."}
	}
	truncated := strings.Contains(csvText, "…[truncated]")
	if len(csvText) > 32_000 {
		csvText = csvText[:32_000]
		truncated = true
	}
	headers := csvHeaderCells(csvText)
	if len(headers) == 0 {
		return toolResult{Name: "map_import_dataset", OK: false, Error: "Could not detect a header row in the attached sheet."}
	}
	kind := strings.ToLower(boundedString(args["kind"], 20))
	if _, ok := migEntityFields[kind]; !ok {
		kind = guessMigKind(headers)
	}
	columnMap := autoColumnMap(kind, headers)

	label := migKindLabels[kind]
	summary := fmt.Sprintf(
		"Map %q into %s import — %d of %d Bluearm fields auto-matched. Approve opens Migration Center with the mapping prefilled; nothing imports until you confirm there.",
		fileName, label, len(columnMap), len(migEntityFields[kind]),
	)
	if truncated {
		summary += " Note: the attachment text was truncated — re-pick the original file in the import dialog before importing."
	}

	payload := map[string]any{
		"kind":       kind,
		"file_name":  fileName,
		"headers":    headers,
		"column_map": columnMap,
		"csv_text":   csvText,
		"truncated":  truncated,
	}
	draft := &actionDraft{
		Type:    "map_import_dataset",
		Summary: summary,
		API:     "/api/v1/migration",
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{
		"draft": map[string]any{
			"type": draft.Type, "summary": draft.Summary,
			"kind": kind, "headers": headers, "column_map": columnMap, "truncated": truncated,
		},
	})
	return toolResult{
		Name:        "map_import_dataset",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Migration Center", Href: migrationCenterPath}},
	}
}

// sanitizeMapImportPayload keeps only allowlisted, bounded keys for the mig import seed.
func sanitizeMapImportPayload(payload map[string]any) map[string]any {
	out := map[string]any{}
	kind := strings.ToLower(boundedString(payload["kind"], 20))
	if _, ok := migEntityFields[kind]; !ok {
		kind = "items"
	}
	out["kind"] = kind
	out["file_name"] = boundedString(payload["file_name"], 240)

	var headers []string
	if rawHeaders, ok := payload["headers"].([]any); ok {
		for _, h := range rawHeaders {
			if s := boundedString(h, 120); s != "" {
				headers = append(headers, s)
			}
			if len(headers) >= 100 {
				break
			}
		}
	} else if typed, ok := payload["headers"].([]string); ok {
		for _, h := range typed {
			h = strings.TrimSpace(h)
			if len(h) > 120 {
				h = h[:120]
			}
			if h != "" {
				headers = append(headers, h)
			}
			if len(headers) >= 100 {
				break
			}
		}
	}
	out["headers"] = headers

	headerSet := map[string]bool{}
	for _, h := range headers {
		headerSet[h] = true
	}
	columnMap := map[string]string{}
	if rawMap, ok := payload["column_map"].(map[string]any); ok {
		for _, field := range migEntityFields[kind] {
			if h := boundedString(rawMap[field], 120); h != "" && headerSet[h] {
				columnMap[field] = h
			}
		}
	} else if typed, ok := payload["column_map"].(map[string]string); ok {
		for _, field := range migEntityFields[kind] {
			if h, exists := typed[field]; exists {
				h = strings.TrimSpace(h)
				if len(h) > 120 {
					h = h[:120]
				}
				if h != "" && headerSet[h] {
					columnMap[field] = h
				}
			}
		}
	}
	out["column_map"] = columnMap

	if csvText, ok := payload["csv_text"].(string); ok {
		if len(csvText) > 32_000 {
			csvText = csvText[:32_000]
		}
		out["csv_text"] = csvText
	}
	if truncated, ok := payload["truncated"].(bool); ok {
		out["truncated"] = truncated
	}
	return out
}
