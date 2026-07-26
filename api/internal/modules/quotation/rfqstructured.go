package quotation

import (
	"regexp"
	"strings"
)

// RfqStructuredTable is a tabular sheet (Excel/CSV/Word table) sent from the client.
type RfqStructuredTable struct {
	Page    int        `json:"page"`
	Sheet   string     `json:"sheet,omitempty"`
	Headers []string   `json:"headers"`
	Rows    [][]string `json:"rows"`
}

var genericColumnHeader = regexp.MustCompile(`(?i)^column\s*\d+$`)

func ParseRfqStructuredTables(tables []RfqStructuredTable, opts RfqParseOptions) RfqParseResult {
	var out []ParsedRfqLine
	var detected []RfqDetectedColumn
	seen := map[string]struct{}{}
	lineNo := 0
	tableDetected := false

	for _, tbl := range tables {
		if len(tbl.Headers) < 2 || len(tbl.Rows) == 0 {
			continue
		}
		fields := fieldsForStructuredTable(tbl.Headers, opts)
		mapped := 0
		for _, f := range fields {
			if f != "" {
				mapped++
			}
		}
		if mapped < 2 {
			continue
		}
		tableDetected = true
		if len(detected) == 0 {
			for i, h := range tbl.Headers {
				if i >= len(fields) || fields[i] == "" {
					continue
				}
				detected = append(detected, RfqDetectedColumn{Index: i, Field: string(fields[i]), Label: h})
			}
		}

		for _, cells := range tbl.Rows {
			row := normalizeStructuredCells(tbl.Headers, cells)
			if !structuredRowIsData(row) {
				continue
			}
			parsed := parseStructuredRow(fields, row)
			if !parsed.ok {
				continue
			}
			parsed.line.Page = tbl.Page
			if tbl.Sheet != "" {
				parsed.line.Remarks = mergeSheetRemarks(parsed.line.Remarks, tbl.Sheet)
			}
			key := strings.ToLower(strings.TrimSpace(parsed.line.ItemCode + "|" + parsed.line.Description + "|" + parsed.line.Qty))
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			parsed.line.LineNo = lineNo
			parsed.line.Confidence = 0.95
			out = append(out, parsed.line)
		}
	}

	return RfqParseResult{Lines: out, TableDetected: tableDetected, DetectedColumns: detected}
}

func fieldsForStructuredTable(headers []string, opts RfqParseOptions) []rfqColumnField {
	fields := make([]rfqColumnField, len(headers))
	force := parseForceColumnFields(opts.ForceColumns)
	if len(force) >= 2 {
		for i := range headers {
			if i < len(force) {
				fields[i] = force[i]
			}
		}
		return fields
	}
	for i, h := range headers {
		fields[i] = matchStructuredHeader(h, i, opts.HeaderOverrides)
	}
	return fields
}

func matchStructuredHeader(header string, index int, overrides map[string]string) rfqColumnField {
	h := strings.TrimSpace(header)
	if genericColumnHeader.MatchString(h) {
		switch index {
		case 0:
			h = "Item"
		case 1:
			h = "Quantity"
		}
	}
	return matchColumnFieldWithOverride(h, overrides)
}

func normalizeStructuredCells(headers []string, cells []string) []string {
	n := len(headers)
	if n == 0 {
		n = len(cells)
	}
	out := make([]string, n)
	for i := 0; i < n; i++ {
		if i < len(cells) {
			out[i] = strings.TrimSpace(cells[i])
		}
	}
	return out
}

func structuredRowIsData(cells []string) bool {
	filled := 0
	for _, c := range cells {
		if strings.TrimSpace(c) != "" {
			filled++
		}
	}
	if filled == 0 {
		return false
	}
	joined := strings.Join(cells, " ")
	return !isTableFooterRow(joined)
}

func parseStructuredRow(fields []rfqColumnField, cells []string) rowParseResult {
	vals := map[rfqColumnField][]string{}
	for i, cell := range cells {
		if i >= len(fields) || fields[i] == "" {
			continue
		}
		cell = strings.TrimSpace(cell)
		if cell == "" {
			continue
		}
		vals[fields[i]] = append(vals[fields[i]], cell)
	}
	row := rfqTextRow{cells: cells}
	return finishRowParse(vals, row)
}

func finishRowParse(vals map[rfqColumnField][]string, row rfqTextRow) rowParseResult {
	join := func(f rfqColumnField) string {
		return strings.TrimSpace(strings.Join(vals[f], " "))
	}

	qtyRaw := join(colQty)
	qty := normalizeQty(qtyRaw)
	unit := strings.ToLower(join(colUnit))
	if qty == "" && strings.TrimSpace(qtyRaw) != "" {
		if q, u, ok := splitQtyUnitCell(qtyRaw); ok {
			qty = q
			if unit == "" {
				unit = u
			}
		}
	}
	line := ParsedRfqLine{
		ItemCode:    join(colItemCode),
		ItemName:    join(colItemName),
		Description: join(colDescription),
		Remarks:     join(colRemarks),
		Qty:         qty,
		Unit:        unit,
		UnitPrice:   normalizeMoney(join(colUnitPrice)),
		LineTotal:   normalizeMoney(join(colLineTotal)),
		Confidence:  0.95,
	}
	return finishRowParseFromLine(line, row)
}

func mergeSheetRemarks(existing, sheet string) string {
	sheet = strings.TrimSpace(sheet)
	if sheet == "" {
		return existing
	}
	tag := "Sheet: " + sheet
	if existing == "" {
		return tag
	}
	if strings.Contains(existing, tag) {
		return existing
	}
	return existing + " · " + tag
}

func mergeRfqParseResults(parts ...RfqParseResult) RfqParseResult {
	var out RfqParseResult
	seen := map[string]struct{}{}
	lineNo := 0
	for _, p := range parts {
		if p.TableDetected {
			out.TableDetected = true
		}
		if len(out.DetectedColumns) == 0 && len(p.DetectedColumns) > 0 {
			out.DetectedColumns = p.DetectedColumns
		}
		for _, ln := range p.Lines {
			key := strings.ToLower(strings.TrimSpace(ln.ItemCode + "|" + ln.Description + "|" + ln.Qty))
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			ln.LineNo = lineNo
			out.Lines = append(out.Lines, ln)
		}
	}
	return out
}
