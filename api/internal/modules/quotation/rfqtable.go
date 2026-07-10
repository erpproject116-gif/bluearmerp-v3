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
	colItemName:    {"item", "item name", "product", "product name", "material", "material name", "name", "equipment"},
	colDescription: {"description", "desc", "specification", "specifications", "technical specifications", "spec", "specs", "details", "item description", "requirements"},
	colRemarks:     {"remarks", "remark", "notes", "note", "comment", "comments", "for reference only", "reference", "reference link"},
	colQty:         {"qty", "quantity", "q'ty", "q ty"},
	colUnit:        {"unit", "uom", "u/m", "um"},
	colUnitPrice:   {"unit price", "price", "rate", "unit cost", "cost", "cost per unit", "u/p", "up", "budget", "estimated cost", "reference price"},
	colLineTotal:   {"amount", "total", "line total", "extended", "ext price", "ext. price", "sub total", "subtotal", "total cost"},
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
	lines, _ := ParseRfqLayoutPagesWithOptions(pages, RfqParseOptions{})
	return lines
}

func schemaToDetectedColumns(schema []rfqColumnSlot, header rfqTextRow) []RfqDetectedColumn {
	out := make([]RfqDetectedColumn, len(schema))
	for i, slot := range schema {
		label := string(slot.field)
		if i < len(header.cells) {
			label = header.cells[i]
		}
		out[i] = RfqDetectedColumn{Index: i, Field: string(slot.field), Label: label}
	}
	return out
}

// ParseRfqLayoutPagesWithOptions extracts lines and returns detected column mapping when found.
func ParseRfqLayoutPagesWithOptions(pages []RfqPageInput, opts RfqParseOptions) ([]ParsedRfqLine, []RfqDetectedColumn) {
	var out []ParsedRfqLine
	var schema []rfqColumnSlot
	var detected []RfqDetectedColumn
	var headerRow rfqTextRow
	seen := map[string]struct{}{}
	lineNo := 0
	forceFields := parseForceColumnFields(opts.ForceColumns)

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
			headerIdx = findHeaderRowIndexWithOverrides(rows, opts.HeaderOverrides)
			if headerIdx >= 0 {
				headerRow = rows[headerIdx]
				if len(forceFields) > 0 {
					schema = buildForcedColumnSchema(headerRow, forceFields, page.Width)
				} else {
					schema = buildColumnSchemaWithOverrides(headerRow, page.Width, opts.HeaderOverrides)
				}
				if len(schema) > 0 {
					detected = schemaToDetectedColumns(schema, headerRow)
				}
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
	return out, detected
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
	return buildColumnSchemaWithOverrides(header, pageWidth, nil)
}

func buildColumnSchemaWithOverrides(header rfqTextRow, pageWidth float64, overrides map[string]string) []rfqColumnSlot {
	// Map each header word/cell to a field and X range.
	type hdrPiece struct {
		field rfqColumnField
		xMin  float64
		xMax  float64
	}
	var pieces []hdrPiece

	if len(header.words) >= 2 {
		for _, w := range header.words {
			f := matchColumnFieldWithOverride(w.Text, overrides)
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
			f := matchColumnFieldWithOverride(cell, overrides)
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

func matchColumnFieldWithOverride(token string, overrides map[string]string) rfqColumnField {
	t := normalizeHeaderToken(token)
	if t != "" && len(overrides) > 0 {
		for k, v := range overrides {
			if normalizeHeaderToken(k) == t {
				return rfqColumnField(strings.TrimSpace(strings.ToLower(v)))
			}
		}
	}
	// Bare "item" on RFQ spreadsheets is usually the product label, not a SKU column.
	if t == "item" {
		return colItemName
	}
	return matchColumnField(token)
}

func parseForceColumnFields(fields []string) []rfqColumnField {
	if len(fields) == 0 {
		return nil
	}
	out := make([]rfqColumnField, 0, len(fields))
	for _, f := range fields {
		f = strings.TrimSpace(strings.ToLower(f))
		if f == "" {
			continue
		}
		out = append(out, rfqColumnField(f))
	}
	return out
}

func buildForcedColumnSchema(header rfqTextRow, fields []rfqColumnField, pageWidth float64) []rfqColumnSlot {
	if len(fields) < 2 {
		return nil
	}
	bounds := forcedColumnBounds(header, len(fields), pageWidth)
	slots := make([]rfqColumnSlot, len(fields))
	for i, f := range fields {
		xMin := bounds[i]
		xMax := bounds[i+1]
		if i == 0 {
			xMin -= 8
		}
		if i+1 == len(fields) {
			xMax += 8
		}
		slots[i] = rfqColumnSlot{field: f, xMin: xMin, xMax: xMax}
	}
	return slots
}

func forcedColumnBounds(header rfqTextRow, nCols int, pageWidth float64) []float64 {
	bounds := make([]float64, nCols+1)
	bounds[0] = 0
	bounds[nCols] = pageWidth
	if len(header.words) < 2 {
		cellW := pageWidth / float64(nCols)
		for i := 1; i < nCols; i++ {
			bounds[i] = cellW * float64(i)
		}
		return bounds
	}
	sorted := append([]RfqWord(nil), header.words...)
	for i := 0; i < len(sorted); i++ {
		for j := i + 1; j < len(sorted); j++ {
			if sorted[j].X < sorted[i].X {
				sorted[i], sorted[j] = sorted[j], sorted[i]
			}
		}
	}
	if len(sorted) <= nCols {
		for i := 1; i < nCols; i++ {
			if i < len(sorted) {
				bounds[i] = sorted[i].X - 4
			} else {
				bounds[i] = pageWidth * float64(i) / float64(nCols)
			}
		}
		return bounds
	}
	// Split header words into nCols consecutive groups; internal bounds are midpoints between groups.
	groupSize := float64(len(sorted)) / float64(nCols)
	for i := 1; i < nCols; i++ {
		leftLast := int(math.Min(float64(len(sorted)-1), math.Ceil(groupSize*float64(i))-1))
		rightFirst := int(math.Min(float64(len(sorted)-1), math.Ceil(groupSize*float64(i))))
		if leftLast < 0 {
			leftLast = 0
		}
		if rightFirst <= leftLast {
			rightFirst = leftLast + 1
		}
		if rightFirst >= len(sorted) {
			rightFirst = len(sorted) - 1
		}
		leftX := sorted[leftLast].X + sorted[leftLast].W
		rightX := sorted[rightFirst].X
		if rightX <= leftX {
			rightX = leftX + 8
		}
		bounds[i] = (leftX + rightX) / 2
	}
	return bounds
}

func countHeaderCellsWithOverrides(row rfqTextRow, overrides map[string]string) int {
	n := 0
	for _, cell := range row.cells {
		if matchColumnFieldWithOverride(cell, overrides) != "" {
			n++
		}
	}
	return n
}

func findHeaderRowIndexWithOverrides(rows []rfqTextRow, overrides map[string]string) int {
	bestIdx := -1
	bestHits := 0
	for i, row := range rows {
		if i > 25 {
			break
		}
		hits := 0
		for _, cell := range row.cells {
			if matchColumnFieldWithOverride(cell, overrides) != "" {
				hits++
			}
		}
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
	return finishRowParseFromLine(line, row)
}

func finishRowParseFromLine(line ParsedRfqLine, row rfqTextRow) rowParseResult {
	if line.ItemName != "" && line.Description == "" {
		line.Description = line.ItemName
	}
	if line.Description != "" && line.ItemName == "" {
		line.ItemName = line.Description
	}

	if line.ItemCode == "" && line.Description == "" && line.ItemName == "" {
		return rowParseResult{ok: false}
	}
	joined := strings.Join(row.cells, " ")
	if line.ItemCode == "" && len(line.Description) > 55 && !containsDigit(joined) {
		return rowParseResult{ok: false}
	}
	if line.Qty == "" {
		if line.ItemCode != "" || len(strings.TrimSpace(line.Description)) >= 4 {
			line.Qty = "1"
		} else {
			return rowParseResult{ok: false}
		}
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
	if len(row.cells) == 1 && len(line) > 80 {
		return true
	}
	if len(schema) > 0 && len(row.cells) == 1 && !containsDigit(line) {
		return true
	}
	if len(row.cells) >= 2 && !containsDigit(line) {
		filled := 0
		for _, c := range row.cells {
			if strings.TrimSpace(c) != "" {
				filled++
			}
		}
		if filled <= 1 && len(line) > 45 {
			return true
		}
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

type RfqParseOptions struct {
	// ForceColumns maps table columns left-to-right to field names (item_code, qty, description, …).
	ForceColumns []string `json:"force_columns,omitempty"`
	// HeaderOverrides maps a header cell label to a field name before synonym matching.
	HeaderOverrides map[string]string `json:"header_overrides,omitempty"`
}

type RfqDetectedColumn struct {
	Index  int    `json:"index"`
	Field  string `json:"field"`
	Label  string `json:"label"`
}

type RfqParseResult struct {
	Lines           []ParsedRfqLine
	TableDetected   bool
	DetectedColumns []RfqDetectedColumn
}

// ParseRfqDocument tries table layout parsing first, then plain-text regex fallback.
func ParseRfqDocument(pages []RfqPageInput) []ParsedRfqLine {
	return ParseRfqDocumentWithOptions(pages, RfqParseOptions{}).Lines
}

func ParseRfqDocumentWithOptions(pages []RfqPageInput, opts RfqParseOptions) RfqParseResult {
	layout, cols := ParseRfqLayoutPagesWithOptions(pages, opts)
	if len(layout) > 0 {
		return RfqParseResult{Lines: layout, TableDetected: true, DetectedColumns: cols}
	}
	var plain []struct {
		Page int
		Text string
	}
	for _, p := range pages {
		wc := len(p.Words)
		kind := classifyRfqPageText(p.Text, wc)
		text := p.Text
		if text == "" && len(p.Words) > 0 {
			var b strings.Builder
			rows := groupWordsIntoRows(p.Words)
			for ri, row := range rows {
				if ri > 0 {
					b.WriteByte('\n')
				}
				b.WriteString(strings.Join(row.cells, " "))
			}
			text = b.String()
		}
		if strings.TrimSpace(text) == "" {
			continue
		}
		parseable := pageTextHasParseableLines(text)
		if kind == rfqPageSkip && !parseable {
			continue
		}
		if kind != rfqPageTable && scoreRfqPageTable(text, wc) < 28 && !parseable {
			continue
		}
		plain = append(plain, struct {
			Page int
			Text string
		}{Page: p.Page, Text: text})
	}
	if len(plain) == 0 {
		return RfqParseResult{}
	}
	return RfqParseResult{Lines: ParseRfqPages(plain), TableDetected: false}
}

// parseRfqDocumentLayoutOnly runs table layout parsing without plain-text regex fallback.
func parseRfqDocumentLayoutOnly(pages []RfqPageInput, opts RfqParseOptions) RfqParseResult {
	layout, cols := ParseRfqLayoutPagesWithOptions(pages, opts)
	if len(layout) == 0 {
		return RfqParseResult{}
	}
	return RfqParseResult{Lines: layout, TableDetected: true, DetectedColumns: cols}
}
