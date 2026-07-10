package quotation

import (
	"regexp"
	"strconv"
	"strings"
	"unicode"
)

// ParsedRfqLine is one item row extracted from RFQ document text.
type ParsedRfqLine struct {
	Page        int     `json:"page"`
	LineNo      int     `json:"line_no"`
	ItemCode    string  `json:"item_code"`
	ItemName    string  `json:"item_name,omitempty"`
	Description string  `json:"description"`
	Remarks     string  `json:"remarks,omitempty"`
	Qty         string  `json:"qty"`
	Unit        string  `json:"unit"`
	UnitPrice   string  `json:"unit_price,omitempty"`
	LineTotal   string  `json:"line_total,omitempty"`
	Confidence  float64 `json:"confidence"`
}

var (
	rfqHeaderNoise = regexp.MustCompile(`(?i)^(page\s+\d+|request\s+for\s+quotation|rfq\b|date\b|total\b|subtotal\b|remarks?\b|notes?\b|prepared\b|approved\b|signature\b|qty\b|quantity\b|description\b|item\b|unit\b|uom\b|no\.?\b|#|terms\s+and\s+conditions|instruction\s+to|eligible|warranty|delivery\s+period|payment\s+terms|scope\s+of\s+work|company\s+profile|hereby|whereas|pursuant)`)
	rfqQtyUnitDesc = regexp.MustCompile(`^(\d+(?:\.\d+)?)\s+([a-zA-Z]{1,12})\s+(.+)$`)
	rfqCodeQtyDesc = regexp.MustCompile(`^([A-Za-z0-9][A-Za-z0-9._\-/]{1,40})\s+(\d+(?:\.\d+)?)\s+(.+)$`)
	rfqLineNoRow   = regexp.MustCompile(`^(\d{1,3})[\s.)]+(.+)$`)
	rfqQtyDesc     = regexp.MustCompile(`^(\d+(?:\.\d+)?)\s+(.+)$`)
)

func ParseRfqPages(pages []struct {
	Page int
	Text string
}) []ParsedRfqLine {
	var out []ParsedRfqLine
	seen := map[string]struct{}{}
	lineNo := 0
	for _, p := range pages {
		for _, raw := range strings.Split(p.Text, "\n") {
			line := normalizeRfqLine(raw)
			if line == "" || isRfqNoiseLine(line) {
				continue
			}
			parsed, ok := parseRfqLine(line)
			if !ok {
				continue
			}
			parsed.Page = p.Page
			key := strings.ToLower(strings.TrimSpace(parsed.ItemCode + "|" + parsed.Description + "|" + parsed.Qty))
			if _, dup := seen[key]; dup {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			parsed.LineNo = lineNo
			out = append(out, parsed)
		}
	}
	return out
}

func normalizeRfqLine(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\t", " ")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	return s
}

func isRfqNoiseLine(line string) bool {
	if len(line) < 3 {
		return true
	}
	if rfqHeaderNoise.MatchString(line) {
		return true
	}
	if len(line) > 90 && !rfqQtyDesc.MatchString(line) && !rfqCodeQtyDesc.MatchString(line) && !rfqLineNoRow.MatchString(line) {
		return true
	}
	// Mostly punctuation / separators.
	letters := 0
	for _, r := range line {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			letters++
		}
	}
	return letters < 3
}

func pageTextHasParseableLines(text string) bool {
	for _, raw := range strings.Split(text, "\n") {
		line := normalizeRfqLine(raw)
		if line == "" || isRfqNoiseLine(line) {
			continue
		}
		if _, ok := parseRfqLine(line); ok {
			return true
		}
	}
	return false
}

func parseRfqLine(line string) (ParsedRfqLine, bool) {
	if m := rfqCodeQtyDesc.FindStringSubmatch(line); len(m) == 4 {
		return ParsedRfqLine{
			ItemCode:    m[1],
			Qty:         m[2],
			Description: strings.TrimSpace(m[3]),
			Confidence:  0.9,
		}, true
	}
	if m := rfqQtyUnitDesc.FindStringSubmatch(line); len(m) == 4 {
		return ParsedRfqLine{
			Qty:         m[1],
			Unit:        strings.ToLower(m[2]),
			Description: strings.TrimSpace(m[3]),
			Confidence:  0.85,
		}, true
	}
	if m := rfqLineNoRow.FindStringSubmatch(line); len(m) == 3 {
		rest := strings.TrimSpace(m[2])
		if sub, ok := parseRfqLine(rest); ok {
			sub.Confidence = minF(sub.Confidence, 0.8)
			return sub, true
		}
		if m2 := rfqQtyDesc.FindStringSubmatch(rest); len(m2) == 3 {
			return ParsedRfqLine{
				Qty:         m2[1],
				Description: strings.TrimSpace(m2[2]),
				Confidence:  0.75,
			}, true
		}
		if len(rest) > 4 {
			return ParsedRfqLine{Description: rest, Qty: "1", Confidence: 0.6}, true
		}
	}
	if m := rfqQtyDesc.FindStringSubmatch(line); len(m) == 3 {
		desc := strings.TrimSpace(m[2])
		if len(desc) >= 4 {
			return ParsedRfqLine{
				Qty:         m[1],
				Description: desc,
				Confidence:  0.7,
			}, true
		}
	}
	// Long description-only row (common in OCR) — require stronger signal than arbitrary text.
	if len(line) >= 12 && !strings.Contains(line, "http") {
		if m := rfqLineNoRow.FindStringSubmatch(line); len(m) == 3 {
			rest := strings.TrimSpace(m[2])
			if len(rest) >= 8 {
				return ParsedRfqLine{Description: rest, Qty: "1", Confidence: 0.55}, true
			}
		}
	}
	return ParsedRfqLine{}, false
}

func minF(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func parseQtyFloat(q string) float64 {
	v, err := strconv.ParseFloat(strings.TrimSpace(q), 64)
	if err != nil || v <= 0 {
		return 1
	}
	return v
}
