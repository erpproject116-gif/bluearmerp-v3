package pdf

import (
	"fmt"
	"strings"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/money"
)

type Party struct {
	CompanyName string
	Address     string
	Phone       string
	Mobile      string
	Email       string
}

type QuotationLine struct {
	LineNo      int
	ItemCode    string
	ItemName    string
	Description string
	Qty         float64
	UnitVatInc  float64
	LineTotal   float64
}

type QuotationDoc struct {
	ReferenceNo   string
	DateNoDisplay string
	OrderDate     string
	TaxTypeName   string
	CurrencyCode  string
	LocationName  string
	PicName       string
	ProgressStatus string
	ValidUntil    string
	PaymentTerms  string
	Notes         string
	Subtotal      float64
	TaxTotal      float64
	GrandTotal    float64
	Lines         []QuotationLine
}

type QuotationPrintInput struct {
	Tenant      Party
	Partner     Party
	Quotation   QuotationDoc
	GeneratedAt *time.Time
	Chrome      PrintChrome
}

func formatMoney(amount float64, currencyCode string) string {
	return money.Format(amount, currencyCode)
}

func partyContact(p Party) string {
	parts := []string{}
	for _, s := range []string{p.Phone, p.Mobile, p.Email} {
		if strings.TrimSpace(s) != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, " · ")
}

func formatPrintDate(iso string) string {
	if iso == "" {
		return "—"
	}
	parts := strings.Split(iso, "-")
	if len(parts) != 3 {
		return iso
	}
	return fmt.Sprintf("%s/%s/%s", parts[1], parts[2], parts[0])
}

func progressStatusLabel(s string) string {
	switch s {
	case "unconfirmed":
		return "Unconfirmed"
	case "in_progress":
		return "In Progress"
	case "completed":
		return "Completed"
	default:
		return s
	}
}

// RenderQuotationPDF builds a quotation PDF from the print payload.
func RenderQuotationPDF(in QuotationPrintInput) ([]byte, error) {
	q := in.Quotation
	d := NewDocLayout()
	ApplyChromeToParty(&in.Tenant, in.Chrome)
	d.RenderBrandedHeader("Quotation", q.ReferenceNo, in.Tenant.CompanyName, in.Chrome)

	details := []PartyField{
		{Label: "Date-no", Value: q.DateNoDisplay},
		{Label: "Date", Value: formatPrintDate(q.OrderDate)},
		{Label: "Transaction type", Value: q.TaxTypeName},
		{Label: "Currency", Value: q.CurrencyCode},
		{Label: "Location", Value: q.LocationName},
		{Label: "PIC", Value: q.PicName},
		{Label: "Progress", Value: progressStatusLabel(q.ProgressStatus)},
	}
	if q.ValidUntil != "" {
		details = append(details, PartyField{Label: "Valid until", Value: formatPrintDate(q.ValidUntil)})
	}
	d.RenderParty("Quotation Details", details)

	partnerFields := []PartyField{
		{Label: "Name", Value: in.Partner.CompanyName},
	}
	if in.Partner.Address != "" {
		partnerFields = append(partnerFields, PartyField{Label: "Address", Value: in.Partner.Address})
	}
	partnerFields = append(partnerFields, PartyField{Label: "Contact", Value: partyContact(in.Partner)})
	d.RenderParty("Customer", partnerFields)

	headers := []string{"#", "Item", "Qty", "Unit", "Total"}
	colWidths := []float64{10, 90, 20, 30, 30}
	var rows [][]string
	for _, ln := range q.Lines {
		item := ln.ItemName
		if ln.ItemCode != "" {
			item = ln.ItemCode + " — " + ln.ItemName
		}
		if ln.Description != "" {
			item += "\n" + ln.Description
		}
		rows = append(rows, []string{
			fmt.Sprintf("%d", ln.LineNo),
			item,
			fmt.Sprintf("%.2f", ln.Qty),
			formatMoney(ln.UnitVatInc, ""),
			formatMoney(ln.LineTotal, ""),
		})
	}
	d.RenderLineTable(headers, rows, colWidths)

	cc := q.CurrencyCode
	d.RenderTotals([]TotalRow{
		{Label: "Subtotal", Value: formatMoney(q.Subtotal, cc)},
		{Label: "Tax", Value: formatMoney(q.TaxTotal, cc)},
		{Label: "Grand Total", Value: formatMoney(q.GrandTotal, cc), Bold: true},
	})

	if q.PaymentTerms != "" {
		d.RenderTextBlock("Payment Terms", q.PaymentTerms)
	}
	if q.Notes != "" {
		d.RenderTextBlock("Notes", q.Notes)
	}

	generatedAt := time.Now()
	if in.GeneratedAt != nil {
		generatedAt = *in.GeneratedAt
	}
	d.RenderFooter(in.Chrome.footerOrDefault(DefaultGeneratedFooter(generatedAt)))
	return d.Bytes()
}
