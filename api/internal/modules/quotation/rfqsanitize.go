package quotation

import (
	"fmt"
	"regexp"
	"strings"
)

const maxRfqSpecificationChars = 12_000

var (
	rfqSectionHeading = regexp.MustCompile(`(?i)^\s*([IVXLCDM]+)\.\s+(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*(units?|pcs?|pieces?|sets?|lots?)\s*\)\s*$`)
	// "1. Laptop – 8 units" / "Item 1: Laptop (qty 8)" / "2) Desktop - 64 pcs"
	rfqAltSectionHeading = regexp.MustCompile(`(?i)^\s*(?:item\s+)?(\d+)[.):]\s+(.+?)\s*(?:[–—\-]|\(|\bqty\b)\s*(?:qty\s*)?(\d+(?:\.\d+)?)\s*(units?|pcs?|pieces?|sets?|lots?)?\s*\)?\s*$`)
	rfqSectionStop    = regexp.MustCompile(`(?i)^\s*(?:financial proposal|approved budget for the contract|offered rate per unit|price proposal|nothing follows)\b`)
	rfqSectionNoise   = regexp.MustCompile(`(?i)^\s*(?:statement of compliance|remarks?\s*\(|yes\s+no|no\s+yes|minimum technical specifications|miminum technical specifications|terms of reference|scope of work)\b`)
)

// ParseRfqSectionSpecifications treats a government section heading such as
// "I. LAPTOP (8 units)" as one procurement item and folds following spec bullets
// into that item's description.
func ParseRfqSectionSpecifications(pages []RfqPageInput) RfqParseResult {
	type section struct {
		page  int
		title string
		qty   string
		unit  string
		specs []string
	}
	var sections []section
	var current *section
	flush := func() {
		if current == nil {
			return
		}
		copySection := *current
		sections = append(sections, copySection)
		current = nil
	}

	for _, page := range pages {
		for _, raw := range strings.Split(page.Text, "\n") {
			line := normalizeRfqLine(strings.TrimLeft(raw, "•-"))
			if line == "" {
				continue
			}
			if match := rfqSectionHeading.FindStringSubmatch(line); len(match) == 5 {
				flush()
				current = &section{
					page:  page.Page,
					title: normalizeRfqItemTitle(match[2]),
					qty:   match[3],
					unit:  normalizeRfqUnit(match[4]),
				}
				continue
			}
			if match := rfqAltSectionHeading.FindStringSubmatch(line); len(match) >= 4 {
				flush()
				unit := "unit"
				if len(match) >= 5 && strings.TrimSpace(match[4]) != "" {
					unit = normalizeRfqUnit(match[4])
				}
				current = &section{
					page:  page.Page,
					title: normalizeRfqItemTitle(match[2]),
					qty:   match[3],
					unit:  unit,
				}
				continue
			}
			if current == nil {
				continue
			}
			if rfqSectionStop.MatchString(line) {
				flush()
				continue
			}
			if rfqSectionNoise.MatchString(line) || isTableFooterRow(line) {
				continue
			}
			current.specs = append(current.specs, line)
		}
	}
	flush()

	result := RfqParseResult{TableDetected: len(sections) > 0}
	for i, sec := range sections {
		specification := strings.TrimSpace(strings.Join(sec.specs, "\n"))
		if len(specification) > maxRfqSpecificationChars {
			specification = specification[:maxRfqSpecificationChars] + "\n…[truncated]"
		}
		result.Lines = append(result.Lines, ParsedRfqLine{
			Page:        sec.page,
			LineNo:      i + 1,
			ItemName:    sec.title,
			Description: specification,
			Qty:         sec.qty,
			Unit:        sec.unit,
			Confidence:  0.96,
		})
	}
	return result
}

func ParseRfqDeterministic(pages []RfqPageInput, tables []RfqStructuredTable, opts RfqParseOptions) (RfqParseResult, RfqDocumentType) {
	documentType := ClassifyRfqDocument(pages, tables)
	if documentType == RfqDocumentInvoiceLike {
		return RfqParseResult{}, documentType
	}
	// Spec sheets carry compliance matrices, not order lines — never emit products.
	if documentType == RfqDocumentSpecSheet {
		return RfqParseResult{}, documentType
	}
	if documentType == RfqDocumentGovernmentSpec {
		sections := ParseRfqSectionSpecifications(pages)
		if len(sections.Lines) > 0 {
			return SanitizeRfqParseResult(sections, documentType), documentType
		}
	}

	structured := ParseRfqStructuredTables(tables, opts)
	var document RfqParseResult
	if len(structured.Lines) > 0 && len(tables) > 0 {
		document = parseRfqDocumentLayoutOnly(pages, opts)
	} else {
		document = ParseRfqDocumentWithOptions(pages, opts)
	}
	return SanitizeRfqParseResult(mergeRfqParseResults(structured, document), documentType), documentType
}

func SanitizeRfqParseResult(result RfqParseResult, documentType RfqDocumentType) RfqParseResult {
	out := RfqParseResult{
		TableDetected:   result.TableDetected,
		DetectedColumns: result.DetectedColumns,
	}
	seen := map[string]struct{}{}
	for _, line := range result.Lines {
		line.ItemCode = strings.TrimSpace(line.ItemCode)
		line.ItemName = normalizeRfqItemTitle(line.ItemName)
		line.Description = strings.TrimSpace(line.Description)
		line.Remarks = strings.TrimSpace(line.Remarks)
		rawQty := strings.TrimSpace(line.Qty)
		line.Qty = normalizeQty(line.Qty)
		if line.Qty == "" && rawQty != "" {
			// Fused "600 PCS" qty values arriving from AI or fallback paths.
			if q, u, ok := splitQtyUnitCell(rawQty); ok {
				line.Qty = q
				if strings.TrimSpace(line.Unit) == "" {
					line.Unit = u
				}
			}
		}
		line.Unit = normalizeRfqUnit(line.Unit)

		joined := strings.TrimSpace(strings.Join([]string{line.ItemName, line.Description}, " "))
		if joined == "" || isRfqOutputNoise(joined) {
			continue
		}
		if line.ItemName == "" {
			line.ItemName = shortRfqItemTitle(line.Description)
		}
		if documentType == RfqDocumentInvoiceLike {
			continue
		}
		key := rfqLineDedupeKey(line)
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		line.LineNo = len(out.Lines) + 1
		out.Lines = append(out.Lines, line)
	}
	return out
}

func isRfqOutputNoise(value string) bool {
	v := strings.ToLower(strings.TrimSpace(value))
	if v == "" {
		return true
	}
	noise := []string{
		"request for quotation", "terms and conditions", "statement of compliance",
		"approved budget for the contract", "printed name/signature",
		"authorized representative", "nothing follows", "grand total", "subtotal",
	}
	for _, phrase := range noise {
		if v == phrase || strings.HasPrefix(v, phrase+":") {
			return true
		}
	}
	return false
}

func normalizeRfqItemTitle(value string) string {
	value = normalizeRfqLine(value)
	value = strings.Trim(value, ":-–— ")
	return value
}

func normalizeRfqUnit(value string) string {
	v := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(strings.TrimSpace(value), ".")))
	if v == "" {
		return ""
	}
	if canonical, ok := rfqUnitWordCanonical[v]; ok {
		return canonical
	}
	return v
}

func shortRfqItemTitle(description string) string {
	first := strings.TrimSpace(strings.Split(description, "\n")[0])
	first = strings.TrimSpace(strings.Split(first, ":")[0])
	if len(first) > 120 {
		first = first[:120]
	}
	if first == "" {
		return "RFQ item"
	}
	return first
}

func rfqMatchQuery(line ParsedRfqLine) string {
	for _, candidate := range []string{line.ItemName, line.ItemCode, shortRfqItemTitle(line.Description)} {
		candidate = strings.TrimSpace(candidate)
		if len(candidate) >= 3 {
			if len(candidate) > 120 {
				candidate = candidate[:120]
			}
			return candidate
		}
	}
	return fmt.Sprintf("RFQ item %d", line.LineNo)
}
