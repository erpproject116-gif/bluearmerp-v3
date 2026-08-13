package chat

import "testing"

func TestEntityHref(t *testing.T) {
	id := int64(9)
	cases := []struct {
		et   string
		id   *int64
		want string
	}{
		{"sa_sales", &id, "/app/sales/sales?openId=9"},
		{"so_sales_order", &id, "/app/sales-order/sales-orders?openId=9"},
		{"po_purchase_order", &id, "/app/purchase-order/purchase-orders?openId=9"},
		{"chat_message", &id, "/app/comms/chat?messageId=9"},
		{"report_stock_ledger", nil, "/app/inventory/serial-lot/stock-ledger"},
		{"quo_quotation", &id, "/app/quotation/quotations?openId=9"},
	}
	for _, c := range cases {
		got := EntityHref(c.et, c.id)
		if got != c.want {
			t.Fatalf("%s: got %q want %q", c.et, got, c.want)
		}
	}
}

func TestIsAllowedEntityType(t *testing.T) {
	if !IsAllowedEntityType("quo_quotation") {
		t.Fatal("expected quotation allowed")
	}
	if IsAllowedEntityType("not_a_real_type") {
		t.Fatal("expected unknown rejected")
	}
	if !IsReportEntityType("report_ar_book") {
		t.Fatal("expected report type")
	}
}

func TestMaxAttachmentsBytes(t *testing.T) {
	if MaxAttachmentsBytes != 25*1024*1024 {
		t.Fatalf("want 25MiB got %d", MaxAttachmentsBytes)
	}
}

func TestDmKey(t *testing.T) {
	if dmKey(3, 1) != "1:3" {
		t.Fatalf("dmKey order wrong: %s", dmKey(3, 1))
	}
	if dmKey(1, 3) != "1:3" {
		t.Fatalf("dmKey unstable: %s", dmKey(1, 3))
	}
}

func TestAllowedChatMime(t *testing.T) {
	if !allowedChatMime("image/png", "a.png") {
		t.Fatal("png should be allowed")
	}
	if !allowedChatMime("application/pdf", "x.pdf") {
		t.Fatal("pdf should be allowed")
	}
	if !allowedChatMime("video/mp4", "clip.mp4") {
		t.Fatal("mp4 should be allowed")
	}
}
