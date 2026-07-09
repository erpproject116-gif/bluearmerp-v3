package pdf

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/jung-kurt/gofpdf/v2"
)

const (
	pageMargin = 15.0
	lineHeight = 6.0
)

// DocLayout wraps gofpdf with reusable document sections.
type DocLayout struct {
	pdf *gofpdf.Fpdf
	buf bytes.Buffer
	y   float64
}

func NewDocLayout() *DocLayout {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(pageMargin, pageMargin, pageMargin)
	pdf.SetAutoPageBreak(true, pageMargin)
	pdf.AddPage()
	d := &DocLayout{pdf: pdf, y: pageMargin}
	return d
}

func (d *DocLayout) ensureSpace(h float64) {
	if d.y+h > 297-pageMargin {
		d.pdf.AddPage()
		d.y = pageMargin
	}
}

func (d *DocLayout) RenderHeader(title, subtitle, tenantName string) {
	d.pdf.SetFont("Arial", "B", 16)
	d.pdf.SetXY(pageMargin, d.y)
	d.pdf.CellFormat(0, 8, tenantName, "", 1, "L", false, 0, "")
	d.y += 8
	d.pdf.SetFont("Arial", "B", 14)
	d.pdf.SetXY(pageMargin, d.y)
	d.pdf.CellFormat(0, 7, title, "", 1, "L", false, 0, "")
	d.y += 7
	if subtitle != "" {
		d.pdf.SetFont("Arial", "", 11)
		d.pdf.SetXY(pageMargin, d.y)
		d.pdf.CellFormat(0, 6, subtitle, "", 1, "L", false, 0, "")
		d.y += 6
	}
	d.y += 4
}

type PartyField struct {
	Label string
	Value string
}

func (d *DocLayout) RenderParty(sectionTitle string, fields []PartyField) {
	d.ensureSpace(20)
	d.pdf.SetFont("Arial", "B", 11)
	d.pdf.SetXY(pageMargin, d.y)
	d.pdf.CellFormat(0, 6, sectionTitle, "", 1, "L", false, 0, "")
	d.y += 7
	d.pdf.SetFont("Arial", "", 10)
	for _, f := range fields {
		if strings.TrimSpace(f.Value) == "" {
			continue
		}
		d.ensureSpace(lineHeight)
		d.pdf.SetXY(pageMargin, d.y)
		d.pdf.CellFormat(35, lineHeight, f.Label+":", "", 0, "L", false, 0, "")
		d.pdf.MultiCell(0, lineHeight, f.Value, "", "L", false)
		d.y = d.pdf.GetY() + 1
	}
	d.y += 4
}

func (d *DocLayout) RenderLineTable(headers []string, rows [][]string, colWidths []float64) {
	if len(headers) == 0 {
		return
	}
	if len(colWidths) != len(headers) {
		total := 180.0
		w := total / float64(len(headers))
		colWidths = make([]float64, len(headers))
		for i := range colWidths {
			colWidths[i] = w
		}
	}
	d.ensureSpace(12)
	d.pdf.SetFont("Arial", "B", 9)
	d.pdf.SetFillColor(240, 240, 240)
	x := pageMargin
	for i, h := range headers {
		d.pdf.SetXY(x, d.y)
		d.pdf.CellFormat(colWidths[i], 7, h, "1", 0, "L", true, 0, "")
		x += colWidths[i]
	}
	d.y += 7
	d.pdf.SetFont("Arial", "", 9)
	for _, row := range rows {
		d.ensureSpace(7)
		x = pageMargin
		rowHeight := 7.0
		for i, cell := range row {
			if i >= len(colWidths) {
				break
			}
			d.pdf.SetXY(x, d.y)
			d.pdf.CellFormat(colWidths[i], rowHeight, cell, "1", 0, "L", false, 0, "")
			x += colWidths[i]
		}
		d.y += rowHeight
	}
	d.y += 4
}

type TotalRow struct {
	Label string
	Value string
	Bold  bool
}

func (d *DocLayout) RenderTotals(rows []TotalRow) {
	d.ensureSpace(float64(len(rows)*7 + 4))
	rightX := 210 - pageMargin - 60
	for _, r := range rows {
		style := ""
		if r.Bold {
			style = "B"
		}
		d.pdf.SetFont("Arial", style, 10)
		d.pdf.SetXY(rightX, d.y)
		d.pdf.CellFormat(35, 7, r.Label, "", 0, "R", false, 0, "")
		d.pdf.CellFormat(25, 7, r.Value, "", 1, "R", false, 0, "")
		d.y += 7
	}
	d.y += 4
}

func (d *DocLayout) RenderTextBlock(title, body string) {
	body = strings.TrimSpace(body)
	if body == "" {
		return
	}
	d.ensureSpace(14)
	d.pdf.SetFont("Arial", "B", 10)
	d.pdf.SetXY(pageMargin, d.y)
	d.pdf.CellFormat(0, 6, title, "", 1, "L", false, 0, "")
	d.y += 7
	d.pdf.SetFont("Arial", "", 10)
	d.pdf.SetXY(pageMargin, d.y)
	d.pdf.MultiCell(0, lineHeight, body, "", "L", false)
	d.y = d.pdf.GetY() + 4
}

func (d *DocLayout) RenderFooter(text string) {
	d.pdf.SetY(-pageMargin - 6)
	d.pdf.SetFont("Arial", "I", 8)
	d.pdf.SetTextColor(100, 100, 100)
	d.pdf.CellFormat(0, 5, text, "", 0, "C", false, 0, "")
	d.pdf.SetTextColor(0, 0, 0)
}

func (d *DocLayout) Bytes() ([]byte, error) {
	if err := d.pdf.Output(&d.buf); err != nil {
		return nil, fmt.Errorf("pdf output: %w", err)
	}
	return d.buf.Bytes(), nil
}
