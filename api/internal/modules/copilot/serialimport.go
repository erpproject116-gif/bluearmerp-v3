package copilot

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

const serialReceivePath = "/app/inventory/serial-lot/receive"

const maxSerialSeedRows = 500

// serialColumnAliases: normalized header key -> canonical column.
var serialColumnAliases = map[string]string{
	"serial":        "serial",
	"serial_no":     "serial",
	"serial_number": "serial",
	"serialno":      "serial",
	"sn":            "serial",
	"imei":          "serial",
	"lot":           "lot",
	"lot_no":        "lot",
	"lot_number":    "lot",
	"batch":         "lot",
	"batch_no":      "lot",
	"item_code":     "item_code",
	"item":          "item_code",
	"sku":           "item_code",
	"code":          "item_code",
	"qty":           "qty",
	"quantity":      "qty",
}

type serialSeedRow struct {
	Serial   string  `json:"serial,omitempty"`
	Lot      string  `json:"lot,omitempty"`
	ItemCode string  `json:"item_code,omitempty"`
	Qty      float64 `json:"qty,omitempty"`
}

// splitCSVLine splits one CSV line honoring simple quotes (same as csvHeaderCells).
func splitCSVLine(line string) []string {
	var cells []string
	var cur strings.Builder
	inQuotes := false
	for i := 0; i < len(line); i++ {
		c := line[i]
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
	return cells
}

// parseSerialLotCSV extracts serial/lot rows from attached text. With a
// recognizable header row it maps columns; otherwise every non-empty first
// cell is treated as a serial number (plain list paste).
func parseSerialLotCSV(text string) []serialSeedRow {
	text = firstSheetCSV(text)
	lines := strings.Split(text, "\n")
	var rows []serialSeedRow

	// Find the header row among the first few non-empty lines.
	headerIdx := -1
	colMap := map[int]string{} // cell index -> canonical column
	seen := 0
	for i, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		seen++
		if seen > 5 {
			break
		}
		cells := splitCSVLine(line)
		m := map[int]string{}
		for idx, cell := range cells {
			if canon, ok := serialColumnAliases[normalizeHeaderKey(cell)]; ok {
				if _, dup := m[idx]; !dup {
					m[idx] = canon
				}
			}
		}
		hasSerialOrLot := false
		for _, canon := range m {
			if canon == "serial" || canon == "lot" {
				hasSerialOrLot = true
			}
		}
		if hasSerialOrLot {
			headerIdx = i
			colMap = m
			break
		}
	}

	if headerIdx < 0 {
		// Plain list: one serial per line (first cell).
		for _, line := range lines {
			cells := splitCSVLine(line)
			if len(cells) == 0 {
				continue
			}
			serial := strings.TrimSpace(cells[0])
			if serial == "" || strings.Contains(serial, "…[truncated]") {
				continue
			}
			if len(serial) > 120 {
				serial = serial[:120]
			}
			rows = append(rows, serialSeedRow{Serial: serial})
			if len(rows) >= maxSerialSeedRows {
				break
			}
		}
		return rows
	}

	for _, line := range lines[headerIdx+1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		cells := splitCSVLine(line)
		var row serialSeedRow
		for idx, canon := range colMap {
			if idx >= len(cells) {
				continue
			}
			val := strings.TrimSpace(cells[idx])
			if val == "" || strings.Contains(val, "…[truncated]") {
				continue
			}
			switch canon {
			case "serial":
				if len(val) > 120 {
					val = val[:120]
				}
				row.Serial = val
			case "lot":
				if len(val) > 120 {
					val = val[:120]
				}
				row.Lot = val
			case "item_code":
				if len(val) > 100 {
					val = val[:100]
				}
				row.ItemCode = val
			case "qty":
				if f, ok := toFloat(val); ok && f > 0 {
					row.Qty = f
				}
			}
		}
		if row.Serial == "" && row.Lot == "" {
			continue
		}
		rows = append(rows, row)
		if len(rows) >= maxSerialSeedRows {
			break
		}
	}
	return rows
}

// toolProposeSerialLotImport builds an approve-to-act draft that stages a
// proposed serial/lot list into the Serial & Lot receive capture UI.
// No serial, lot, or stock row is created by Approve.
func toolProposeSerialLotImport(tu auth.TenantUser, args map[string]any) toolResult {
	if !tu.HasPermission("inventory.serial_receive", auth.AccessRead) {
		return toolResult{Name: "propose_serial_lot_import", Denied: true, Error: "Missing inventory.serial_receive permission."}
	}
	fileName := boundedString(args["file_name"], 240)
	csvText, _ := args["csv_text"].(string)
	if strings.TrimSpace(csvText) == "" {
		return toolResult{
			Name: "propose_serial_lot_import", OK: false,
			Error: "Attach a CSV or spreadsheet with a serial (and optional lot / item_code / qty) column, then ask again.",
		}
	}
	rows := parseSerialLotCSV(csvText)
	if len(rows) == 0 {
		return toolResult{
			Name: "propose_serial_lot_import", OK: false,
			Error: "No serial or lot values were found in the attachment. Expected a serial/lot column or one serial per line.",
		}
	}
	serialCount, lotCount := 0, 0
	for _, r := range rows {
		if r.Serial != "" {
			serialCount++
		}
		if r.Lot != "" {
			lotCount++
		}
	}
	encoded, _ := json.Marshal(rows)
	var rawRows []any
	_ = json.Unmarshal(encoded, &rawRows)
	payload := map[string]any{
		"file_name":    fileName,
		"rows":         rawRows,
		"serial_count": serialCount,
		"lot_count":    lotCount,
	}
	summary := fmt.Sprintf(
		"Stage %d serial(s)%s from %q into Serial & Lot → Receive. Approve opens the capture screen with the list staged; nothing is registered until you confirm there.",
		serialCount,
		map[bool]string{true: fmt.Sprintf(" and %d lot value(s)", lotCount), false: ""}[lotCount > 0],
		fileName,
	)
	draft := &actionDraft{
		Type:    "propose_serial_lot_import",
		Summary: summary,
		API:     "/api/v1/goods-receipt",
		Method:  "POST",
		Payload: payload,
	}
	raw, _ := json.Marshal(map[string]any{
		"draft": map[string]any{
			"type": draft.Type, "summary": summary,
			"serial_count": serialCount, "lot_count": lotCount,
		},
	})
	return toolResult{
		Name:        "propose_serial_lot_import",
		OK:          true,
		Data:        raw,
		ActionDraft: draft,
		DeepLinks:   []deepLink{{Label: "Serial & Lot — Receive", Href: serialReceivePath}},
	}
}

// sanitizeSerialLotPayload keeps only bounded serial/lot rows and counters.
func sanitizeSerialLotPayload(payload map[string]any) map[string]any {
	out := map[string]any{
		"file_name": boundedString(payload["file_name"], 240),
	}
	var rows []any
	if rawRows, ok := payload["rows"].([]any); ok {
		for _, raw := range rawRows {
			m, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			row := map[string]any{}
			if s := boundedString(m["serial"], 120); s != "" {
				row["serial"] = s
			}
			if s := boundedString(m["lot"], 120); s != "" {
				row["lot"] = s
			}
			if s := boundedString(m["item_code"], 100); s != "" {
				row["item_code"] = s
			}
			if f, ok := toFloat(m["qty"]); ok && f > 0 {
				row["qty"] = f
			}
			if _, hasSerial := row["serial"]; !hasSerial {
				if _, hasLot := row["lot"]; !hasLot {
					continue
				}
			}
			rows = append(rows, row)
			if len(rows) >= maxSerialSeedRows {
				break
			}
		}
	}
	out["rows"] = rows
	serialCount, lotCount := 0, 0
	for _, raw := range rows {
		m := raw.(map[string]any)
		if _, ok := m["serial"]; ok {
			serialCount++
		}
		if _, ok := m["lot"]; ok {
			lotCount++
		}
	}
	out["serial_count"] = serialCount
	out["lot_count"] = lotCount
	return out
}
