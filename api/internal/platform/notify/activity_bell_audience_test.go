package notify

import "testing"

func TestActivityBellAudiencePermissions(t *testing.T) {
	cases := []struct {
		action, target string
		want           int
	}{
		{"sales.confirm", "sa_sales", 2},
		{"purchase_order.confirm", "po_purchase_order", 2},
		{"manufacturing.work_order_release", "mfg_work_order", 2},
		{"goods_receipt.post", "gr_goods_receipt", 2},
		{"purchase_request.approve", "pr_purchase_request", 1},
		{"unknown.action", "mfg_bom", 2},
	}
	for _, c := range cases {
		got := activityBellAudiencePermissions(c.action, c.target)
		if len(got) != c.want {
			t.Fatalf("%s/%s: got %v len %d want %d", c.action, c.target, got, len(got), c.want)
		}
	}
}

func TestActivityBellNotifyOwner(t *testing.T) {
	if !activityBellNotifyOwner("purchase_order.confirm", "po_purchase_order") {
		t.Fatal("confirm should notify owner")
	}
	if !activityBellNotifyOwner("goods_receipt.post", "gr_goods_receipt") {
		t.Fatal("GR post should notify owner")
	}
	if activityBellNotifyOwner("quotation.share", "quo_quotation") {
		t.Fatal("share should not force owner-only path")
	}
}

func TestActivityBellDedupeKeyForUser(t *testing.T) {
	base := "act:sales.confirm:sa_sales:1:2026-09-13-10"
	got := activityBellDedupeKeyForUser(base, 42)
	if got != base+":u42" {
		t.Fatalf("got %q", got)
	}
}
