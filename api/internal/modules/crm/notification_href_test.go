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
		{et("chat_message"), &id, "/app/comms/chat?messageId=9"},
		{nil, nil, "/app/crm/notifications"},
		{et("unknown_thing"), &id, "/app/crm/notifications"},
	}
	for _, c := range cases {
		got := NotificationHref(c.et, c.id)
		if got != c.want {
			t.Fatalf("entity=%v id=%v: got %q want %q", c.et, c.id, got, c.want)
		}
	}
}
