package quotation

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	rfqPageHeaderHint = regexp.MustCompile(`(?i)\b(item|qty|quantity|description|spec|specification|unit|price|cost|amount|code|sku|part|uom|no\.|line|brand|model|unit\s*price|line\s*total|boq|bill\s+of\s+quantities|schedule\s+of\s+requirements|reference\s+price|budget)\b`)
	rfqPageCoverHint  = regexp.MustCompile(`(?i)\b(request for quotation|^rfq\b|invitation to (bid|quote)|terms and conditions|general conditions|certificate of|this page intentionally|table of contents|instruction to bidders|eligible|warranty period|delivery period|payment terms|validity of offer|scope of work|background of the|organizational chart|company profile|notary|acknowledgement)\b`)
	rfqPageFooterOnly = regexp.MustCompile(`(?i)^(grand\s+total|sub\s*total|subtotal|total\s+amount|prepared\s+by|approved\s+by|noted\s+by|conforme)`)
	rfqPageQtyHint    = regexp.MustCompile(`(?i)\b(qty|quantity|q'ty)\b|\b\d+(?:\.\d+)?\s*(pcs|pc|ea|set|units|unit|lot|box|pack)\b`)
	rfqPageMoneyHint  = regexp.MustCompile(`(?i)(₱|\$|php\b|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b)`)
	rfqPageLineNoHint = regexp.MustCompile(`(?m)^\s*\d{1,3}[\s.)]`)
)

type rfqPageKind string

const (
	rfqPageTable   rfqPageKind = "table"
	rfqPageSkip    rfqPageKind = "skip"
	rfqPageUnknown rfqPageKind = "unknown"
)

func scoreRfqPageTable(text string, wordCount int) int {
	text = strings.TrimSpace(text)
	lower := strings.ToLower(text)
	if text == "" && wordCount < 4 {
		return 0
	}
	score := 0
	headerHits := len(rfqPageHeaderHint.FindAllString(text, -1))
	hasQty := rfqPageQtyHint.MatchString(text)
	hasMoney := rfqPageMoneyHint.MatchString(text)
	hasLineNo := rfqPageLineNoHint.MatchString(text)
	digitRows := 0
	for _, line := range strings.Split(text, "\n") {
		if rfqPageLineNoHint.MatchString(line) {
			digitRows++
		}
	}

	score += minInt(headerHits*12, 36)
	if hasQty {
		score += 18
	}
	if hasMoney {
		score += 12
	}
	if hasLineNo {
		score += 14
	}
	if digitRows >= 2 {
		score += minInt(digitRows*4, 20)
	}
	if wordCount >= 12 {
		score += 8
	}
	if rfqPageFooterOnly.MatchString(strings.TrimSpace(lower)) {
		score -= 40
	}
	if rfqPageCoverHint.MatchString(lower) && headerHits == 0 && !hasQty && digitRows == 0 {
		score -= 30
	}
	if wordCount < 6 && !hasQty && headerHits == 0 {
		score -= 25
	}
	if len(text) > 0 && len(text) < 80 && headerHits == 0 {
		score -= 15
	}
	if score < 0 {
		return 0
	}
	if score > 100 {
		return 100
	}
	return score
}

func classifyRfqPageText(text string, wordCount int) rfqPageKind {
	score := scoreRfqPageTable(text, wordCount)
	if score >= 45 {
		return rfqPageTable
	}
	if score <= 12 {
		return rfqPageSkip
	}
	return rfqPageUnknown
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func countDigits(s string) int {
	n := 0
	for _, r := range s {
		if unicode.IsDigit(r) {
			n++
		}
	}
	return n
}

// focusTablePageIndices returns indices (0-based) of pages in the BOQ / line-item table block.
func focusTablePageIndices(texts []string, wordCounts []int, enabled bool) (kept []int, skipped int) {
	n := len(texts)
	if !enabled || n <= 2 {
		for i := 0; i < n; i++ {
			kept = append(kept, i)
		}
		return kept, 0
	}
	kinds := make([]rfqPageKind, n)
	scores := make([]int, n)
	for i := 0; i < n; i++ {
		wc := 0
		if i < len(wordCounts) {
			wc = wordCounts[i]
		}
		kinds[i] = classifyRfqPageText(texts[i], wc)
		scores[i] = scoreRfqPageTable(texts[i], wc)
	}

	firstTable := -1
	for i, k := range kinds {
		if k == rfqPageTable {
			firstTable = i
			break
		}
	}
	if firstTable < 0 {
		bestIdx, bestScore := 0, scores[0]
		for i := 1; i < n; i++ {
			if scores[i] > bestScore {
				bestScore = scores[i]
				bestIdx = i
			}
		}
		if bestScore >= 30 {
			firstTable = bestIdx
		}
	}
	if firstTable < 0 {
		for i := 0; i < n; i++ {
			kept = append(kept, i)
		}
		return kept, 0
	}

	lastTable := firstTable
	for i := firstTable; i < n; i++ {
		if kinds[i] == rfqPageTable {
			lastTable = i
		} else if kinds[i] == rfqPageUnknown && i <= lastTable+2 && scores[i] >= 25 {
			lastTable = i
		} else if kinds[i] == rfqPageSkip && i > lastTable+1 {
			break
		} else if i > lastTable+1 && scores[i] < 20 {
			break
		}
	}

	for i := 0; i < n; i++ {
		if i < firstTable || i > lastTable {
			skipped++
			continue
		}
		if kinds[i] == rfqPageSkip && scores[i] < 25 {
			skipped++
			continue
		}
		kept = append(kept, i)
	}
	return kept, skipped
}
