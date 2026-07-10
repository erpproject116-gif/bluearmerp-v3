package quotation

import (
	"math"
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// RfqWord is one OCR/PDF text fragment with bounding box (top-left origin).
type RfqWord struct {
	Text string  `json:"text"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
}

// RfqPageInput is one page sent from the client OCR layer.
type RfqPageInput struct {
	Page   int       `json:"page"`
	Text   string    `json:"text"`
	Words  []RfqWord `json:"words"`
	Width  float64   `json:"width"`
	Height float64   `json:"height"`
}

type rfqColumnField string

const (
	colLineNo      rfqColumnField = "line_no"
	colItemCode    rfqColumnField = "item_code"
	colItemName    rfqColumnField = "item_name"
	colDescription rfqColumnField = "description"
	colRemarks     rfqColumnField = "remarks"
	colQty         rfqColumnField = "qty"
	colUnit        rfqColumnField = "unit"
	colUnitPrice   rfqColumnField = "unit_price"
	colLineTotal   rfqColumnField = "line_total"
)

var rfqColumnSynonyms = map[rfqColumnField][]string{
	colLineNo:      {"no", "no.", "#", "line", "item no", "item no.", "s/n", "sn", "line no", "line no."},
	colItemCode:    {"item", "item code", "code", "sku", "part no", "part no.", "part number", "catalog", "material code", "item #", "product code"},
	colItemName:    {"item name", "product", "product name", "material", "material name", "name"},
	colDescription: {"description", "desc", "specification", "spec", "specs", "details", "item description"},
	colRemarks:     {"remarks", "remark", "notes", "note", "comment", "comments"},
	colQty:         {"qty", "quantity", "q'ty", "q ty"},
	colUnit:        {"unit", "uom", "u/m", "um"},
	colUnitPrice:   {"unit price", "price", "rate", "unit cost", "cost", "u/p", "up"},
	colLineTotal:   {"amount", "total", "line total", "extended", "ext price", "ext. price", "sub total", "subtotal"},
}

var rfqTableFooter = regexp.MustCompile(`(?i)^(grand\s+total|sub\s*total|subtotal|total\s+amount|total\s*:?|amount\s+due|approved\s+by|prepared\s+by|signature|vat|tax\s+total|net\s+total)`)

type rfqTextRow struct {
	y     float64
	cells []string
	words []RfqWord
}

type rfqColumnSlot struct {
	field rfqColumnField
	xMin  float64
	xMax  float64
}

// ParseRfqLayoutPages extracts line items from positioned words (table-first).
func ParseRfqLayoutPages(pages []RfqPageInput) []ParsedRfqLine {
	var out []ParsedRfqLine
	var schema []rfqColumnSlot
	seen := map[string]struct{}{}
	lineNo := 0

	for _, page := range pages {
		if len(page.Words) < 2 {
			continue
		}
		if len(schema) == 0 && len(page.Words) < 6 {
			continue
		}
		rows := groupWordsIntoRows(page.Words)
		minRows := 1
		if len(schema) == 0 {
			minRows = 2
		}
		if len(rows) < minRows {
			continue
		}

		headerIdx := -1
		if len(schema) == 0 {
			headerIdx = findHeaderRowIndex(rows)
			if headerIdx >= 0 {
				schema = buildColumnSchema(rows[headerIdx], page.Width)
			}
		}

		startIdx := 0
		if headerIdx >= 0 {
			startIdx = headerIdx + 1
		} else if len(schema) > 0 {
			// Continuation page: skip repeated header only when cells are header labels.
			if idx := findHeaderRowIndex(rows); idx >= 0 && countHeaderCells(rows[idx]) >= 2 {
				startIdx = idx + 1
			}
		} else {
			continue
		}

		if len(schema) == 0 {
			continue
		}

		for i := startIdx; i < len(rows); i++ {
			row := rows[i]
			lineText := strings.Join(row.cells, " ")
			if isTableFooterRow(lineText) {
				break
			}
			if isLikelyNonTableRow(row, schema) {
				continue
			}
			parsed := rowToLine(row, schema)
			if !parsed.ok {
				continue
			}
			parsed.line.Page = page.Page
			key := strings.ToLower(strings.TrimSpace(parsed.line.ItemCode + "|" + parsed.line.Description + "|" + parsed.line.Qty))
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			parsed.line.LineNo = lineNo
			out = append(out, parsed.line)
		}
	}
	return out
}

func groupWordsIntoRows(words []RfqWord) []rfqTextRow {
	if len(words) == 0 {
		return nil
	}
	sorted := append([]RfqWord(nil), words...)
	for i := range sorted {
		sorted[i].Text = strings.TrimSpace(sorted[i].Text)
	}
	// Sort by Y then X.
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].Y < sorted[i].Y || (math.Abs(sorted[j].Y-sorted[i].Y) < 4 && sorted[j].X < sorted[i].X) {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}

	avgH := sorted[0].H
	for _, w := range sorted {
		if w.H > 0 {
			avgH = (avgH + w.H) / 2
		}
	}
	tol := math.Max(6, avgH*0.55)

	var rows []rfqTextRow
	var cur []RfqWord
	curY := sorted[0].Y

	flush := func() {
		if len(cur) == 0 {
			return
		}
		for i := 0; i < len(cur); i++ {
			for j := i + 1; j < len(cur); j++ {
				if cur[j].X < cur[i].X {
					cur[i], cur[j] = cur[j], cur[i]
				}
			}
		}
		cells := make([]string, len(cur))
		for i, w := range cur {
			cells[i] = w.Text
		}
		rows = append(rows, rfqTextRow{y: curY, cells: cells, words: append([]RfqWord(nil), cur...)})
		cur = nil
	}

	for _, w := range sorted {
		if w.Text == "" {
			continue
		}
		if len(cur) > 0 && math.Abs(w.Y-curY) > tol {
			flush()
			curY = w.Y
		}
		if len(cur) == 0 {
			curY = w.Y
		}
		cur = append(cur, w)
	}
	flush()
	return rows
}

func normalizeHeaderToken(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.Trim(s, ".,;:/\\")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return s
}

func matchColumnField(token string) rfqColumnField {
	t := normalizeHeaderToken(token)
	if t == "" {
		return ""
	}
	best := rfqColumnField("")
	bestScore := 0.0
	for field, syns := range rfqColumnSynonyms {
		for _, syn := range syns {
			if t == syn {
				return field
			}
			if strings.Contains(t, syn) || strings.Contains(syn, t) {
				score := float64(len(syn)) / float64(max(len(t), len(syn)))
				if score > bestScore {
					bestScore = score
					best = field
				}
			}
		}
	}
	if bestScore >= 0.5 {
		return best
	}
	return ""
}

func countHeaderCells(row rfqTextRow) int {
	n := 0
	for _, cell := range row.cells {
		if matchColumnField(cell) != "" {
			n++
		}
	}
	return n
}

func findHeaderRowIndex(rows []rfqTextRow) int {
	bestIdx := -1
	bestHits := 0
	for i, row := range rows {
		if i > 25 {
			break
		}
		hits := 0
		for _, cell := range row.cells {
			if matchColumnField(cell) != "" {
				hits++
			}
		}
		// Also try joined header (single cell "Item Code Qty Description").
		if hits == 0 && len(row.cells) >= 2 {
			joined := normalizeHeaderToken(strings.Join(row.cells, " "))
			if len(joined) <= 48 {
				for _, syns := range rfqColumnSynonyms {
					for _, syn := range syns {
						if len(syn) < 3 {
							continue
						}
						if strings.Contains(joined, syn) {
							hits++
							break
						}
					}
				}
			}
		}
		if hits > bestHits && hits >= 2 {
			bestHits = hits
			bestIdx = i
		}
	}
	return bestIdx
}

func buildColumnSchema(header rfqTextRow, pageWidth float64) []rfqColumnSlot {
	// Map each header word/cell to a field and X range.
	type hdrPiece struct {
		field rfqColumnField
		xMin  float64
		xMax  float64
	}
	var pieces []hdrPiece

	if len(header.words) >= 2 {
		for _, w := range header.words {
			f := matchColumnField(w.Text)
			if f == "" {
				continue
			}
			pieces = append(pieces, hdrPiece{field: f, xMin: w.X, xMax: w.X + w.W})
		}
	}
	if len(pieces) < 2 {
		// Fall back to splitting header row cells evenly by count.
		n := float64(len(header.cells))
		cellW := pageWidth / math.Max(n, 1)
		for i, cell := range header.cells {
			f := matchColumnField(cell)
			if f == "" {
				continue
			}
			xMin := cellW * float64(i)
			xMax := cellW * float64(i+1)
			pieces = append(pieces, hdrPiece{field: f, xMin: xMin, xMax: xMax})
		}
	}
	if len(pieces) < 2 {
		return nil
	}

	// Sort pieces by X and expand gaps to midpoints.
	for i := 0; i < len(pieces); i++ {
		for j := i + 1; j < len(pieces); j++ {
			if pieces[j].xMin < pieces[i].xMin {
				pieces[i], pieces[j] = pieces[j], pieces[i]
			}
		}
	}
	slots := make([]rfqColumnSlot, len(pieces))
	for i, p := range pieces {
		xMin := p.xMin - 8
		xMax := p.xMax + 8
		if i > 0 {
			mid := (pieces[i-1].xMax + p.xMin) / 2
			xMin = mid
		}
		if i+1 < len(pieces) {
			mid := (p.xMax + pieces[i+1].xMin) / 2
			xMax = mid
		}
		slots[i] = rfqColumnSlot{field: p.field, xMin: xMin, xMax: xMax}
	}
	return slots
}

type rowParseResult struct {
	line ParsedRfqLine
	ok   bool
}

func rowToLine(row rfqTextRow, schema []rfqColumnSlot) rowParseResult {
	vals := map[rfqColumnField][]string{}
	for _, w := range row.words {
		cx := w.X + w.W/2
		for _, slot := range schema {
			if cx >= slot.xMin && cx <= slot.xMax {
				vals[slot.field] = append(vals[slot.field], w.Text)
				break
			}
		}
	}
	// If words didn't assign well, fall back to cell index mapping.
	if len(row.words) == 0 || countAssigned(vals) < 2 {
		for i, cell := range row.cells {
			if i >= len(schema) {
				break
			}
			f := schema[i].field
			vals[f] = append(vals[f], cell)
		}
	}

	join := func(f rfqColumnField) string {
		return strings.TrimSpace(strings.Join(vals[f], " "))
	}

	line := ParsedRfqLine{
		ItemCode:    join(colItemCode),
		ItemName:    join(colItemName),
		Description: join(colDescription),
		Remarks:     join(colRemarks),
		Qty:         normalizeQty(join(colQty)),
		Unit:        strings.ToLower(join(colUnit)),
		UnitPrice:   normalizeMoney(join(colUnitPrice)),
		LineTotal:   normalizeMoney(join(colLineTotal)),
		Confidence:  0.88,
	}
	if line.ItemName != "" && line.Description == "" {
		line.Description = line.ItemName
	}
	if line.Description != "" && line.ItemName == "" {
		line.ItemName = line.Description
	}

	if line.ItemCode == "" && line.Description == "" {
		return rowParseResult{ok: false}
	}
	if line.Qty == "" {
		line.Qty = "1"
	}
	if line.ItemCode == "" && looksLikeItemCode(firstCell(row)) {
		line.ItemCode = firstCell(row)
	}
	// Drop header-like rows that slipped through.
	if matchColumnField(line.Description) != "" && line.Qty == "1" && line.ItemCode == "" {
		return rowParseResult{ok: false}
	}
	return rowParseResult{line: line, ok: true}
}

func countAssigned(vals map[rfqColumnField][]string) int {
	n := 0
	for _, v := range vals {
		if strings.TrimSpace(strings.Join(v, " ")) != "" {
			n++
		}
	}
	return n
}

func firstCell(row rfqTextRow) string {
	if len(row.cells) == 0 {
		return ""
	}
	return strings.TrimSpace(row.cells[0])
}

func looksLikeItemCode(s string) bool {
	s = strings.TrimSpace(s)
	if len(s) < 2 || len(s) > 40 {
		return false
	}
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '_' || r == '.' || r == '/' {
			continue
		}
		return false
	}
	return true
}

func isTableFooterRow(line string) bool {
	line = strings.TrimSpace(line)
	if line == "" {
		return false
	}
	return rfqTableFooter.MatchString(line)
}

func isLikelyNonTableRow(row rfqTextRow, schema []rfqColumnSlot) bool {
	line := strings.Join(row.cells, " ")
	if isRfqNoiseLine(normalizeRfqLine(line)) {
		return true
	}
	// Cover page paragraphs: one long cell, no numeric qty column.
	if len(row.cells) == 1 && len(line) > 80 {
		return true
	}
	if len(schema) > 0 && len(row.cells) == 1 && !containsDigit(line) {
		return true
	}
	return false
}

func containsDigit(s string) bool {
	for _, r := range s {
		if unicode.IsDigit(r) {
			return true
		}
	}
	return false
}

func normalizeQty(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ",", "")
	if s == "" {
		return ""
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil || f <= 0 {
		return ""
	}
	if f == math.Trunc(f) {
		return strconv.FormatInt(int64(f), 10)
	}
	return strconv.FormatFloat(f, 'f', -1, 64)
}

func normalizeMoney(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, "₱", "")
	s = strings.ReplaceAll(s, "PHP", "")
	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, ",", "")
	s = strings.TrimSpace(s)
	if f, err := strconv.ParseFloat(s, 64); err == nil && f >= 0 {
		if f == math.Trunc(f) {
			return strconv.FormatInt(int64(f), 10)
		}
		return strconv.FormatFloat(f, 'f', 2, 64)
	}
	return ""
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// ParseRfqDocument tries table layout parsing first, then plain-text regex fallback.
func ParseRfqDocument(pages []RfqPageInput) []ParsedRfqLine {
	layout := ParseRfqLayoutPages(pages)
	if len(layout) > 0 {
		return layout
	}
	plain := make([]struct {
		Page int
		Text string
	}, len(pages))
	for i, p := range pages {
		plain[i].Page = p.Page
		plain[i].Text = p.Text
		if plain[i].Text == "" && len(p.Words) > 0 {
			var b strings.Builder
			rows := groupWordsIntoRows(p.Words)
			for ri, row := range rows {
				if ri > 0 {
					b.WriteByte('\n')
				}
				b.WriteString(strings.Join(row.cells, " "))
			}
			plain[i].Text = b.String()
		}
	}
	return ParseRfqPages(plain)
}
