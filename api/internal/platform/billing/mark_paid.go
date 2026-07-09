package billing

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/outbox"
)

type MarkPaidParams struct {
	InvoiceID              int64
	Provider               string
	ProviderPaymentID      string
	ProviderCheckoutSessID string
	MarkedBy               *string
	Metadata               map[string]any
}

type MarkPaidResult struct {
	AlreadyPaid bool
	CustomerID  int64
	TenantID    int64
}

// MarkInvoicePaidTx marks an issued invoice paid, records payment history, restores subscription, and enqueues email.
func MarkInvoicePaidTx(ctx context.Context, tx pgx.Tx, p MarkPaidParams) (MarkPaidResult, error) {
	var result MarkPaidResult
	provider := p.Provider
	if provider == "" {
		provider = "manual"
	}

	var status string
	var subID, tenantID, customerID int64
	var amount float64
	var currency string
	err := tx.QueryRow(ctx, `
		select i.status, i.subscription_id, s.tenant_id, s.customer_id, i.amount, i.currency
		from public.platform_subscription_invoices i
		join public.platform_subscriptions s on s.id = i.subscription_id
		where i.id = $1
		for update of i`, p.InvoiceID).Scan(&status, &subID, &tenantID, &customerID, &amount, &currency)
	if err != nil {
		return result, err
	}
	result.CustomerID = customerID
	result.TenantID = tenantID

	if status == "paid" {
		result.AlreadyPaid = true
		return result, nil
	}
	if status != "issued" {
		return result, fmt.Errorf("invoice %d is not issuable (status=%s)", p.InvoiceID, status)
	}

	if provider == "paymongo" && p.ProviderPaymentID != "" {
		var exists bool
		_ = tx.QueryRow(ctx, `
			select exists(
			  select 1 from public.platform_subscription_payments
			  where provider = 'paymongo' and provider_payment_id = $1
			)`, p.ProviderPaymentID).Scan(&exists)
		if exists {
			result.AlreadyPaid = true
			return result, nil
		}
	}

	tag, err := tx.Exec(ctx, `
		update public.platform_subscription_invoices
		set status = 'paid',
		    paid_at = now(),
		    marked_paid_by = $2::uuid,
		    paymongo_payment_id = coalesce(nullif($3,''), paymongo_payment_id),
		    paymongo_checkout_session_id = coalesce(nullif($4,''), paymongo_checkout_session_id),
		    updated_at = now()
		where id = $1 and status = 'issued'`,
		p.InvoiceID, p.MarkedBy, p.ProviderPaymentID, p.ProviderCheckoutSessID)
	if err != nil {
		return result, err
	}
	if tag.RowsAffected() == 0 {
		result.AlreadyPaid = true
		return result, nil
	}

	meta := p.Metadata
	if meta == nil {
		meta = map[string]any{}
	}
	metaJSON, _ := json.Marshal(meta)
	_, err = tx.Exec(ctx, `
		insert into public.platform_subscription_payments
		  (invoice_id, subscription_id, tenant_id, amount, currency, provider,
		   provider_payment_id, provider_checkout_session_id, status, metadata)
		values ($1, $2, $3, $4, $5, $6, nullif($7,''), nullif($8,''), 'completed', $9::jsonb)`,
		p.InvoiceID, subID, tenantID, amount, currency, provider,
		p.ProviderPaymentID, p.ProviderCheckoutSessID, metaJSON)
	if err != nil {
		return result, err
	}

	_, _ = tx.Exec(ctx, `
		update public.platform_subscriptions
		set status = 'active', updated_at = now()
		where id = $1 and status = 'past_due'`, subID)

	key := fmt.Sprintf("platform.billing.payment_received:%d", p.InvoiceID)
	_ = outbox.EnqueueTx(ctx, tx, tenantID, "platform.billing.payment_received", key, map[string]any{
		"invoice_id": p.InvoiceID,
	})

	return result, nil
}

// FinalizePaidInvoice updates customer urgency after payment.
func FinalizePaidInvoice(ctx context.Context, pool *pgxpool.Pool, customerID int64) {
	if customerID > 0 {
		_, _ = customerregistry.UpdateCustomerUrgency(ctx, pool, customerID, time.Now())
	}
}
