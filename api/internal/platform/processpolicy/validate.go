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
