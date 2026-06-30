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
