package response

import (
	"net/http"
	"strings"
)

// Smart Assist codes (deterministic; never authored by LLM).
const (
	SAPoQtyExceedsOpen         = "SA_PO_QTY_EXCEEDS_OPEN"
	SASIQtyExceedsPOBalance    = "SA_SI_QTY_EXCEEDS_PO_BALANCE"
	SASISerialLotNeedsGR       = "SA_SI_SERIAL_LOT_NEEDS_GR"
	SASIQtyExceedsUnreceivedPO = "SA_SI_QTY_EXCEEDS_UNRECEIVED_PO"
	SAFiscalPeriodClosed       = "SA_FISCAL_PERIOD_CLOSED"
	SAFiscalYearClosed         = "SA_FISCAL_YEAR_CLOSED"
	SAPaymentExceedsOutstanding = "SA_PAYMENT_EXCEEDS_OUTSTANDING"
	SARetainerNotFunded        = "SA_RETAINER_NOT_FUNDED"
	SARetainerExceedsRemaining = "SA_RETAINER_EXCEEDS_REMAINING"
	SAWHTCodeNotFound          = "SA_WHT_CODE_NOT_FOUND"
	// Second wave
	SADRExceedsReleased   = "SA_DR_EXCEEDS_RELEASED"
	SASIExceedsDelivered  = "SA_SI_EXCEEDS_DELIVERED"
	SAJEMustBalance       = "SA_JE_MUST_BALANCE"
	SABackdatedPostBlocked = "SA_BACKDATED_POST_BLOCKED"
	SAAttachmentRequired   = "SA_ATTACHMENT_REQUIRED"
	SAPONotConfirmed       = "SA_PO_NOT_CONFIRMED"
)

const (
	hrefGoodsReceipt     = "/app/purchase-order/goods-receipt"
	hrefFiscalYears      = "/app/finance/acct-i/fiscal-years"
	hrefWithholding      = "/app/finance/acct-ii/withholding-codes"
	hrefRetainers        = "/app/sales/retainer-invoices"
	hrefPaymentVouchers  = "/app/finance/payment-vouchers"
	hrefOfficialReceipts = "/app/finance/official-receipts"
	hrefJournalEntries   = "/app/finance/acct-i/journal-entries"
	hrefPurchaseOrders   = "/app/purchase-order/purchase-orders"
	hrefProcessPolicies  = "/app/user-management/process-policies"
	hrefSOFormSettings   = "/app/sales-order/sales-orders/settings"
	hrefPOFormSettings   = "/app/purchase-order/purchase-orders/settings"
)

// ValidationSmart is Validation, attaching Assist when the error text matches a known SA rule.
func ValidationSmart(w http.ResponseWriter, errors map[string]string) {
	if a := AssistFromErrors(errors); a != nil {
		ValidationAssist(w, errors, *a)
		return
	}
	Validation(w, errors)
}

// AssistFromErrors returns the first matching Smart Assist for a field-error map.
func AssistFromErrors(errors map[string]string) *Assist {
	if len(errors) == 0 {
		return nil
	}
	// Stable order: prefer qty / applied_amount / entry_date style fields when present.
	preferred := []string{
		"received_qty", "applied_amount", "official_receipt_id", "entry_date",
		"withholding_lines", "lines", "qty",
	}
	for _, key := range preferred {
		for field, msg := range errors {
			if field == key || strings.HasSuffix(field, "."+key) {
				if a := AssistFromMessage(field, msg); a != nil {
					return a
				}
			}
		}
	}
	for field, msg := range errors {
		if a := AssistFromMessage(field, msg); a != nil {
			return a
		}
	}
	return nil
}

// AssistFromMessage maps known validator messages to recovery cards.
func AssistFromMessage(field, msg string) *Assist {
	m := strings.TrimSpace(msg)
	if m == "" {
		return nil
	}
	lower := strings.ToLower(m)

	switch {
	case strings.Contains(lower, "exceeds open po quantity"):
		return &Assist{
			Code: SAPoQtyExceedsOpen, Field: field,
			Title:  "Quantity exceeds open PO balance",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Purchase Orders", Href: hrefPurchaseOrders}},
		}
	case strings.Contains(lower, "quantity exceeds po balance"):
		return &Assist{
			Code: SASIQtyExceedsPOBalance, Field: field,
			Title:  "Quantity exceeds open PO balance",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Goods Receipts", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "quantity exceeds gr balance"):
		return &Assist{
			Code: SASIQtyExceedsPOBalance, Field: field,
			Title:  "Quantity exceeds goods receipt balance",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Goods Receipts", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "serial/lot") && strings.Contains(lower, "goods receipt"):
		return &Assist{
			Code: SASISerialLotNeedsGR, Field: field,
			Title:  "Serial/lot items need Goods Receipt first",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Goods Receipts", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "exceeds unreceived po quantity"):
		return &Assist{
			Code: SASIQtyExceedsUnreceivedPO, Field: field,
			Title:  "Invoice qty exceeds unreceived PO qty",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Goods Receipts", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "fiscal period") && strings.Contains(lower, "closed"):
		return &Assist{
			Code: SAFiscalPeriodClosed, Field: field,
			Title:  "Fiscal period is closed",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "fiscal year") && strings.Contains(lower, "closed"):
		return &Assist{
			Code: SAFiscalYearClosed, Field: field,
			Title:  "Fiscal year is closed",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "backdated posting is blocked"):
		return &Assist{
			Code: SABackdatedPostBlocked, Field: field,
			Title:  "Backdated posting is blocked",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "applied amount exceeds outstanding"):
		href := hrefOfficialReceipts
		if strings.Contains(lower, "supplier invoice") {
			href = hrefPaymentVouchers
		}
		return &Assist{
			Code: SAPaymentExceedsOutstanding, Field: field,
			Title:  "Applied amount exceeds outstanding",
			Detail: m,
			Actions: []AssistAction{{Label: "Review payments", Href: href}},
		}
	case strings.Contains(lower, "retainer must be funded"):
		return &Assist{
			Code: SARetainerNotFunded, Field: field,
			Title:  "Retainer must be funded via OR",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Retainer Invoices", Href: hrefRetainers}},
		}
	case strings.Contains(lower, "exceeds remaining retainer"):
		return &Assist{
			Code: SARetainerExceedsRemaining, Field: field,
			Title:  "Amount exceeds remaining retainer",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Retainer Invoices", Href: hrefRetainers}},
		}
	case strings.Contains(lower, "withholding tax code not found"):
		return &Assist{
			Code: SAWHTCodeNotFound, Field: field,
			Title:  "Withholding tax code not found",
			Detail: "Choose an active withholding tax code, or create one under Accounting II.",
			Actions: []AssistAction{{Label: "Open Withholding Tax", Href: hrefWithholding}},
		}
	case strings.Contains(lower, "delivery quantity exceeds released"):
		return &Assist{
			Code: SADRExceedsReleased, Field: field,
			Title:  "Delivery exceeds released quantity",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: "/app/sales-order/sales-orders"}},
		}
	case strings.Contains(lower, "exceeds delivered quantity"):
		return &Assist{
			Code: SASIExceedsDelivered, Field: field,
			Title:  "Quantity exceeds delivered amount",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: "/app/sales-order/sales-orders"}},
		}
	case strings.Contains(lower, "must balance before posting"):
		return &Assist{
			Code: SAJEMustBalance, Field: field,
			Title:  "Journal entry must balance",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Journal entries", Href: hrefJournalEntries}},
		}
	case strings.Contains(lower, "attachment is required"):
		href := hrefSOFormSettings
		if strings.Contains(lower, "purchase") {
			href = hrefPOFormSettings
		}
		return &Assist{
			Code: SAAttachmentRequired, Field: field,
			Title:  "Attachment required before confirm",
			Detail: m,
			Actions: []AssistAction{
				{Label: "Open Form settings", Href: href},
				{Label: "All process policies", Href: hrefProcessPolicies},
			},
		}
	case strings.Contains(lower, "still unconfirmed") || strings.Contains(lower, "not found or not confirmed") || strings.Contains(lower, "confirm the purchase order"):
		return &Assist{
			Code: SAPONotConfirmed, Field: field,
			Title:  "Purchase order must be confirmed first",
			Detail: m,
			Actions: []AssistAction{{Label: "Open Purchase Orders", Href: hrefPurchaseOrders}},
		}
	default:
		return nil
	}
}

// AssistPaymentOverApplied builds assist for concurrent over-apply (OR/PV).
func AssistPaymentOverApplied(message string) Assist {
	a := AssistFromMessage("applied_amount", message)
	if a != nil {
		return *a
	}
	return Assist{
		Code:   SAPaymentExceedsOutstanding,
		Title:  "Applied amount exceeds outstanding",
		Detail: message,
		Actions: []AssistAction{{Label: "Review receipts", Href: hrefOfficialReceipts}},
	}
}
