package activitylog

import "fmt"

// recordHistoryParentKey maps a target_type to a JSON field on new_values that references the parent record.
// Used so releases, attachments, etc. appear on the parent transaction's history.
func recordHistoryParentKey(targetType string) string {
	switch targetType {
	case "so_sales_order":
		return "sales_order_id"
	case "sa_sales":
		return "sales_id"
	case "quo_quotation":
		return "quotation_id"
	case "pr_purchase_request":
		return "purchase_request_id"
	case "po_purchase_order":
		return "purchase_order_id"
	case "gr_goods_receipt":
		return "goods_receipt_id"
	case "fin_supplier_invoice":
		return "supplier_invoice_id"
	case "rfq_supplier_quotation":
		return "supplier_quotation_id"
	case "fin_official_receipt":
		return "official_receipt_id"
	default:
		return ""
	}
}

func appendScopedRecordWhere(where string, targetType string, typeArg, idArg int) string {
	parentKey := recordHistoryParentKey(targetType)
	if parentKey == "" {
		// Always scope by both type and id so unrelated rows with the same numeric id are excluded.
		return where + fmt.Sprintf(" and al.target_type = $%d and al.target_id = $%d", typeArg, idArg)
	}
	return where + fmt.Sprintf(` and (
	  (al.target_type = $%d and al.target_id = $%d)
	  or (al.new_values->>'%s' = $%d::text)
	)`, typeArg, idArg, parentKey, idArg)
}
