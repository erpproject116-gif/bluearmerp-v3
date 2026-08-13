package crm

import (
	"fmt"
	"strings"
)

// NotificationHref maps a notification entity to an in-app path.
// Aliases collapse to a single canonical route; missing ids fall back to list pages.
func NotificationHref(entityType *string, entityID *int64) string {
	et := ""
	if entityType != nil {
		et = strings.TrimSpace(*entityType)
	}
	var id int64
	if entityID != nil && *entityID > 0 {
		id = *entityID
	}

	switch et {
	case "support_ticket", "sup_support_ticket",
		"support_ticket_attachment", "sup_support_ticket_attachment":
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
	case "inv_item", "inv_item_location_balance":
		return "/app/crm/reports/low-stock"
	case "crm_follow_up_task":
		return "/app/crm/follow-up-tasks"
	case "so_sales_order", "sa_sales_order", "sales_order":
		if id > 0 {
			return fmt.Sprintf("/app/sales-order/sales-orders?openId=%d", id)
		}
		return "/app/sales-order/sales-orders"
	case "po_purchase_order", "purchase_order":
		if id > 0 {
			return fmt.Sprintf("/app/purchase-order/purchase-orders?openId=%d", id)
		}
		return "/app/purchase-request/purchase-orders"
	case "fin_payment_voucher":
		if id > 0 {
			return fmt.Sprintf("/app/finance/payment-vouchers?openId=%d", id)
		}
		return "/app/finance/payment-vouchers"
	case "fin_official_receipt":
		if id > 0 {
			return fmt.Sprintf("/app/finance/official-receipts?openId=%d", id)
		}
		return "/app/finance/official-receipts"
	case "chat_message":
		if id > 0 {
			return fmt.Sprintf("/app/comms/chat?messageId=%d", id)
		}
		return "/app/comms/chat"
	case "fin_account":
		return "/app/finance/acct-i/chart-of-accounts"
	case "wm_work_item":
		return "/app/operations"
	case "reconciliation":
		return "/app/crm/notifications"
	default:
		return "/app/crm/notifications"
	}
}
