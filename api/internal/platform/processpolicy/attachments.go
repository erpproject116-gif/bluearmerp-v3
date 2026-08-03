package processpolicy

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
)

const attachmentRequiredMsg = "At least one attachment is required before confirming this document. Save as Unconfirmed, upload a file, then confirm — or turn off “Require file” under Form settings / module Setup."

// DocKind identifies a document type that supports attachments.
type DocKind string

const (
	DocQuotation        DocKind = "quotation"
	DocSalesOrder       DocKind = "sales_order"
	DocSales            DocKind = "sales"
	DocPurchaseOrder    DocKind = "purchase_order"
	DocSupplierInvoice  DocKind = "supplier_invoice"
)

// IsConfirmingProgress reports whether a progress/status value means the document is being confirmed.
func IsConfirmingProgress(kind DocKind, status string) bool {
	switch kind {
	case DocQuotation, DocSalesOrder:
		return status == "in_progress" || status == "completed"
	case DocSales:
		return status == "completed" || status == "e_approval"
	case DocSupplierInvoice:
		return status == "completed" || status == "e_approval"
	default:
		return false
	}
}

func policyRequiresAttachment(p Policy, kind DocKind) bool {
	switch kind {
	case DocQuotation:
		return p.QuotationRequireAttachment
	case DocSalesOrder:
		return p.SalesOrderRequireAttachment
	case DocSales:
		return p.SalesRequireAttachment
	case DocPurchaseOrder:
		return p.PurchaseOrderRequireAttachment
	case DocSupplierInvoice:
		return p.SupplierInvoiceRequireAttachment
	default:
		return false
	}
}

func attachmentMeta(kind DocKind) (table, fkCol string, ok bool) {
	switch kind {
	case DocQuotation:
		return "public.quo_quotation_attachments", "quotation_id", true
	case DocSalesOrder:
		return "public.so_sales_order_attachments", "sales_order_id", true
	case DocSales:
		return "public.sa_sales_attachments", "sales_id", true
	case DocPurchaseOrder:
		return "public.po_purchase_order_attachments", "purchase_order_id", true
	case DocSupplierInvoice:
		return "public.fin_supplier_invoice_attachments", "supplier_invoice_id", true
	default:
		return "", "", false
	}
}

// ValidateAttachmentRequired checks tenant policy when a document moves to a confirming status.
// docID may be zero on create — callers should reject confirming status on create separately.
func ValidateAttachmentRequired(ctx context.Context, pool *pgxpool.Pool, p Policy, kind DocKind, status string, docID int64) map[string]string {
	if !IsConfirmingProgress(kind, status) || !policyRequiresAttachment(p, kind) {
		return nil
	}
	if docID <= 0 {
		return map[string]string{"attachments": attachmentRequiredMsg}
	}
	table, fkCol, ok := attachmentMeta(kind)
	if !ok {
		return nil
	}
	n, err := attachmentx.Count(ctx, pool, table, fkCol, docID)
	if err != nil {
		return map[string]string{"attachments": "Failed to verify attachments."}
	}
	if n < 1 {
		return map[string]string{"attachments": attachmentRequiredMsg}
	}
	return nil
}

// ValidatePurchaseOrderConfirm checks attachment policy when confirming a draft PO.
func ValidatePurchaseOrderConfirm(ctx context.Context, pool *pgxpool.Pool, p Policy, poID int64) map[string]string {
	if !p.PurchaseOrderRequireAttachment {
		return nil
	}
	n, err := attachmentx.Count(ctx, pool, "public.po_purchase_order_attachments", "purchase_order_id", poID)
	if err != nil {
		return map[string]string{"attachments": "Failed to verify attachments."}
	}
	if n < 1 {
		return map[string]string{"attachments": attachmentRequiredMsg}
	}
	return nil
}
