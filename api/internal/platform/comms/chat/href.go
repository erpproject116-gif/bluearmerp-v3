package chat

import (
	"fmt"
	"strings"
)

// MaxAttachmentsBytes is the combined attachment size limit per message (25 MiB).
const MaxAttachmentsBytes = 25 * 1024 * 1024

// EntityHref maps a chat link entity to an in-app path. Never trust client hrefs.
func EntityHref(entityType string, entityID *int64) string {
	et := strings.TrimSpace(entityType)
	var id int64
	if entityID != nil && *entityID > 0 {
		id = *entityID
	}

	switch et {
	case "support_ticket", "sup_support_ticket":
		if id > 0 {
			return fmt.Sprintf("/app/support/tickets/%d", id)
		}
		return "/app/support/tickets"
	case "sa_sales", "sales", "sa_sale":
		if id > 0 {
			return fmt.Sprintf("/app/sales/sales?openId=%d", id)
		}
		return "/app/sales/sales"
	case "fin_supplier_invoice", "supplier_invoice":
		if id > 0 {
			return fmt.Sprintf("/app/purchases/purchase-receive?openId=%d", id)
		}
		return "/app/purchases/purchase-receive"
	case "crm_warranty_asset":
		if id > 0 {
			return fmt.Sprintf("/app/after-sales/warranty?openId=%d", id)
		}
		return "/app/after-sales/warranty"
	case "quo_quotation", "quotation":
		if id > 0 {
			return fmt.Sprintf("/app/quotation/quotations?openId=%d", id)
		}
		return "/app/quotation/quotations"
	case "so_sales_order", "sa_sales_order", "sales_order":
		if id > 0 {
			return fmt.Sprintf("/app/sales-order/sales-orders?openId=%d", id)
		}
		return "/app/sales-order/sales-orders"
	case "po_purchase_order", "purchase_order":
		if id > 0 {
			return fmt.Sprintf("/app/purchase-order/purchase-orders?openId=%d", id)
		}
		return "/app/purchase-order/purchase-orders"
	case "pr_purchase_request":
		if id > 0 {
			return fmt.Sprintf("/app/purchase-request/purchase-requests?openId=%d", id)
		}
		return "/app/purchase-request/purchase-requests"
	case "rfq_request":
		if id > 0 {
			return fmt.Sprintf("/app/purchase-order/rfq/%d", id)
		}
		return "/app/purchase-order/rfq"
	case "rfq_supplier_quotation":
		return "/app/purchase-order/rfq"
	case "gr_goods_receipt":
		return "/app/purchase-order/goods-receipt"
	case "fin_official_receipt":
		if id > 0 {
			return fmt.Sprintf("/app/finance/official-receipts?openId=%d", id)
		}
		return "/app/finance/official-receipts"
	case "fin_payment_voucher":
		if id > 0 {
			return fmt.Sprintf("/app/finance/payment-vouchers?openId=%d", id)
		}
		return "/app/finance/payment-vouchers"
	case "job_cost_project":
		return "/app/job-costing"
	case "chat_message":
		if id > 0 {
			return fmt.Sprintf("/app/comms/chat?messageId=%d", id)
		}
		return "/app/comms/chat"
	case "report_ar_book":
		return "/app/finance/acct-i/customer-vendor-book"
	case "report_ap_book":
		return "/app/finance/acct-i/customer-vendor-book"
	case "report_stock_ledger":
		return "/app/inventory/serial-lot/stock-ledger"
	default:
		return "/app/comms/chat"
	}
}

var allowedEntityTypes = map[string]bool{
	"quo_quotation": true, "so_sales_order": true, "sa_sales": true,
	"pr_purchase_request": true, "rfq_request": true, "rfq_supplier_quotation": true,
	"po_purchase_order": true, "gr_goods_receipt": true, "fin_supplier_invoice": true,
	"fin_official_receipt": true, "fin_payment_voucher": true, "job_cost_project": true,
	"support_ticket": true, "crm_warranty_asset": true,
	"report_ar_book": true, "report_ap_book": true, "report_stock_ledger": true,
}

func IsAllowedEntityType(et string) bool {
	return allowedEntityTypes[strings.TrimSpace(et)]
}

// Report types have no entity_id.
func IsReportEntityType(et string) bool {
	switch strings.TrimSpace(et) {
	case "report_ar_book", "report_ap_book", "report_stock_ledger":
		return true
	default:
		return false
	}
}
