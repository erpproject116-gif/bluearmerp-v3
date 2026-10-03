package pos

import (
	"context"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ReceiptFormat is the frozen counter slip snapshot returned at checkout.
// Not an HTML template — clients render a simple slip from these fields.
type ReceiptFormat struct {
	DocTitle          string          `json:"doc_title"`
	CompanyName       string          `json:"company_name"`
	LocationName      string          `json:"location_name,omitempty"`
	CashierName       string          `json:"cashier_name,omitempty"`
	SessionNo         string          `json:"session_no,omitempty"`
	SalesNo           string          `json:"sales_no"`
	OfficialReceiptNo *string         `json:"official_receipt_no,omitempty"`
	OfficialReceiptID *int64          `json:"official_receipt_id,omitempty"`
	At                string          `json:"at"`
	OrderType         string          `json:"order_type,omitempty"`
	TableLabel        string          `json:"table_label,omitempty"`
	Lines             []ReceiptLine   `json:"lines"`
	Subtotal          float64         `json:"subtotal"`
	Discount          float64         `json:"discount"`
	Tax               float64         `json:"tax"`
	Tip               float64         `json:"tip"`
	GrandTotal        float64         `json:"grand_total"`
	Change            float64         `json:"change"`
	Tenders           []ReceiptTender `json:"tenders"`
	FooterNote        string          `json:"footer_note"`
}

type ReceiptLine struct {
	ItemName  string  `json:"item_name"`
	ItemCode  string  `json:"item_code,omitempty"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	LineTotal float64 `json:"line_total"`
}

type ReceiptTender struct {
	TenderType string  `json:"tender_type"`
	Amount     float64 `json:"amount"`
}

type receiptBuildInput struct {
	CompanyName  string
	LocationName string
	CashierName  string
	SessionNo    string
	SalesNo      string
	ORID         *int64
	ORNo         *string
	At           time.Time
	OrderType    string
	TableLabel   string
	Lines        []CartLine
	Subtotal     float64
	Discount     float64
	Tax          float64
	Tip          float64
	GrandTotal   float64
	Change       float64
	Tenders      []tenderBody
}

func buildReceiptFormat(in receiptBuildInput) ReceiptFormat {
	docTitle := "Sales slip"
	footer := "Counter confirmation — not titled Official Receipt unless an OR number is shown."
	if in.ORNo != nil && strings.TrimSpace(*in.ORNo) != "" {
		docTitle = "Official Receipt"
		footer = "Official Receipt " + strings.TrimSpace(*in.ORNo) + " · keep for your records."
	}

	lines := make([]ReceiptLine, 0, len(in.Lines))
	for _, ln := range in.Lines {
		name := ln.ItemName
		if ln.SizeLabel != nil && strings.TrimSpace(*ln.SizeLabel) != "" {
			name = name + " (" + strings.TrimSpace(*ln.SizeLabel) + ")"
		}
		lines = append(lines, ReceiptLine{
			ItemName:  name,
			ItemCode:  ln.ItemCode,
			Qty:       ln.Qty,
			UnitPrice: ln.UnitPrice,
			LineTotal: ln.LineTotal,
		})
	}
	tenders := make([]ReceiptTender, 0, len(in.Tenders))
	for _, t := range in.Tenders {
		tenders = append(tenders, ReceiptTender{
			TenderType: normalizeTenderType(t.TenderType),
			Amount:     t.Amount,
		})
	}
	at := in.At
	if at.IsZero() {
		at = time.Now()
	}
	return ReceiptFormat{
		DocTitle:          docTitle,
		CompanyName:       in.CompanyName,
		LocationName:      in.LocationName,
		CashierName:       in.CashierName,
		SessionNo:         in.SessionNo,
		SalesNo:           in.SalesNo,
		OfficialReceiptNo: in.ORNo,
		OfficialReceiptID: in.ORID,
		At:                at.UTC().Format(time.RFC3339),
		OrderType:         in.OrderType,
		TableLabel:        in.TableLabel,
		Lines:             lines,
		Subtotal:          roundMoney(in.Subtotal),
		Discount:          roundMoney(in.Discount),
		Tax:               roundMoney(in.Tax),
		Tip:               roundMoney(in.Tip),
		GrandTotal:        roundMoney(in.GrandTotal),
		Change:            roundMoney(in.Change),
		Tenders:           tenders,
		FooterNote:        footer,
	}
}

func loadReceiptMeta(ctx context.Context, tx pgx.Tx, tenantID, sessionID, locationID int64) (company, location, cashier, sessionNo string) {
	_ = tx.QueryRow(ctx, `select coalesce(company_name, '') from public.tenants where id = $1`, tenantID).Scan(&company)
	_ = tx.QueryRow(ctx, `select coalesce(location_name, '') from public.inv_locations where id = $1`, locationID).Scan(&location)
	_ = tx.QueryRow(ctx, `
		select s.session_no, coalesce(u.full_name, '')
		from public.pos_sessions s
		left join public.users u on u.id = s.cashier_user_id
		where s.id = $1 and s.tenant_id = $2`, sessionID, tenantID).Scan(&sessionNo, &cashier)
	return
}

func loadOfficialReceiptNo(ctx context.Context, tx pgx.Tx, tenantID int64, orID *int64) *string {
	if orID == nil || *orID <= 0 {
		return nil
	}
	var no string
	err := tx.QueryRow(ctx, `
		select coalesce(receipt_no, '') from public.fin_official_receipts
		where id = $1 and tenant_id = $2 and deleted_at is null`, *orID, tenantID).Scan(&no)
	if err != nil || no == "" {
		return nil
	}
	return &no
}
