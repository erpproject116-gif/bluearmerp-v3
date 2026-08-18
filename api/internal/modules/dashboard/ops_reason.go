package dashboard

const soListHref = "/app/sales-order/sales-orders"
const poListHref = "/app/purchase-order/purchase-orders"

type reasonMeta struct {
	Code  string
	Label string
	Href  string
}

var soReasonOrder = []reasonMeta{
	{Code: "waiting_approval", Label: "Waiting approval", Href: "/app/dashboard/approvals"},
	{Code: "unconfirmed", Label: "Unconfirmed", Href: soListHref},
	{Code: "not_released", Label: "Not released", Href: "/app/sales-order/sales-orders/release"},
	{Code: "not_delivered", Label: "Released, not delivered", Href: "/app/sales-order/delivery-receipts/new"},
	{Code: "not_invoiced", Label: "Delivered, not invoiced", Href: "/app/sales/sales/new"},
	{Code: "in_progress", Label: "In progress", Href: soListHref},
	{Code: "open_other", Label: "Open (other)", Href: soListHref},
}

var poReasonOrder = []reasonMeta{
	{Code: "waiting_approval", Label: "Waiting approval", Href: "/app/dashboard/approvals"},
	{Code: "unconfirmed", Label: "Unconfirmed", Href: poListHref},
	{Code: "awaiting_receipt", Label: "Awaiting receipt", Href: poListHref},
	{Code: "awaiting_bill", Label: "Received, not billed", Href: "/app/purchases/purchase-receive/new"},
	{Code: "open_other", Label: "Open (other)", Href: poListHref},
}

var inboundTypeLabels = map[string]string{
	"goods_receipt": "Purchase receive",
	"receipt":       "Receipt",
	"transfer_in":   "Transfer in",
	"adjustment":    "Adjustment",
	"other":         "Other inbound",
}

var followUpStageLabels = map[string]string{
	"scheduled":       "Scheduled",
	"due_soon":        "Due soon",
	"overdue":         "Overdue",
	"follow_up":       "Follow-up",
	"forwarded_sales": "Forwarded to sales",
}

var followUpTypeLabels = map[string]string{
	"warranty_follow_up":             "Warranty",
	"quote_follow_up":                "Quote",
	"manual":                         "Manual",
	"subscription_trial_follow_up":   "Subscription trial",
	"subscription_renewal_follow_up": "Subscription renewal",
	"subscription_payment_follow_up": "Subscription payment",
}

const qtyEps = 0.0001

// classifySOReason is the exclusive first-match CASE for sales-order headers.
// Keep in lockstep with the predicates documented on opsIntelligenceHandler.
func classifySOReason(progress string, ordered, released, delivered, billed float64) string {
	if progress == "e_approval" {
		return "waiting_approval"
	}
	if progress == "unconfirmed" {
		return "unconfirmed"
	}
	if ordered-released > qtyEps {
		return "not_released"
	}
	if released-delivered > qtyEps {
		return "not_delivered"
	}
	if delivered-billed > qtyEps {
		return "not_invoiced"
	}
	if progress == "in_progress" {
		return "in_progress"
	}
	return "open_other"
}

func soHeaderIncluded(progress string, ordered, released, delivered, billed float64) bool {
	switch progress {
	case "unconfirmed", "e_approval", "in_progress":
		return true
	}
	return ordered-released > qtyEps || released-delivered > qtyEps || delivered-billed > qtyEps
}

func soOpenHeader(progress string) bool {
	switch progress {
	case "unconfirmed", "e_approval", "in_progress":
		return true
	}
	return false
}

// classifyPOReason is the exclusive first-match CASE for purchase-order headers.
func classifyPOReason(progress, status string, openQty, unbilledQty float64) string {
	if progress == "e_approval" {
		return "waiting_approval"
	}
	if progress == "unconfirmed" {
		return "unconfirmed"
	}
	if (status == "confirmed" || status == "partially_received") && openQty > qtyEps {
		return "awaiting_receipt"
	}
	if unbilledQty > qtyEps {
		return "awaiting_bill"
	}
	return "open_other"
}

func poHeaderIncluded(progress, status string, openQty, unbilledQty float64) bool {
	if status == "cancelled" {
		return false
	}
	if progress != "completed" {
		return true
	}
	return openQty > qtyEps || unbilledQty > qtyEps
}

func metaByCode(list []reasonMeta, code string) reasonMeta {
	for _, m := range list {
		if m.Code == code {
			return m
		}
	}
	return reasonMeta{Code: code, Label: code, Href: ""}
}

func inboundTypeLabel(code string) string {
	if label, ok := inboundTypeLabels[code]; ok {
		return label
	}
	return inboundTypeLabels["other"]
}

func normalizeInboundType(code string) string {
	switch code {
	case "goods_receipt", "receipt", "transfer_in", "adjustment":
		return code
	default:
		return "other"
	}
}
