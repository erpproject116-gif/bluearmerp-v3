package billing

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
)

func renderInvoicePDF(ctx context.Context, pool *pgxpool.Pool, invoiceID int64) ([]byte, error) {
	var invNo, currency, status string
	var periodStart, periodEnd, dueDate time.Time
	var amount float64
	var paidAt *time.Time
	var customerName, customerEmail, companyName, planKind string

	err := pool.QueryRow(ctx, `
		select i.invoice_no, i.period_start, i.period_end, i.amount, i.currency,
		       i.due_date, i.status, i.paid_at,
		       coalesce(nullif(pc.full_name,''), pc.email),
		       pc.email,
		       coalesce(pc.company_name, t.company_code, ''),
		       s.plan_kind
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		join public.platform_customers pc on pc.id = s.customer_id
		left join public.tenants t on t.id = s.tenant_id
		where i.id = $1`, invoiceID).Scan(
		&invNo, &periodStart, &periodEnd, &amount, &currency,
		&dueDate, &status, &paidAt,
		&customerName, &customerEmail, &companyName, &planKind)
	if err != nil {
		return nil, err
	}

	billTo := pdf.ToParty(customerName, nil, nil, nil, &customerEmail)
	if companyName != "" {
		billTo.CompanyName = companyName
	}

	details := []pdf.PartyField{
		{Label: "Invoice no.", Value: invNo},
		{Label: "Status", Value: status},
		{Label: "Billing period", Value: periodStart.Format("2006-01-02") + " — " + periodEnd.Format("2006-01-02")},
		{Label: "Due date", Value: dueDate.Format("2006-01-02")},
		{Label: "Plan", Value: planKind},
	}
	if paidAt != nil {
		details = append(details, pdf.PartyField{Label: "Paid at", Value: paidAt.Format("2006-01-02 15:04")})
	}

	headers := []string{"Description", "Amount"}
	rows := [][]string{
		{fmt.Sprintf("Bluearm ERP subscription — %s", planKind), pdf.FormatMoney(amount, currency)},
	}
	totals := []pdf.TotalRow{
		{Label: "Total due", Value: pdf.FormatMoney(amount, currency), Bold: true},
	}

	return pdf.RenderGenericDocumentPDF(pdf.GenericDocumentInput{
		DocTitle:          "Subscription Invoice",
		DocSubtitle:       invNo,
		Tenant:            pdf.Party{CompanyName: "Bluearm ERP"},
		CounterpartyTitle: "Bill to",
		Counterparty:      billTo,
		DetailFields:      details,
		LineHeaders:       headers,
		LineRows:          rows,
		LineColWidths:     []float64{120, 40},
		Totals:            totals,
		Notes:             "Pay online from Settings → Billing in your Bluearm ERP workspace.",
	})
}
