package response

import (
	"net/http"
	"strconv"
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
	// Sell / stock recovery (plain-language wave)
	SASINeedsPickRelease     = "SA_SI_NEEDS_PICK_RELEASE"
	SASINeedsDelivery        = "SA_SI_NEEDS_DELIVERY"
	SASONotCompletedForSale  = "SA_SO_NOT_COMPLETED_FOR_SALE"
	SASINoOpenSOBalance      = "SA_SI_NO_OPEN_SO_BALANCE"
	SAInsufficientStock      = "SA_INSUFFICIENT_STOCK"
	SASerialNotInStock       = "SA_SERIAL_NOT_IN_STOCK"
	SAPRNotConfirmed         = "SA_PR_NOT_CONFIRMED"
	SARFQIncomplete          = "SA_RFQ_INCOMPLETE"
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
	hrefSalesOrders      = "/app/sales-order/sales-orders"
	hrefPurchaseRequests = "/app/purchase-request/purchase-requests"
	hrefRFQ              = "/app/rfq/rfqs"
	hrefInvPerBranch     = "/app/inventory/find-stock"
	hrefSerials          = "/app/inventory/serial-lot/serials"
)

// AssistLinkContext deep-links Assist CTAs when a document id is known.
type AssistLinkContext struct {
	SalesOrderID    int64
	PurchaseOrderID int64
	GoodsReceiptID  int64
}

func hrefWithOpenID(base string, openID int64) string {
	if openID <= 0 {
		return base
	}
	sep := "?"
	if strings.Contains(base, "?") {
		sep = "&"
	}
	return base + sep + "openId=" + strconv.FormatInt(openID, 10)
}

func applyAssistOpenIDs(a *Assist, ctx AssistLinkContext) {
	if a == nil || len(a.Actions) == 0 {
		return
	}
	href := a.Actions[0].Href
	switch {
	case strings.HasPrefix(href, hrefSalesOrders) && ctx.SalesOrderID > 0:
		a.Actions[0].Href = hrefWithOpenID(hrefSalesOrders, ctx.SalesOrderID)
	case strings.HasPrefix(href, hrefPurchaseOrders) && ctx.PurchaseOrderID > 0:
		a.Actions[0].Href = hrefWithOpenID(hrefPurchaseOrders, ctx.PurchaseOrderID)
	case strings.HasPrefix(href, hrefGoodsReceipt) && ctx.GoodsReceiptID > 0:
		a.Actions[0].Href = hrefWithOpenID(hrefGoodsReceipt, ctx.GoodsReceiptID)
	}
}

// ValidationSmart is Validation, attaching Assist when the error text matches a known SA rule.
func ValidationSmart(w http.ResponseWriter, errors map[string]string) {
	ValidationSmartContext(w, errors, AssistLinkContext{})
}

// ValidationSmartContext is ValidationSmart with optional deep-link ids on the primary CTA.
func ValidationSmartContext(w http.ResponseWriter, errors map[string]string, links AssistLinkContext) {
	if a := AssistFromErrors(errors); a != nil {
		applyAssistOpenIDs(a, links)
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
	lower := strings.ToLower(strings.TrimSpace(msg))
	if lower == "" {
		return nil
	}

	switch {
	case strings.Contains(lower, "pick list") && strings.Contains(lower, "automatically"):
		return &Assist{
			Code: SASINeedsPickRelease, Field: field,
			Title:  "Couldn’t finish Pick List release automatically",
			Detail: "Open the sales order → Pick List, release qty manually, then try again.",
			Actions: []AssistAction{{Label: "Pick items on Sales Order", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "delivery qty is higher than what was picked") ||
		(strings.Contains(lower, "delivery") && strings.Contains(lower, "higher than what was picked")) ||
		strings.Contains(lower, "delivery quantity exceeds released"):
		return &Assist{
			Code: SADRExceedsReleased, Field: field,
			Title:  "Delivery qty is higher than what was picked",
			Detail: "Release more on Pick List, or lower the delivery qty to match what was released.",
			Actions: []AssistAction{{Label: "Pick items on Sales Order", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "exceeds undelivered") || (strings.Contains(lower, "higher than") && strings.Contains(lower, "left to deliver")):
		return &Assist{
			Code: SADRExceedsReleased, Field: field,
			Title:  "Delivery qty is higher than what’s left to deliver",
			Detail: "Lower the delivery qty, or release more on Pick List first.",
			Actions: []AssistAction{{Label: "Pick items on Sales Order", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "reserved before") || strings.Contains(lower, "reservation is required before release"):
		return &Assist{
			Code: SAInsufficientStock, Field: field,
			Title:  "Stock must be reserved before Pick List release",
			Detail: "Confirm the sales order to reserve stock, or free up available qty at this location, then release again.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "not enough stock") || strings.Contains(lower, "not enough available stock") ||
		(strings.Contains(lower, "insufficient") && (strings.Contains(lower, "stock") || strings.Contains(lower, "lot"))):
		return &Assist{
			Code: SAInsufficientStock, Field: field,
			Title:  "Not enough stock on hand",
			Detail: "Check Inv Per Branch for available qty, or receive/adjust stock before continuing.",
			Actions: []AssistAction{{Label: "Open Inv Per Branch", Href: hrefInvPerBranch}},
		}
	case strings.Contains(lower, "pick list") && (strings.Contains(lower, "ready to invoice") || strings.Contains(lower, "release") || strings.Contains(lower, "serial")):
		return &Assist{
			Code: SASINeedsPickRelease, Field: field,
			Title:  "This item isn’t ready to invoice yet",
			Detail: "Serial items must be picked on a Sales Order first. Open the order → Pick List → release qty and scan the serial, then use Load Slip on this sale.",
			Actions: []AssistAction{{Label: "Pick items on Sales Order", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "delivery note") && strings.Contains(lower, "invoice"):
		return &Assist{
			Code: SASINeedsDelivery, Field: field,
			Title:  "Delivery is required before invoicing",
			Detail: "Post a Delivery note for the completed sales order, then use Load Slip on this sale.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "not ready to invoice") && strings.Contains(lower, "completed"):
		return &Assist{
			Code: SASONotCompletedForSale, Field: field,
			Title:  "Sales order is not completed yet",
			Detail: "Set the sales order progress to Completed (Confirm or In progress is not enough), then try again.",
			Actions: []AssistAction{{Label: "Complete the Sales Order", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "nothing left to invoice"):
		return &Assist{
			Code: SASINoOpenSOBalance, Field: field,
			Title:  "Nothing left to invoice on this order",
			Detail: "Pick or deliver remaining qty first, or this order is already fully billed.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "exceeds open po quantity") || (strings.Contains(lower, "higher than") && strings.Contains(lower, "open purchase order")):
		return &Assist{
			Code: SAPoQtyExceedsOpen, Field: field,
			Title:  "Quantity is higher than the open purchase order",
			Detail: "Lower the qty to what is still open on the PO, or open the purchase order to check the balance.",
			Actions: []AssistAction{{Label: "Open Purchase Orders", Href: hrefPurchaseOrders}},
		}
	case strings.Contains(lower, "quantity exceeds po balance") || (strings.Contains(lower, "higher than the open po balance")):
		return &Assist{
			Code: SASIQtyExceedsPOBalance, Field: field,
			Title:  "Quantity is higher than the open PO balance",
			Detail: "Receive what you need under Purchase Receive, or lower the qty to match the open balance.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "quantity exceeds gr balance") || (strings.Contains(lower, "higher than what was received")):
		return &Assist{
			Code: SASIQtyExceedsPOBalance, Field: field,
			Title:  "Quantity is higher than what was received",
			Detail: "Lower the qty to match the goods receipt, or receive more under Purchase Receive.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "serial/lot") && strings.Contains(lower, "goods receipt"):
		return &Assist{
			Code: SASISerialLotNeedsGR, Field: field,
			Title:  "Serial/lot items must be received first",
			Detail: "Scan serials in under Purchase Receive so they are in stock, then try again.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "serial numbers required") || strings.Contains(lower, "lot numbers required") ||
		(strings.Contains(lower, "serial count") && strings.Contains(lower, "must equal")):
		return &Assist{
			Code: SASISerialLotNeedsGR, Field: field,
			Title:  "Serial/lot items must be received first",
			Detail: "Scan serials or lots under Purchase Receive (or on this bill before confirm) so they are in stock, then try again.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "exceeds unreceived po quantity") || (strings.Contains(lower, "higher than") && strings.Contains(lower, "unreceived")):
		return &Assist{
			Code: SASIQtyExceedsUnreceivedPO, Field: field,
			Title:  "Bill qty is higher than what is still unreceived",
			Detail: "Receive the goods first, or lower the bill qty to match what is still open.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
		}
	case strings.Contains(lower, "fiscal period") && strings.Contains(lower, "closed"):
		return &Assist{
			Code: SAFiscalPeriodClosed, Field: field,
			Title:  "This month’s books are closed",
			Detail: "Use a date in an open period, or ask an admin to reopen the fiscal period.",
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "fiscal year") && strings.Contains(lower, "closed"):
		return &Assist{
			Code: SAFiscalYearClosed, Field: field,
			Title:  "This fiscal year is closed",
			Detail: "Use a date in an open year, or ask an admin to reopen the fiscal year.",
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "backdated posting is blocked"):
		return &Assist{
			Code: SABackdatedPostBlocked, Field: field,
			Title:  "Backdated posting is blocked",
			Detail: "Use today’s date, or ask an admin to allow backdating under Fiscal years.",
			Actions: []AssistAction{{Label: "Open Fiscal years", Href: hrefFiscalYears}},
		}
	case strings.Contains(lower, "applied amount exceeds outstanding"):
		href := hrefOfficialReceipts
		if strings.Contains(lower, "supplier invoice") {
			href = hrefPaymentVouchers
		}
		return &Assist{
			Code: SAPaymentExceedsOutstanding, Field: field,
			Title:  "Payment is higher than what is still owed",
			Detail: "Lower the applied amount to the outstanding balance, then save again.",
			Actions: []AssistAction{{Label: "Review payments", Href: href}},
		}
	case strings.Contains(lower, "retainer must be funded"):
		return &Assist{
			Code: SARetainerNotFunded, Field: field,
			Title:  "Retainer is not funded yet",
			Detail: "Collect an Official Receipt against the retainer invoice first, then try again.",
			Actions: []AssistAction{{Label: "Open Retainer Invoices", Href: hrefRetainers}},
		}
	case strings.Contains(lower, "exceeds remaining retainer"):
		return &Assist{
			Code: SARetainerExceedsRemaining, Field: field,
			Title:  "Amount is higher than remaining retainer",
			Detail: "Lower the amount to what is left on the retainer, or fund more via Official Receipt.",
			Actions: []AssistAction{{Label: "Open Retainer Invoices", Href: hrefRetainers}},
		}
	case strings.Contains(lower, "withholding tax code not found"):
		return &Assist{
			Code: SAWHTCodeNotFound, Field: field,
			Title:  "Withholding tax code not found",
			Detail: "Choose an active withholding tax code, or create one under Accounting II.",
			Actions: []AssistAction{{Label: "Open Withholding Tax", Href: hrefWithholding}},
		}
	case strings.Contains(lower, "exceeds delivered quantity") || (strings.Contains(lower, "higher than what was delivered")):
		return &Assist{
			Code: SASIExceedsDelivered, Field: field,
			Title:  "Invoice qty is higher than what was delivered",
			Detail: "Post more Delivery notes, or lower the invoice qty to match delivered qty.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "must balance before posting"):
		return &Assist{
			Code: SAJEMustBalance, Field: field,
			Title:  "Journal entry must balance",
			Detail: "Make total debits equal total credits, then post again.",
			Actions: []AssistAction{{Label: "Open Journal entries", Href: hrefJournalEntries}},
		}
	case strings.Contains(lower, "attachment is required"):
		href := hrefSOFormSettings
		if strings.Contains(lower, "purchase") {
			href = hrefPOFormSettings
		}
		return &Assist{
			Code: SAAttachmentRequired, Field: field,
			Title:  "A file attachment is required",
			Detail: "Add the required file on this document, or ask an admin to change attachment settings.",
			Actions: []AssistAction{
				{Label: "Open Form settings", Href: href},
				{Label: "All process policies", Href: hrefProcessPolicies},
			},
		}
	case strings.Contains(lower, "still unconfirmed") || strings.Contains(lower, "not found or not confirmed") ||
		strings.Contains(lower, "confirm the purchase order") || strings.Contains(lower, "not open for receiving") ||
		strings.Contains(lower, "must be open for receiving"):
		return &Assist{
			Code: SAPONotConfirmed, Field: field,
			Title:  "Purchase order must be confirmed first",
			Detail: "Open the purchase order and Confirm it (or ensure it is open for receiving), then come back and try again.",
			Actions: []AssistAction{{Label: "Confirm Purchase Order", Href: hrefPurchaseOrders}},
		}
	case strings.Contains(lower, "purchase request") && (strings.Contains(lower, "confirm") || strings.Contains(lower, "approved") || strings.Contains(lower, "unconfirmed")):
		return &Assist{
			Code: SAPRNotConfirmed, Field: field,
			Title:  "Purchase request is not ready yet",
			Detail: "Confirm or approve the purchase request first, then create the next document.",
			Actions: []AssistAction{{Label: "Open Purchase Requests", Href: hrefPurchaseRequests}},
		}
	case strings.Contains(lower, "rfq") && (strings.Contains(lower, "complete") || strings.Contains(lower, "quote") || strings.Contains(lower, "vendor")):
		return &Assist{
			Code: SARFQIncomplete, Field: field,
			Title:  "RFQ is not ready yet",
			Detail: "Finish vendor quotes on the RFQ, then continue to the purchase order.",
			Actions: []AssistAction{{Label: "Open RFQs", Href: hrefRFQ}},
		}
	case strings.Contains(lower, "what's left to invoice") || strings.Contains(lower, "higher than what is left to invoice"):
		return &Assist{
			Code: SASINoOpenSOBalance, Field: field,
			Title:  "Quantity is higher than what's left to invoice",
			Detail: "Lower the qty, or pick/deliver more on the sales order first.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "release quantity exceeds") || (strings.Contains(lower, "higher than") && strings.Contains(lower, "left to release")) ||
		(strings.Contains(lower, "exceeds balance") && strings.Contains(lower, "available")):
		return &Assist{
			Code: SASINeedsPickRelease, Field: field,
			Title:  "Release qty is higher than what’s left on the order",
			Detail: "Lower the release qty to what’s still open on the sales order line.",
			Actions: []AssistAction{{Label: "Open Sales Orders", Href: hrefSalesOrders}},
		}
	case strings.Contains(lower, "serial") && (strings.Contains(lower, "not in stock") || strings.Contains(lower, "not found") ||
		strings.Contains(lower, "already sold") || strings.Contains(lower, "not available")):
		return &Assist{
			Code: SASerialNotInStock, Field: field,
			Title:  "This serial is not available to use",
			Detail: "Receive it under Purchase Receive, or pick a serial that is still in stock at this location.",
			Actions: []AssistAction{{Label: "Open Serials", Href: hrefSerials}},
		}
	case strings.Contains(lower, "inspection-released") || strings.Contains(lower, "inspection released"):
		return &Assist{
			Code: SASISerialLotNeedsGR, Field: field,
			Title:  "Goods receipt needs QC release first",
			Detail: "Release the inspection on this receipt, then post Purchase Receive again.",
			Actions: []AssistAction{{Label: "Open Purchase Receive", Href: hrefGoodsReceipt}},
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
