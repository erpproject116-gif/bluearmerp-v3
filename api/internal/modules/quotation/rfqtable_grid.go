package quotation

import (
	"math"
	"regexp"
	"strings"
)

var rfqMoneyCell = regexp.MustCompile(`(?i)^(?:₱|\$|php\s*)?\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?$`)

// mergeNearbyWords joins fragments on the same line (common with pdf.js / plain-text PDF extraction).
func mergeNearbyWords(words []RfqWord) []RfqWord {
	if len(words) < 2 {
		return words
	}
	sorted := append([]RfqWord(nil), words...)
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
	rowTol := math.Max(6, avgH*0.55)
	gapTol := math.Max(4, avgH*0.35)

	var out []RfqWord
	for _, w := range sorted {
		t := strings.TrimSpace(w.Text)
		if t == "" {
			continue
		}
		w.Text = t
		if len(out) > 0 {
			last := &out[len(out)-1]
			sameRow := math.Abs(w.Y-last.Y) <= rowTol
			gap := w.X - (last.X + last.W)
			if sameRow && gap >= -1 && gap <= gapTol {
				if gap > math.Max(3, gapTol*0.6) {
					last.Text += " " + w.Text
				} else {
					last.Text += w.Text
				}
				last.W = (w.X + w.W) - last.X
				if w.H > last.H {
					last.H = w.H
				}
				continue
			}
		}
		out = append(out, w)
	}
	return out
}

func defaultFieldsForColumnCount(n int) []rfqColumnField {
	switch n {
	case 3:
		return []rfqColumnField{colDescription, colQty, colUnitPrice}
	case 4:
		return []rfqColumnField{colLineNo, colDescription, colQty, colUnitPrice}
	case 5:
		return []rfqColumnField{colLineNo, colItemCode, colDescription, colQty, colUnitPrice}
	case 6:
		return []rfqColumnField{colLineNo, colItemCode, colDescription, colQty, colUnit, colUnitPrice}
	case 7:
		return []rfqColumnField{colLineNo, colItemCode, colDescription, colQty, colUnit, colUnitPrice, colLineTotal}
	default:
		if n < 3 {
			return nil
		}
		fields := make([]rfqColumnField, n)
		fields[0] = colLineNo
		fields[n-1] = colUnitPrice
		if n >= 4 {
			fields[n-2] = colQty
		}
		for i := 1; i < n-2; i++ {
			fields[i] = colDescription
		}
		return fields
	}
}

func modeColumnCount(rows []rfqTextRow, minCols int) int {
	counts := map[int]int{}
	for _, row := range rows {
		n := len(row.cells)
		if n < minCols {
			continue
		}
		filled := 0
		for _, c := range row.cells {
			if strings.TrimSpace(c) != "" {
				filled++
			}
		}
		if filled < minCols {
			continue
		}
		counts[n]++
	}
	bestN, bestC := 0, 0
	for n, c := range counts {
		if c > bestC || (c == bestC && n > bestN) {
			bestN, bestC = n, c
		}
	}
	if bestC < 2 {
		return 0
	}
	return bestN
}

func inferFieldsFromSampleRows(rows []rfqTextRow, nCols int, overrides map[string]string) []rfqColumnField {
	fields := defaultFieldsForColumnCount(nCols)
	if len(fields) != nCols {
		return fields
	}
	// Heuristic: column with mostly money → unit_price; mostly small ints → qty.
	type colStat struct{ money, qty, code int }
	stats := make([]colStat, nCols)
	for _, row := range rows {
		if len(row.cells) != nCols {
			continue
		}
		for i, cell := range row.cells {
			cell = strings.TrimSpace(cell)
			if cell == "" {
				continue
			}
			if rfqMoneyCell.MatchString(cell) || normalizeMoney(cell) != "" {
				stats[i].money++
			}
			if q := normalizeQty(cell); q != "" {
				stats[i].qty++
			}
			if looksLikeItemCode(cell) {
				stats[i].code++
			}
		}
	}
	for i, st := range stats {
		if st.money >= 2 && fields[i] == colDescription {
			fields[i] = colUnitPrice
		}
		if st.qty >= 2 && fields[i] == colDescription {
			fields[i] = colQty
		}
		if st.code >= 2 && fields[i] == colDescription {
			fields[i] = colItemCode
		}
	}
	return fields
}

func findBestDataHeaderRow(rows []rfqTextRow, nCols int) (int, rfqTextRow) {
	modeCols := modeColumnCount(rows, nCols)
	if modeCols < nCols {
		modeCols = nCols
	}
	for i, row := range rows {
		if i > 40 {
			break
		}
		if len(row.cells) < nCols {
			continue
		}
		if countHeaderCells(row) >= 2 {
			return i, row
		}
	}
	for i, row := range rows {
		if i > 40 {
			break
		}
		if len(row.cells) >= nCols {
			return i, row
		}
	}
	return -1, rfqTextRow{}
}

func buildEqualWidthSchema(fields []rfqColumnField, pageWidth float64) []rfqColumnSlot {
	if len(fields) < 2 || pageWidth <= 0 {
		pageWidth = 612
	}
	n := float64(len(fields))
	cellW := pageWidth / n
	slots := make([]rfqColumnSlot, len(fields))
	for i, f := range fields {
		xMin := cellW * float64(i)
		xMax := cellW * float64(i+1)
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

// inferGridSchemaFromRows builds a column schema when header synonyms fail but rows look tabular.
func inferGridSchemaFromRows(rows []rfqTextRow, pageWidth float64, overrides map[string]string) ([]rfqColumnSlot, int, []RfqDetectedColumn) {
	modeCols := modeColumnCount(rows, 3)
	if modeCols < 3 {
		return nil, -1, nil
	}
	headerIdx := -1
	bestHits := 0
	for i, row := range rows {
		if i > 30 || len(row.cells) != modeCols {
			continue
		}
		hits := countHeaderCellsWithOverrides(row, overrides)
		if hits > bestHits && hits >= 2 {
			bestHits = hits
			headerIdx = i
		}
	}
	var fields []rfqColumnField
	startIdx := 0
	var header rfqTextRow
	if headerIdx >= 0 {
		header = rows[headerIdx]
		fields = make([]rfqColumnField, len(header.cells))
		for i, cell := range header.cells {
			fields[i] = matchColumnFieldWithOverride(cell, overrides)
		}
		mapped := 0
		for _, f := range fields {
			if f != "" {
				mapped++
			}
		}
		if mapped < 2 {
			fields = inferFieldsFromSampleRows(rows, modeCols, overrides)
		}
		startIdx = headerIdx + 1
	} else {
		fields = inferFieldsFromSampleRows(rows, modeCols, overrides)
	}
	mapped := 0
	for _, f := range fields {
		if f != "" {
			mapped++
		}
	}
	if mapped < 2 {
		return nil, -1, nil
	}
	var schema []rfqColumnSlot
	if headerIdx >= 0 && len(header.cells) == len(fields) {
		schema = buildColumnSchemaWithOverrides(header, pageWidth, overrides)
	}
	if len(schema) < 2 {
		schema = buildEqualWidthSchema(fields, pageWidth)
	}
	if len(schema) < 2 {
		return nil, -1, nil
	}
	detected := make([]RfqDetectedColumn, len(schema))
	for i, slot := range schema {
		label := string(slot.field)
		if headerIdx >= 0 && i < len(header.cells) {
			label = header.cells[i]
		}
		detected[i] = RfqDetectedColumn{Index: i, Field: string(slot.field), Label: label}
	}
	return schema, startIdx, detected
}

func pageTextToStructuredTable(page int, text string) *RfqStructuredTable {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	var matrix [][]string
	for _, raw := range strings.Split(text, "\n") {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		cells := splitTableLine(line)
		if len(cells) < 3 {
			continue
		}
		matrix = append(matrix, cells)
	}
	if len(matrix) < 2 {
		return nil
	}
	headerIdx := -1
	bestHits := 0
	for i := 0; i < len(matrix) && i < 15; i++ {
		hits := 0
		for _, cell := range matrix[i] {
			if matchColumnField(cell) != "" {
				hits++
			}
		}
		if hits > bestHits && hits >= 2 {
			bestHits = hits
			headerIdx = i
		}
	}
	if headerIdx < 0 {
		// No header: require consistent column count across data rows.
		modeCols := 0
		counts := map[int]int{}
		for _, row := range matrix {
			counts[len(row)]++
		}
		for n, c := range counts {
			if c >= 2 && n >= 3 && c > counts[modeCols] {
				modeCols = n
			}
		}
		if modeCols < 3 {
			return nil
		}
		var dataRows [][]string
		for _, row := range matrix {
			if len(row) == modeCols {
				dataRows = append(dataRows, row)
			}
		}
		if len(dataRows) < 2 {
			return nil
		}
		fields := inferFieldsFromSampleTextRows(dataRows, modeCols)
		headers := make([]string, modeCols)
		for i, f := range fields {
			headers[i] = string(f)
		}
		return &RfqStructuredTable{Page: page, Headers: headers, Rows: dataRows}
	}
	headers := matrix[headerIdx]
	var rows [][]string
	for i := headerIdx + 1; i < len(matrix); i++ {
		row := matrix[i]
		if isTableFooterRow(strings.Join(row, " ")) {
			break
		}
		if len(row) < 2 {
			continue
		}
		rows = append(rows, row)
	}
	if len(rows) == 0 {
		return nil
	}
	return &RfqStructuredTable{Page: page, Headers: headers, Rows: rows}
}

func inferFieldsFromSampleTextRows(rows [][]string, nCols int) []rfqColumnField {
	pseudo := make([]rfqTextRow, 0, len(rows))
	for _, cells := range rows {
		pseudo = append(pseudo, rfqTextRow{cells: cells})
	}
	return inferFieldsFromSampleRows(pseudo, nCols, nil)
}

func filterFallbackLines(lines []ParsedRfqLine) []ParsedRfqLine {
	if len(lines) == 0 {
		return lines
	}
	out := make([]ParsedRfqLine, 0, len(lines))
	lowQuality := 0
	for _, ln := range lines {
		desc := strings.TrimSpace(ln.Description)
		code := strings.TrimSpace(ln.ItemCode)
		if desc == "" && code == "" {
			lowQuality++
			continue
		}
		if ln.Confidence <= 0.55 {
			if desc == "" {
				lowQuality++
				continue
			}
			if code == "" && ln.Qty == "1" && len(desc) < 15 {
				lowQuality++
				continue
			}
		}
		out = append(out, ln)
	}
	if len(out) == 0 {
		return out
	}
	// If most lines were junk, drop weak remainder rather than flooding the UI.
	if lowQuality > len(lines)/2 && len(out) > 20 {
		strict := out[:0]
		for _, ln := range out {
			if ln.Confidence >= 0.7 || strings.TrimSpace(ln.ItemCode) != "" {
				strict = append(strict, ln)
			}
		}
		if len(strict) > 0 {
			return strict
		}
	}
	return out
}
