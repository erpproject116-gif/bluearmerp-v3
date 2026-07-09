package billing

import (
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func paymongoWebhookHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid body.", "ERR_BAD_REQUEST")
			return
		}

		sigHeader := strings.TrimSpace(r.Header.Get("Paymongo-Signature"))
		secret := WebhookSecret()
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Webhook secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		if ts, ok := parseWebhookTimestamp(sigHeader); ok {
			if time.Since(ts) > 5*time.Minute {
				response.Err(w, http.StatusUnauthorized, "Stale webhook.", "ERR_UNAUTHORIZED")
				return
			}
		}
		_, verified := VerifyWebhookSignature(raw, sigHeader, secret)
		if !verified {
			response.Err(w, http.StatusUnauthorized, "Invalid signature.", "ERR_UNAUTHORIZED")
			return
		}

		eventType, sessionID, paymentID, reference, err := ParseWebhookEvent(raw)
		if err != nil {
			log.Printf("paymongo webhook parse: %v", err)
			response.OK(w, map[string]bool{"received": true}, "Ignored.")
			return
		}
		if !strings.Contains(eventType, "payment.paid") && eventType != "checkout_session.payment.paid" {
			response.OK(w, map[string]bool{"received": true}, "Ignored.")
			return
		}

		ctx := r.Context()
		var invoiceID int64
		if sessionID != "" {
			_ = pool.QueryRow(ctx, `
				select id from public.platform_subscription_invoices
				where paymongo_checkout_session_id = $1
				limit 1`, sessionID).Scan(&invoiceID)
		}
		if invoiceID <= 0 && reference != "" {
			_ = pool.QueryRow(ctx, `
				select id from public.platform_subscription_invoices
				where invoice_no = $1 or paymongo_reference = $1
				limit 1`, reference).Scan(&invoiceID)
		}
		if invoiceID <= 0 {
			log.Printf("paymongo webhook: no invoice for session=%s ref=%s", sessionID, reference)
			response.OK(w, map[string]bool{"received": true}, "No matching invoice.")
			return
		}

		tx, err := pool.Begin(ctx)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process payment.", "ERR_INTERNAL")
			return
		}
		result, err := MarkInvoicePaidTx(ctx, tx, MarkPaidParams{
			InvoiceID:              invoiceID,
			Provider:               "paymongo",
			ProviderPaymentID:      paymentID,
			ProviderCheckoutSessID: sessionID,
			Metadata: map[string]any{
				"event_type": eventType,
				"reference":  reference,
			},
		})
		if err != nil {
			_ = tx.Rollback(ctx)
			log.Printf("paymongo webhook mark paid: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(ctx); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit payment.", "ERR_INTERNAL")
			return
		}
		FinalizePaidInvoice(ctx, pool, result.CustomerID)
		response.OK(w, map[string]any{
			"invoice_id":   invoiceID,
			"already_paid": result.AlreadyPaid,
		}, "Processed.")
	}
}
