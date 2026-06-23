package activitylog

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

var fieldLabels = map[string]string{
	"progress_status":          "Progress status",
	"invoicing_status":         "Invoicing status",
	"voucher_status":           "Voucher status",
	"stage":                    "Stage",
	"status":                   "Status",
	"warranty_end":             "Warranty end date",
	"warranty_start":           "Warranty start date",
	"warranty_duration_months": "Warranty (months)",
	"reorder_level":            "Reorder level",
	"partner_id":               "Customer",
	"pic_name":                 "PIC",
	"pic_user_id":              "PIC user",
	"due_date":                 "Due date",
	"order_date":               "Order date",
	"valid_until":              "Valid until",
	"grand_total":              "Grand total",
	"subtotal":                 "Subtotal",
	"tax_total":                "Tax total",
	"item_name":                "Item name",
	"item_code":                "Item code",
	"sales_price":              "Sales price",
	"purchase_price":           "Purchase price",
	"vip_price":                "VIP price",
	"company_name":             "Company name",
	"partner_kind":             "Partner type",
	"payment_terms":            "Payment terms",
	"notes":                    "Notes",
	"title":                    "Title",
	"is_enabled":               "Rule enabled",
	"lead_value":               "Lead time value",
	"lead_unit":                "Lead time unit",
	"name":                     "Name",
	"qty_on_hand":              "Quantity on hand",
	"serial_lot_no":            "Serial / lot no.",
	"reference_no":             "Reference no.",
	"receipt_no":               "Receipt no.",
	"amount_total":             "Amount",
	"payment_method":           "Payment method",
	"repair_details":           "Repair details",
	"scheduled_completion_date": "Scheduled completion",
}

var entityLabels = map[string]string{
	"sa_sales":                  "Sales Invoice",
	"so_sales_order":            "Sales Order",
	"quo_quotation":             "Quotation",
	"fin_official_receipt":      "Official Receipt",
	"crm_warranty_asset":        "Warranty record",
	"crm_follow_up_task":        "Follow-up task",
	"crm_alert_rule":            "Alert rule",
	"inv_item":                  "Item",
	"inv_partner":               "Partner",
	"inv_location":              "Location",
	"inv_project":               "Project",
	"inv_department":            "Department",
	"inv_repair_order":          "Repair order",
	"inv_repair_registration":   "Register repair",
	"inv_stock_movement":        "Stock movement",
	"quo_tax_type":              "Tax type",
	"quo_currency":              "Currency",
	"tenant_role":               "User role",
	"user":                      "User",
}

var referenceLabels = map[string]string{
	"sa_sales":                "Sales No.",
	"so_sales_order":          "Sales Order No.",
	"quo_quotation":           "Quote Ref.",
	"fin_official_receipt":    "Receipt No.",
	"crm_warranty_asset":      "Serial No.",
	"inv_repair_order":        "Repair Order No.",
	"inv_repair_registration": "Registration No.",
	"inv_item":                "Item Code",
	"inv_partner":             "Partner Code",
}

func entityLabel(targetType string) string {
	if l, ok := entityLabels[targetType]; ok {
		return l
	}
	return strings.ReplaceAll(targetType, "_", " ")
}

func referenceLabel(targetType string) string {
	if l, ok := referenceLabels[targetType]; ok {
		return l
	}
	return "Reference"
}

func actionVerb(actionCode string) string {
	switch {
	case strings.HasSuffix(actionCode, ".update"):
		return "updated"
	case strings.HasSuffix(actionCode, ".delete"):
		return "deleted"
	case strings.HasSuffix(actionCode, ".progress_status"):
		return "changed progress on"
	case strings.HasSuffix(actionCode, ".invoicing_status"):
		return "changed invoicing on"
	case strings.HasSuffix(actionCode, ".stage"):
		return "moved stage on"
	case strings.HasSuffix(actionCode, ".release"):
		return "released"
	case strings.HasSuffix(actionCode, ".convert"):
		return "converted"
	case strings.HasSuffix(actionCode, ".adjustment"):
		return "adjusted stock for"
	case strings.HasSuffix(actionCode, ".price_batch"):
		return "batch-updated prices on"
	case strings.HasSuffix(actionCode, ".warranty.update"):
		return "updated warranty for"
	case strings.HasSuffix(actionCode, ".rule.update"):
		return "updated alert rule"
	case strings.HasSuffix(actionCode, ".task.update"), strings.HasSuffix(actionCode, ".task.stage"):
		return "updated follow-up task"
	case strings.HasSuffix(actionCode, ".attachment.upload"):
		return "uploaded attachment to"
	case strings.HasSuffix(actionCode, ".import"):
		return "imported"
	case strings.HasSuffix(actionCode, ".invite"):
		return "invited"
	case strings.HasSuffix(actionCode, ".invite_revoke"):
		return "revoked invite for"
	default:
		return "modified"
	}
}

func labelForField(key string) string {
	if l, ok := fieldLabels[key]; ok {
		return l
	}
	return strings.ReplaceAll(strings.TrimSuffix(key, "_id"), "_", " ")
}

func formatValue(v any) string {
	switch t := v.(type) {
	case nil:
		return "—"
	case bool:
		if t {
			return "Yes"
		}
		return "No"
	case float64:
		if t == float64(int64(t)) {
			return fmt.Sprintf("%d", int64(t))
		}
		return fmt.Sprintf("%.2f", t)
	case json.Number:
		return t.String()
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return "—"
		}
		if strings.Contains(s, "_") && !strings.Contains(s, " ") {
			return strings.ReplaceAll(s, "_", " ")
		}
		return s
	case []any:
		return fmt.Sprintf("%d items", len(t))
	case map[string]any:
		return "record updated"
	default:
		return fmt.Sprintf("%v", t)
	}
}

func asMap(raw json.RawMessage) map[string]any {
	if len(raw) == 0 || string(raw) == "null" {
		return nil
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return nil
	}
	return m
}

func diffChanges(oldM, newM map[string]any) []string {
	if newM == nil && oldM == nil {
		return nil
	}
	skipKeys := map[string]bool{
		"lines": true, "applications": true, "password": true,
	}
	keys := map[string]bool{}
	for k := range oldM {
		keys[k] = true
	}
	for k := range newM {
		keys[k] = true
	}
	sorted := make([]string, 0, len(keys))
	for k := range keys {
		if skipKeys[k] || strings.HasSuffix(k, "_id") && k != "partner_id" {
			continue
		}
		sorted = append(sorted, k)
	}
	sort.Strings(sorted)

	var out []string
	for _, k := range sorted {
		oldV, hasOld := oldM[k]
		newV, hasNew := newM[k]
		if !hasOld && !hasNew {
			continue
		}
		if hasOld && hasNew && fmt.Sprint(oldV) == fmt.Sprint(newV) {
			continue
		}
		lbl := labelForField(k)
		switch {
		case hasOld && hasNew:
			out = append(out, fmt.Sprintf("%s changed from %s to %s", lbl, formatValue(oldV), formatValue(newV)))
		case hasNew:
			out = append(out, fmt.Sprintf("%s set to %s", lbl, formatValue(newV)))
		case hasOld:
			out = append(out, fmt.Sprintf("%s cleared (was %s)", lbl, formatValue(oldV)))
		}
	}
	if _, ok := newM["lines"]; ok || oldM["lines"] != nil {
		out = append(out, "Line items were updated")
	}
	return out
}

func formatChangeSummary(actorName, actionCode, targetType, referenceNo string, oldJSON, newJSON json.RawMessage) (summary string, details []string) {
	oldM := asMap(oldJSON)
	newM := asMap(newJSON)
	details = diffChanges(oldM, newM)

	entity := entityLabel(targetType)
	verb := actionVerb(actionCode)
	ref := strings.TrimSpace(referenceNo)

	var refPart string
	if ref != "" {
		refPart = fmt.Sprintf(" %s %s", referenceLabel(targetType), ref)
	}

	actor := strings.TrimSpace(actorName)
	if actor == "" {
		actor = "A user"
	}

	if len(details) == 0 {
		switch {
		case strings.HasSuffix(actionCode, ".delete"):
			details = []string{fmt.Sprintf("%s was removed", entity)}
		case strings.HasSuffix(actionCode, ".release"):
			details = []string{"Stock was released against this order"}
		case strings.HasSuffix(actionCode, ".convert"):
			details = []string{"Record was converted to the next step"}
		case strings.HasSuffix(actionCode, ".adjustment"):
			details = []string{"Inventory quantity was adjusted"}
		case strings.HasSuffix(actionCode, ".price_batch"):
			details = []string{"Sales prices were updated in batch"}
		case strings.HasSuffix(actionCode, ".attachment.upload"):
			details = []string{"A file attachment was added"}
		default:
			details = []string{fmt.Sprintf("%s was modified", entity)}
		}
	}

	summary = fmt.Sprintf("%s %s %s%s.", actor, verb, entity, refPart)
	if len(details) > 0 {
		summary = fmt.Sprintf("%s %s %s%s: %s.", actor, verb, entity, refPart, details[0])
	}
	return summary, details
}
