package quotation

import (
	"regexp"
	"strings"
	"unicode"
)

var (
	rfqPageHeaderHint = regexp.MustCompile(`(?i)\b(item|qty|quantity|description|spec|unit|price|cost|amount|code|sku|part|uom|no\.|line)\b`)
	rfqPageCoverHint  = regexp.MustCompile(`(?i)\b(request for quotation|^rfq\b|invitation to (bid|quote)|terms and conditions|general conditions|certificate of|this page intentionally|table of contents)\b`)
	rfqPageFooterOnly = regexp.MustCompile(`(?i)^(grand\s+total|sub\s*total|subtotal|total\s+amount|prepared\s+by|approved\s+by)`)
	rfqPageQtyHint    = regexp.MustCompile(`(?i)\b(qty|quantity|q'ty)\b|\b\d+(?:\.\d+)?\s*(pcs|pc|ea|set|units|unit|lot)\b`)
	rfqPageMoneyHint  = regexp.MustCompile(`(?i)(₱|\$|php\b|\b\d{1,3}(?:,\d{3})+(?:\.\d{2})?\b)`)
	rfqPageLineNoHint = regexp.MustCompile(`(?m)^\s*\d{1,3}[\s.)]`)
)

type rfqPageKind string

const (
	rfqPageTable   rfqPageKind = "table"
	rfqPageSkip    rfqPageKind = "skip"
	rfqPageUnknown rfqPageKind = "unknown"
)

func classifyRfqPageText(text string, wordCount int) rfqPageKind {
	text = strings.TrimSpace(text)
	lower := strings.ToLower(text)
	if text == "" && wordCount < 4 {
		return rfqPageSkip
	}
	headerHits := len(rfqPageHeaderHint.FindAllString(text, -1))
	hasQty := rfqPageQtyHint.MatchString(text)
	hasMoney := rfqPageMoneyHint.MatchString(text)
	hasLineNo := rfqPageLineNoHint.MatchString(text)

	if headerHits >= 2 {
		return rfqPageTable
	}
	if (hasQty || hasMoney) && (hasLineNo || wordCount >= 10) {
		return rfqPageTable
	}
	if wordCount >= 15 && (hasQty || hasMoney) {
		return rfqPageTable
	}
	if rfqPageFooterOnly.MatchString(strings.TrimSpace(lower)) {
		return rfqPageSkip
	}
	if rfqPageCoverHint.MatchString(lower) && headerHits == 0 && !hasQty && !hasMoney {
		if len(text) < 400 || wordCount < 20 {
			return rfqPageSkip
		}
	}
	if wordCount < 8 && !hasQty && !hasMoney && headerHits == 0 && len(text) < 120 {
		return rfqPageSkip
	}
	if wordCount < 4 && len(text) < 80 {
		return rfqPageSkip
	}
	return rfqPageUnknown
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
