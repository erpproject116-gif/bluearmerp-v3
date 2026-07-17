package processpolicy

import (
	"strings"
	"time"
)

// ValidateDirectSale blocks direct SI when tenant policy requires SO-linked invoicing.
func ValidateDirectSale(p Policy, hasSOLinkedLine bool) map[string]string {
	if !p.SalesRequireSO {
		return nil
	}
	if hasSOLinkedLine {
		return nil
	}
	return map[string]string{
		"lines": "Direct sales are disabled. Create a sales order and release stock first.",
	}
}

// ValidateSalesOrderCreate blocks standalone SO when quotation is required.
func ValidateSalesOrderCreate(p Policy, sourceQuotationID *int64) map[string]string {
	if !p.SalesRequireQuotation {
		return nil
	}
	if sourceQuotationID != nil && *sourceQuotationID > 0 {
		return nil
	}
	return map[string]string{
		"source_quotation_id": "A quotation is required before creating a sales order.",
	}
}

// ValidatePurchaseOrderCreate blocks standalone PO when PR is required.
func ValidatePurchaseOrderCreate(p Policy, purchaseRequestID *int64) map[string]string {
	if !p.PurchaseRequirePR {
		return nil
	}
	if purchaseRequestID != nil && *purchaseRequestID > 0 {
		return nil
	}
	return map[string]string{
		"purchase_request_id": "A purchase request is required before creating a purchase order.",
	}
}

// ValidatePurchaseRequestForPO blocks PO conversion when PR approval is required.
func ValidatePurchaseRequestForPO(p Policy, progressStatus string, approvedAt *time.Time) map[string]string {
	if !p.PurchaseRequirePRApproval {
		return nil
	}
	if strings.EqualFold(strings.TrimSpace(progressStatus), "confirmed") && approvedAt != nil {
		return nil
	}
	return map[string]string{
		"purchase_request_id": "Purchase request must be approved before creating a purchase order.",
	}
}

// ValidateSupplierInvoiceLineSource requires a posted goods receipt line on every
// supplier invoice line when the GR-before-invoice policy is enabled. PO-only lines
// are rejected because they bypass the receiving step.
func ValidateSupplierInvoiceLineSource(p Policy, hasGRLine bool) map[string]string {
	if !p.PurchaseRequireGRBeforeSupplierInv || hasGRLine {
		return nil
	}
	return map[string]string{
		"goods_receipt_line_id": "A posted goods receipt line is required before invoicing. Purchase order lines without a goods receipt are not allowed while the GR-before-invoice policy is enabled.",
	}
}

func approvalConfirmed(hasRequest bool, requestStatus string) bool {
	return hasRequest && strings.EqualFold(strings.TrimSpace(requestStatus), "confirmed")
}

// ValidateSalesOrderApproval blocks SO fulfillment (release, conversion to sale)
// when the SO approval policy is on and the order has no confirmed approval request.
// A missing approval request counts as not approved.
func ValidateSalesOrderApproval(p Policy, hasRequest bool, requestStatus string) map[string]string {
	if !p.SalesRequireSOApproval || approvalConfirmed(hasRequest, requestStatus) {
		return nil
	}
	return map[string]string{
		"sales_order_id": "Sales order must be approved before it can be released or invoiced. Submit it for approval first.",
	}
}

// ValidatePurchaseOrderApproval blocks PO confirm, goods receipt and PO-linked
// supplier invoicing when the PO approval policy is on and the order has no
// confirmed approval request. A missing approval request counts as not approved.
func ValidatePurchaseOrderApproval(p Policy, hasRequest bool, requestStatus string) map[string]string {
	if !p.PurchaseRequirePOApproval || approvalConfirmed(hasRequest, requestStatus) {
		return nil
	}
	return map[string]string{
		"purchase_order_id": "Purchase order must be approved before this step. Submit it for approval first.",
	}
}

// AllowJournalAutoPost reports whether an automatic journal posting may skip the
// draft stage. When finance_require_je_approval is on, auto-post is downgraded so
// the entry stays in draft until it passes approval.
func AllowJournalAutoPost(p Policy, autoPost bool) bool {
	return autoPost && !p.FinanceRequireJEApproval
}

// ValidateJournalEntryPost blocks direct journal posting when the JE approval
// policy is on and the entry has no confirmed approval request.
func ValidateJournalEntryPost(p Policy, hasRequest bool, requestStatus string) map[string]string {
	if !p.FinanceRequireJEApproval || approvalConfirmed(hasRequest, requestStatus) {
		return nil
	}
	return map[string]string{
		"status": "Journal entry must be approved before posting. Submit it for approval first.",
	}
}

// ValidateSalesInvoiceQtyAgainstDelivery blocks SI qty above delivered when DR policy is on.
func ValidateSalesInvoiceQtyAgainstDelivery(p Policy, qty, deliveredQty float64) map[string]string {
	if !p.SalesRequireDeliveryReceipt {
		return nil
	}
	if qty <= deliveredQty+0.0001 {
		return nil
	}
	return map[string]string{
		"qty": "Quantity exceeds delivered quantity for this sales order line.",
	}
}

// ValidateSupplierInvoiceQtyAgainstReceived blocks invoice qty above received when GR policy is on.
func ValidateSupplierInvoiceQtyAgainstReceived(p Policy, qty, receivedQty float64) map[string]string {
	if !p.PurchaseRequireGRBeforeSupplierInv {
		return nil
	}
	if qty <= receivedQty+0.0001 {
		return nil
	}
	return map[string]string{
		"qty": "Quantity exceeds received quantity on the purchase receipt line.",
	}
}

// ValidateSalesReleaseRequiresReservation enforces stock reservation before SO release (split mode)
// or available unreserved stock (legacy combined mode).
func ValidateSalesReleaseRequiresReservation(
	p Policy,
	legacyCombined bool,
	lineQtyReserved, alreadyReleased, releaseQty, qtyOnHand, qtyReservedAtLocation float64,
) map[string]string {
	if !p.SalesRequireReservation {
		return nil
	}
	if releaseQty <= 0.0001 {
		return nil
	}
	if legacyCombined {
		available := qtyOnHand - qtyReservedAtLocation
		if available+0.0001 < releaseQty {
			return map[string]string{
				"release_qty": "Insufficient available stock. Reservation is required before release.",
			}
		}
		return nil
	}
	remainingReserved := lineQtyReserved - alreadyReleased
	if remainingReserved+0.0001 < releaseQty {
		return map[string]string{
			"release_qty": "Line must be reserved before release. Confirm the sales order to reserve stock.",
		}
	}
	return nil
}

// ValidateDeliveryRequiresRelease blocks DR qty above released minus delivered when reservation policy is on.
func ValidateDeliveryRequiresRelease(p Policy, releasedQty, deliveredQty, drQty float64) map[string]string {
	if !p.SalesRequireReservation {
		return nil
	}
	releasable := releasedQty - deliveredQty
	if drQty <= releasable+0.0001 {
		return nil
	}
	return map[string]string{
		"qty": "Delivery quantity exceeds released quantity. Release stock before posting delivery.",
	}
}

// ValidateReleaseQty blocks release above order qty minus already released.
func ValidateReleaseQty(orderQty, alreadyReleased, releaseQty float64) map[string]string {
	if releaseQty <= 0.0001 {
		return map[string]string{"release_qty": "Release quantity must be positive."}
	}
	if alreadyReleased+releaseQty <= orderQty+0.0001 {
		return nil
	}
	return map[string]string{
		"release_qty": "Release quantity exceeds remaining order quantity.",
	}
}
