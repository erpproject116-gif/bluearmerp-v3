package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type invoiceEmailPayload struct {
	InvoiceID int64 `json:"invoice_id"`
}

func enqueueBillingEmailTx(ctx context.Context, tx pgx.Tx, tenantID int64, eventType, key string, payload map[string]any) error {
	return outbox.EnqueueTx(ctx, tx, tenantID, eventType, key, payload)
}

// EnqueueInvoiceIssuedTx queues invoice issued email from console/manual flows.
func EnqueueInvoiceIssuedTx(ctx context.Context, tx pgx.Tx, tenantID int64, key string, invoiceID int64) error {
	return enqueueBillingEmailTx(ctx, tx, tenantID, "platform.billing.invoice_issued", key, map[string]any{
		"invoice_id": invoiceID,
	})
}

// HandleOutboxEvent sends platform billing transactional emails when SMTP is configured.
func HandleOutboxEvent(ctx context.Context, pool *pgxpool.Pool, ev outbox.Event) error {
	switch ev.EventType {
	case "platform.billing.invoice_issued", "platform.billing.payment_reminder", "platform.billing.payment_received":
	default:
		return nil
	}

	var p invoiceEmailPayload
	if err := json.Unmarshal(ev.Payload, &p); err != nil {
		return err
	}
	if p.InvoiceID <= 0 {
		return fmt.Errorf("billing outbox: missing invoice_id")
	}

	details, err := loadInvoiceEmailDetails(ctx, pool, p.InvoiceID)
	if err != nil {
		return err
	}
	if details.Email == "" {
		log.Printf("billing outbox: invoice=%d no recipient email", p.InvoiceID)
		return nil
	}

	cfg := outbox.LoadSMTPConfig()
	if !cfg.Enabled() {
		log.Printf("billing outbox: invoice=%d — SMTP not configured", p.InvoiceID)
		return nil
	}

	var subject, body string
	billingURL := BillingReturnBase()
	switch ev.EventType {
	case "platform.billing.invoice_issued":
		subject = fmt.Sprintf("[Bluearm ERP] Invoice %s issued", details.InvoiceNo)
		body = fmt.Sprintf("Hello %s,\n\nYour Bluearm ERP subscription invoice is ready.\n\nInvoice: %s\nPeriod: %s to %s\nAmount: PHP %.2f\nDue date: %s\n\nPay online: %s\n\nThank you,\nBluearm ERP Billing",
			details.CustomerName, details.InvoiceNo, details.PeriodStart, details.PeriodEnd,
			details.Amount, details.DueDate, billingURL)
	case "platform.billing.payment_reminder":
		subject = fmt.Sprintf("[Bluearm ERP] Payment reminder: %s", details.InvoiceNo)
		body = fmt.Sprintf("Hello %s,\n\nThis is a reminder that invoice %s for PHP %.2f is due on %s.\n\nPay now: %s\n\nThank you,\nBluearm ERP Billing",
			details.CustomerName, details.InvoiceNo, details.Amount, details.DueDate, billingURL)
	case "platform.billing.payment_received":
		subject = fmt.Sprintf("[Bluearm ERP] Payment received — %s", details.InvoiceNo)
		body = fmt.Sprintf("Hello %s,\n\nWe received your payment for invoice %s (PHP %.2f). Your subscription access has been restored.\n\nThank you,\nBluearm ERP Billing",
			details.CustomerName, details.InvoiceNo, details.Amount)
	}

	if err := outbox.SendEmail(cfg, details.Email, subject, body); err != nil {
		return err
	}
	return nil
}

type invoiceEmailDetails struct {
	InvoiceNo, CustomerName, Email string
	Amount                         float64
	PeriodStart, PeriodEnd, DueDate string
}

func loadInvoiceEmailDetails(ctx context.Context, pool *pgxpool.Pool, invoiceID int64) (invoiceEmailDetails, error) {
	var d invoiceEmailDetails
	err := pool.QueryRow(ctx, `
		select i.invoice_no,
		       coalesce(nullif(pc.full_name,''), pc.email),
		       pc.email,
		       i.amount,
		       i.period_start::text,
		       i.period_end::text,
		       i.due_date::text
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		join public.platform_customers pc on pc.id = s.customer_id
		where i.id = $1`, invoiceID).Scan(
		&d.InvoiceNo, &d.CustomerName, &d.Email, &d.Amount,
		&d.PeriodStart, &d.PeriodEnd, &d.DueDate)
	return d, err
}

// DrainOutbox processes one batch of pending platform billing outbox events.
func DrainOutbox(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	return outbox.DrainPending(ctx, pool, HandleOutboxEvent)
}
