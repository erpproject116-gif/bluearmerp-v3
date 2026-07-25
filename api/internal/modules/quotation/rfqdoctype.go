package quotation

import (
	"regexp"
	"strings"
)

type RfqDocumentType string

const (
	RfqDocumentUnknown         RfqDocumentType = "unknown"
	RfqDocumentGovernmentSpec  RfqDocumentType = "gov_section_spec"
	RfqDocumentGovernmentAnnex RfqDocumentType = "gov_annex_table"
	RfqDocumentSpreadsheetBOQ  RfqDocumentType = "spreadsheet_boq"
	RfqDocumentInvoiceLike     RfqDocumentType = "invoice_like"
	RfqDocumentRFQ             RfqDocumentType = "rfq"
)

var (
	// Roman-numeral government sections: "I. LAPTOP (8 units)"
	rfqGovernmentSection = regexp.MustCompile(`(?im)^\s*[IVXLCDM]+\.\s+.+?\(\s*\d+(?:\.\d+)?\s*(?:units?|pcs?|pieces?|sets?|lots?)\s*\)\s*$`)
	// Alternate numbered product lines used by some agencies: "1. Laptop – 8 units" / "Item 1: Laptop (qty 8)"
	rfqNumberedSection = regexp.MustCompile(`(?im)^\s*(?:item\s+)?\d+[.):]\s+.+?(?:[–—\-:(]|\bqty\b)\s*\d+(?:\.\d+)?\s*(?:units?|pcs?|pieces?|sets?|lots?|qty)?\s*\)?\s*$`)
	rfqGovernmentSignals = regexp.MustCompile(`(?i)\b(?:philgeps|approved budget for the contract|republic act no\.?\s*\d+|small value procurement)\b`)
	rfqInvoiceSignals    = regexp.MustCompile(`(?i)\b(?:invoice\s+no\.?|bill\s+to|amount\s+due|hours\s+rate\s+total)\b`)
)

func ClassifyRfqDocument(pages []RfqPageInput, tables []RfqStructuredTable) RfqDocumentType {
	var b strings.Builder
	for _, p := range pages {
		if b.Len() > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(p.Text)
	}
	text := strings.ToLower(b.String())

	hasRFQ := strings.Contains(text, "request for quotation") ||
		strings.Contains(text, "request for quote") ||
		strings.Contains(text, "bill of quantities") ||
		strings.Contains(text, "boq")
	// Invoice guard: require invoice signals AND no RFQ/BOQ language.
	if rfqInvoiceSignals.MatchString(text) && !hasRFQ {
		return RfqDocumentInvoiceLike
	}
	if rfqGovernmentSection.MatchString(b.String()) || (rfqGovernmentSignals.MatchString(text) && rfqNumberedSection.MatchString(b.String())) {
		return RfqDocumentGovernmentSpec
	}
	if rfqNumberedSection.MatchString(b.String()) && hasRFQ {
		return RfqDocumentGovernmentSpec
	}
	if (strings.Contains(text, "annex a") || strings.Contains(text, "annex \"a\"")) &&
		(strings.Contains(text, "item & description") || strings.Contains(text, "item and description")) {
		return RfqDocumentGovernmentAnnex
	}
	if structuredTablesLookLikeBOQ(tables) {
		return RfqDocumentSpreadsheetBOQ
	}
	if hasRFQ {
		return RfqDocumentRFQ
	}
	return RfqDocumentUnknown
}

func structuredTablesLookLikeBOQ(tables []RfqStructuredTable) bool {
	for _, table := range tables {
		var hasItem, hasQty, hasSpecs bool
		for _, header := range table.Headers {
			h := strings.ToLower(strings.TrimSpace(header))
			switch {
			case strings.Contains(h, "item"), strings.Contains(h, "description"):
				hasItem = true
			case strings.Contains(h, "qty"), strings.Contains(h, "quantity"):
				hasQty = true
			case strings.Contains(h, "technical spec"), strings.Contains(h, "scope of work"):
				hasSpecs = true
			}
		}
		if hasItem && hasQty && (hasSpecs || len(table.Headers) >= 3) {
			return true
		}
	}
	return false
}
