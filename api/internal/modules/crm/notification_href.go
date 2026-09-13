package crm

import (
	"fmt"
	"net/url"
	"strings"
)

// NotificationHref maps a notification entity to an in-app path.
// Aliases collapse to a single canonical route; missing ids fall back to list pages.
func NotificationHref(entityType *string, entityID *int64) string {
	return NotificationHrefForDate(entityType, entityID, nil)
}

// NotificationHrefForDate adds the calendar-day context needed by meeting bells.
func NotificationHrefForDate(entityType *string, entityID *int64, entityDate *string) string {
	et := ""
	if entityType != nil {
		et = strings.TrimSpace(*entityType)
	}
	var id int64
	if entityID != nil && *entityID > 0 {
		id = *entityID
	}

	switch et {
	case "meeting":
		if entityDate != nil {
			if date := strings.TrimSpace(*entityDate); date != "" {
				return "/app/operations/calendar?date=" + url.QueryEscape(date)
			}
		}
		return "/app/operations/calendar"
	case "inv_item", "inv_item_location_balance":
		return "/app/crm/reports/low-stock"
	case "crm_follow_up_task":
		return "/app/crm/follow-up-tasks"
	case "inv_stock_adjustment_request", "inv_serial_adjustment_request":
		return "/app/inventory/stock-adjustments"
	case "fin_account":
		return "/app/finance/acct-i/chart-of-accounts"
	case "wm_work_item":
		return "/app/operations"
	}

	if id > 0 {
		if href := notificationDeepLink(et, id); href != "" {
			return href
		}
		qs := url.Values{}
		if et != "" {
			qs.Set("target_type", et)
		}
		qs.Set("target_id", fmt.Sprintf("%d", id))
		return "/app/activity-logs/changes?" + qs.Encode()
	}

	switch et {
	case "support_ticket", "sup_support_ticket",
		"support_ticket_attachment", "sup_support_ticket_attachment":
		return "/app/support/tickets"
	case "sa_sales", "sales", "sa_sale":
		return "/app/sales/sales"
	case "fin_supplier_invoice", "supplier_invoice":
		return "/app/purchases/purchase-receive"
	case "crm_warranty_asset":
		return "/app/after-sales/warranty"
	case "quo_quotation", "quotation":
		return "/app/quotation/quotations"
	case "inv_item", "inv_item_location_balance":
		return "/app/crm/reports/low-stock"
	case "crm_follow_up_task":
		return "/app/crm/follow-up-tasks"
	case "so_sales_order", "sa_sales_order", "sales_order":
		return "/app/sales-order/sales-orders"
	case "po_purchase_order", "purchase_order":
		return "/app/purchase-order/purchase-orders"
	case "pr_purchase_request", "purchase_request":
		return "/app/purchase-request/purchase-requests"
	case "rfq_request":
		return "/app/purchase-order/rfq"
	case "gr_goods_receipt":
		return "/app/purchases/purchase-receive"
	case "mfg_work_order":
		return "/app/production/assembly/jobs"
	case "mfg_bom":
		return "/app/production/recipe/recipes"
	case "fin_payment_voucher":
		return "/app/finance/payment-vouchers"
	case "fin_official_receipt":
		return "/app/finance/official-receipts"
	case "chat_message":
		return "/app/comms/chat"
	case "fin_account":
		return "/app/finance/acct-i/chart-of-accounts"
	case "wm_work_item":
		return "/app/operations"
	case "inv_stock_adjustment_request", "inv_serial_adjustment_request":
		return "/app/inventory/stock-adjustments"
	case "reconciliation":
		return "/app/crm/notifications"
	default:
		return "/app/crm/notifications"
	}
}

func notificationDeepLink(et string, id int64) string {
	switch et {
	case "support_ticket", "sup_support_ticket",
		"support_ticket_attachment", "sup_support_ticket_attachment":
		return fmt.Sprintf("/app/support/tickets/%d", id)
	case "sa_sales", "sales", "sa_sale":
		return fmt.Sprintf("/app/sales/sales?openId=%d", id)
	case "fin_supplier_invoice", "supplier_invoice":
		return fmt.Sprintf("/app/purchases/purchase-receive?openId=%d", id)
	case "crm_warranty_asset":
		return fmt.Sprintf("/app/after-sales/warranty?openId=%d", id)
	case "quo_quotation", "quotation":
		return fmt.Sprintf("/app/quotation/quotations?openId=%d", id)
	case "so_sales_order", "sa_sales_order", "sales_order":
		return fmt.Sprintf("/app/sales-order/sales-orders?openId=%d", id)
	case "po_purchase_order", "purchase_order":
		return fmt.Sprintf("/app/purchase-order/purchase-orders?openId=%d", id)
	case "pr_purchase_request", "purchase_request":
		return fmt.Sprintf("/app/purchase-request/purchase-requests?openId=%d", id)
	case "rfq_request":
		return fmt.Sprintf("/app/purchase-order/rfq/%d", id)
	case "gr_goods_receipt":
		return fmt.Sprintf("/app/purchases/purchase-receive?openId=%d", id)
	case "mfg_work_order":
		return fmt.Sprintf("/app/production/assembly/jobs?openId=%d", id)
	case "mfg_bom":
		return fmt.Sprintf("/app/production/recipe/recipes?openId=%d", id)
	case "fin_payment_voucher":
		return fmt.Sprintf("/app/finance/payment-vouchers?openId=%d", id)
	case "fin_official_receipt":
		return fmt.Sprintf("/app/finance/official-receipts?openId=%d", id)
	case "chat_message":
		return fmt.Sprintf("/app/comms/chat?messageId=%d", id)
	default:
		return ""
	}
}
