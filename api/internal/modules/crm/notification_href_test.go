package crm

import "testing"

func TestNotificationHref(t *testing.T) {
	id := int64(9)
	et := func(s string) *string { return &s }

	cases := []struct {
		et   *string
		id   *int64
		want string
	}{
		{et("support_ticket"), &id, "/app/support/tickets/9"},
		{et("sup_support_ticket"), &id, "/app/support/tickets/9"},
		{et("sa_sales"), &id, "/app/sales/sales?openId=9"},
		{et("fin_supplier_invoice"), &id, "/app/purchases/purchase-receive?openId=9"},
		{et("crm_warranty_asset"), &id, "/app/after-sales/warranty?openId=9"},
		{et("quo_quotation"), &id, "/app/quotation/quotations?openId=9"},
		{et("inv_item_location_balance"), &id, "/app/crm/reports/low-stock"},
		{et("so_sales_order"), &id, "/app/sales-order/sales-orders?openId=9"},
		{et("po_purchase_order"), &id, "/app/purchase-order/purchase-orders?openId=9"},
		{et("po_purchase_order"), nil, "/app/purchase-order/purchase-orders"},
		{et("pr_purchase_request"), &id, "/app/purchase-request/purchase-requests?openId=9"},
		{et("rfq_request"), &id, "/app/purchase-order/rfq/9"},
		{et("gr_goods_receipt"), &id, "/app/purchases/purchase-receive?openId=9"},
		{et("mfg_work_order"), &id, "/app/production/assembly/jobs?openId=9"},
		{et("mfg_bom"), &id, "/app/production/recipe/recipes?openId=9"},
		{et("chat_message"), &id, "/app/comms/chat?messageId=9"},
		{et("inv_stock_adjustment_request"), &id, "/app/inventory/stock-adjustments"},
		{et("unknown_thing"), &id, "/app/activity-logs/changes?target_id=9&target_type=unknown_thing"},
		{nil, nil, "/app/crm/notifications"},
	}
	for _, c := range cases {
		got := NotificationHref(c.et, c.id)
		if got != c.want {
			t.Fatalf("entity=%v id=%v: got %q want %q", c.et, c.id, got, c.want)
		}
	}
}

func TestNotificationHrefMeetingCalendarDay(t *testing.T) {
	et := "meeting"
	id := int64(42)
	date := "2026-09-15"
	if got, want := NotificationHrefForDate(&et, &id, &date), "/app/operations/calendar?date=2026-09-15"; got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
