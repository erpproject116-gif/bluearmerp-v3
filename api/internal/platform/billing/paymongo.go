package billing

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const paymongoAPIBase = "https://api.paymongo.com/v2"

type PayMongoClient struct {
	SecretKey string
}

func NewPayMongoClient() PayMongoClient {
	return PayMongoClient{SecretKey: strings.TrimSpace(os.Getenv("PAYMONGO_SECRET_KEY"))}
}

func (c PayMongoClient) Enabled() bool {
	return c.SecretKey != ""
}

type CheckoutSessionResult struct {
	SessionID   string
	CheckoutURL string
	Reference   string
}

type checkoutCreateReq struct {
	Data struct {
		Attributes struct {
			LineItems []struct {
				Name     string `json:"name"`
				Amount   int64  `json:"amount"`
				Currency string `json:"currency"`
				Quantity int    `json:"quantity"`
			} `json:"line_items"`
			PaymentMethodTypes []string          `json:"payment_method_types"`
			SuccessURL         string            `json:"success_url"`
			CancelURL          string            `json:"cancel_url"`
			ReferenceNumber    string            `json:"reference_number"`
			SendEmailReceipt   bool              `json:"send_email_receipt"`
			Metadata           map[string]string `json:"metadata"`
		} `json:"attributes"`
	} `json:"data"`
}

type checkoutCreateResp struct {
	Data struct {
		ID         string `json:"id"`
		Attributes struct {
			CheckoutURL string `json:"checkout_url"`
		} `json:"attributes"`
	} `json:"data"`
}

// CreateCheckoutSession starts a PayMongo hosted checkout for an invoice amount (PHP centavos).
func (c PayMongoClient) CreateCheckoutSession(ctx context.Context, name string, amountCentavos int64, reference, successURL, cancelURL string, metadata map[string]string) (CheckoutSessionResult, error) {
	if !c.Enabled() {
		return CheckoutSessionResult{}, fmt.Errorf("PAYMONGO_SECRET_KEY not configured")
	}
	if amountCentavos < 100 {
		return CheckoutSessionResult{}, fmt.Errorf("amount below PayMongo minimum")
	}

	var req checkoutCreateReq
	req.Data.Attributes.LineItems = []struct {
		Name     string `json:"name"`
		Amount   int64  `json:"amount"`
		Currency string `json:"currency"`
		Quantity int    `json:"quantity"`
	}{
		{Name: name, Amount: amountCentavos, Currency: "PHP", Quantity: 1},
	}
	req.Data.Attributes.PaymentMethodTypes = []string{"card", "gcash", "qrph", "grab_pay", "paymaya"}
	req.Data.Attributes.SuccessURL = successURL
	req.Data.Attributes.CancelURL = cancelURL
	req.Data.Attributes.ReferenceNumber = reference
	req.Data.Attributes.SendEmailReceipt = true
	req.Data.Attributes.Metadata = metadata

	body, err := json.Marshal(req)
	if err != nil {
		return CheckoutSessionResult{}, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, paymongoAPIBase+"/checkout_sessions", bytes.NewReader(body))
	if err != nil {
		return CheckoutSessionResult{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Basic "+base64.StdEncoding.EncodeToString([]byte(c.SecretKey+":")))

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		return CheckoutSessionResult{}, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return CheckoutSessionResult{}, fmt.Errorf("paymongo checkout: HTTP %d: %s", resp.StatusCode, string(raw))
	}

	var parsed checkoutCreateResp
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return CheckoutSessionResult{}, err
	}
	if parsed.Data.ID == "" || parsed.Data.Attributes.CheckoutURL == "" {
		return CheckoutSessionResult{}, fmt.Errorf("paymongo checkout: missing session id or url")
	}
	return CheckoutSessionResult{
		SessionID:   parsed.Data.ID,
		CheckoutURL: parsed.Data.Attributes.CheckoutURL,
		Reference:   reference,
	}, nil
}

// VerifyWebhookSignature validates Paymongo-Signature header (t=...,te=...,li=...).
func VerifyWebhookSignature(rawBody []byte, signatureHeader, webhookSecret string) (livemode bool, ok bool) {
	webhookSecret = strings.TrimSpace(webhookSecret)
	if webhookSecret == "" || len(rawBody) == 0 {
		return false, false
	}
	var ts, testSig, liveSig string
	for _, part := range strings.Split(signatureHeader, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "t=") {
			ts = strings.TrimPrefix(part, "t=")
		} else if strings.HasPrefix(part, "te=") {
			testSig = strings.TrimPrefix(part, "te=")
		} else if strings.HasPrefix(part, "li=") {
			liveSig = strings.TrimPrefix(part, "li=")
		}
	}
	if ts == "" {
		return false, false
	}
	expected := computePaymongoSig(webhookSecret, ts, rawBody)
	if liveSig != "" && hmac.Equal([]byte(expected), []byte(liveSig)) {
		return true, true
	}
	if testSig != "" && hmac.Equal([]byte(expected), []byte(testSig)) {
		return false, true
	}
	return false, false
}

func computePaymongoSig(secret, timestamp string, rawBody []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(timestamp + "."))
	mac.Write(rawBody)
	return hex.EncodeToString(mac.Sum(nil))
}

// ParseWebhookEvent extracts checkout session payment data from a PayMongo webhook payload.
func ParseWebhookEvent(raw []byte) (eventType, sessionID, paymentID, reference string, err error) {
	var root struct {
		Data struct {
			Attributes struct {
				Type     string          `json:"type"`
				Data     json.RawMessage `json:"data"`
				Livemode bool            `json:"livemode"`
			} `json:"attributes"`
			Type string `json:"type"`
		} `json:"data"`
	}
	if err = json.Unmarshal(raw, &root); err != nil {
		return
	}
	eventType = root.Data.Attributes.Type
	if eventType == "" {
		eventType = root.Data.Type
	}

	var nested struct {
		ID         string `json:"id"`
		Attributes struct {
			ReferenceNumber string `json:"reference_number"`
			Payments        []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
			} `json:"payments"`
			PaymentIntent struct {
				ID string `json:"id"`
			} `json:"payment_intent"`
		} `json:"attributes"`
	}
	if len(root.Data.Attributes.Data) > 0 {
		_ = json.Unmarshal(root.Data.Attributes.Data, &nested)
	}
	sessionID = nested.ID
	reference = nested.Attributes.ReferenceNumber
	for _, pay := range nested.Attributes.Payments {
		if pay.Status == "paid" && pay.ID != "" {
			paymentID = pay.ID
			break
		}
	}
	if paymentID == "" && nested.Attributes.PaymentIntent.ID != "" {
		paymentID = nested.Attributes.PaymentIntent.ID
	}
	return
}

func AmountToCentavos(amount float64) int64 {
	return int64(amount*100 + 0.5)
}

func WebhookSecret() string {
	return strings.TrimSpace(os.Getenv("PAYMONGO_WEBHOOK_SECRET"))
}

func parseWebhookTimestamp(signatureHeader string) (time.Time, bool) {
	for _, part := range strings.Split(signatureHeader, ",") {
		part = strings.TrimSpace(part)
		if strings.HasPrefix(part, "t=") {
			ts := strings.TrimPrefix(part, "t=")
			var sec int64
			if _, err := fmt.Sscan(ts, &sec); err == nil && sec > 0 {
				return time.Unix(sec, 0), true
			}
		}
	}
	return time.Time{}, false
}

func BillingReturnBase() string {
	base := strings.TrimSpace(os.Getenv("CORS_ORIGIN"))
	if idx := strings.Index(base, ","); idx > 0 {
		base = strings.TrimSpace(base[:idx])
	}
	if base == "" {
		base = "http://localhost:5173"
	}
	return strings.TrimRight(base, "/") + "/app/settings/billing"
}
