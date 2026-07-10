package quotation

import (
	"bytes"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/ledongthuc/pdf"
)

const (
	rfqPDFMaxBytes    = 50 << 20 // 50 MB
	rfqPDFMaxPages    = 400
	rfqPDFDefaultW    = 612.0
	rfqPDFDefaultH    = 792.0
	rfqPDFLineHeight  = 14.0
	rfqPDFColumnWidth = 120.0
)

var rfqLineSplit = regexp.MustCompile(`\t+| {2,}`)

type rfqPDFExtractOptions struct {
	PageFrom           int
	PageTo             int
	FilterNonTable     bool
}

type rfqPDFExtractResult struct {
	Pages       []RfqPageInput
	TotalPages  int
	Skipped     int
	TextOnly    bool
	ServerParse bool
}

func extractRfqPDFPages(data []byte, opts rfqPDFExtractOptions) (rfqPDFExtractResult, error) {
	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return rfqPDFExtractResult{}, fmt.Errorf("invalid PDF: %w", err)
	}
	total := reader.NumPage()
	if total <= 0 {
		return rfqPDFExtractResult{}, fmt.Errorf("PDF has no pages")
	}
	if total > rfqPDFMaxPages {
		return rfqPDFExtractResult{}, fmt.Errorf("PDF has %d pages (max %d). Split the file or use a page range", total, rfqPDFMaxPages)
	}

	from := opts.PageFrom
	if from < 1 {
		from = 1
	}
	to := opts.PageTo
	if to <= 0 || to > total {
		to = total
	}
	if from > to {
		return rfqPDFExtractResult{}, fmt.Errorf("invalid page range %d–%d", from, to)
	}

	useFilter := opts.FilterNonTable && to-from+1 > 2
	type pagePlan struct {
		pdfIndex int
	}
	var previews []struct {
		pdfIndex int
		text     string
		words    []RfqWord
	}
	skipped := 0

	for i := from; i <= to; i++ {
		page := reader.Page(i)
		if page.V.IsNull() {
			skipped++
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			text = ""
		}
		words := mergeNearbyWords(plainTextToWords(text))
		previews = append(previews, struct {
			pdfIndex int
			text     string
			words    []RfqWord
		}{pdfIndex: i, text: strings.TrimSpace(text), words: words})
	}

	texts := make([]string, len(previews))
	wordCounts := make([]int, len(previews))
	for i, p := range previews {
		texts[i] = p.text
		wordCounts[i] = len(p.words)
	}
	keptIdx, focusSkipped := focusTablePageIndices(texts, wordCounts, useFilter)
	skipped += focusSkipped

	var plan []pagePlan
	if len(keptIdx) == 0 && len(previews) > 0 {
		for _, p := range previews {
			if classifyRfqPageText(p.text, len(p.words)) != rfqPageSkip {
				plan = append(plan, pagePlan{pdfIndex: p.pdfIndex})
			} else {
				skipped++
			}
		}
	} else {
		for _, idx := range keptIdx {
			plan = append(plan, pagePlan{pdfIndex: previews[idx].pdfIndex})
		}
	}

	out := rfqPDFExtractResult{
		TotalPages:  total,
		Skipped:     skipped,
		TextOnly:    true,
		ServerParse: true,
	}
	for pi, p := range plan {
		page := reader.Page(p.pdfIndex)
		text, _ := page.GetPlainText(nil)
		words := mergeNearbyWords(plainTextToWords(text))
		out.Pages = append(out.Pages, RfqPageInput{
			Page:   pi + 1,
			Text:   strings.TrimSpace(text),
			Words:  words,
			Width:  rfqPDFDefaultW,
			Height: rfqPDFDefaultH,
		})
	}
	return out, nil
}

func plainTextToWords(text string) []RfqWord {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.ReplaceAll(text, "\r", "\n")
	lines := strings.Split(text, "\n")
	var words []RfqWord
	for li, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		y := float64(li) * rfqPDFLineHeight
		cells := splitTableLine(line)
		if len(cells) == 0 {
			cells = []string{line}
		}
		for ci, cell := range cells {
			cell = strings.TrimSpace(cell)
			if cell == "" {
				continue
			}
			words = append(words, RfqWord{
				Text: cell,
				X:    float64(ci) * rfqPDFColumnWidth,
				Y:    y,
				W:    rfqPDFColumnWidth - 8,
				H:    rfqPDFLineHeight,
			})
		}
	}
	return words
}

func splitTableLine(line string) []string {
	if strings.Contains(line, "\t") {
		parts := strings.Split(line, "\t")
		return trimEmptyParts(parts)
	}
	if rfqLineSplit.MatchString(line) {
		parts := rfqLineSplit.Split(line, -1)
		return trimEmptyParts(parts)
	}
	// Fixed-width-ish: 3+ spaces between columns common in text PDFs.
	if strings.Count(line, "  ") >= 2 {
		parts := rfqLineSplit.Split(line, -1)
		if len(parts) >= 2 {
			return trimEmptyParts(parts)
		}
	}
	return nil
}

func trimEmptyParts(parts []string) []string {
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func readAllLimited(r io.Reader, max int64) ([]byte, error) {
	lr := io.LimitReader(r, max+1)
	data, err := io.ReadAll(lr)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > max {
		return nil, fmt.Errorf("file too large (max %d MB)", max/(1024*1024))
	}
	return data, nil
}
