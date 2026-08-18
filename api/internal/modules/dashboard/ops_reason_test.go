package dashboard

import "testing"

func TestClassifySOReasonOrder(t *testing.T) {
	tests := []struct {
		name                                 string
		progress                             string
		ordered, released, delivered, billed float64
		want                                 string
		include                              bool
		open                                 bool
	}{
		{name: "approval beats unreleased", progress: "e_approval", ordered: 10, released: 0, want: "waiting_approval", include: true, open: true},
		{name: "unconfirmed beats unreleased", progress: "unconfirmed", ordered: 10, released: 0, want: "unconfirmed", include: true, open: true},
		{name: "not released", progress: "in_progress", ordered: 10, released: 3, want: "not_released", include: true, open: true},
		{name: "not delivered", progress: "in_progress", ordered: 10, released: 10, delivered: 4, want: "not_delivered", include: true, open: true},
		{name: "not invoiced", progress: "in_progress", ordered: 10, released: 10, delivered: 10, billed: 2, want: "not_invoiced", include: true, open: true},
		{name: "in progress no gap", progress: "in_progress", ordered: 10, released: 10, delivered: 10, billed: 10, want: "in_progress", include: true, open: true},
		{name: "completed unbilled still classified", progress: "completed", ordered: 10, released: 10, delivered: 10, billed: 0, want: "not_invoiced", include: true, open: false},
		{name: "completed fully done excluded", progress: "completed", ordered: 10, released: 10, delivered: 10, billed: 10, want: "open_other", include: false, open: false},
		{name: "eps not a gap", progress: "in_progress", ordered: 10, released: 10, delivered: 10, billed: 9.99995, want: "in_progress", include: true, open: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := classifySOReason(tc.progress, tc.ordered, tc.released, tc.delivered, tc.billed)
			if got != tc.want {
				t.Fatalf("classifySOReason = %s, want %s", got, tc.want)
			}
			if soHeaderIncluded(tc.progress, tc.ordered, tc.released, tc.delivered, tc.billed) != tc.include {
				t.Fatalf("soHeaderIncluded = %v, want %v", !tc.include, tc.include)
			}
			if soOpenHeader(tc.progress) != tc.open {
				t.Fatalf("soOpenHeader = %v, want %v", !tc.open, tc.open)
			}
		})
	}
}

func TestClassifyPOReasonOrder(t *testing.T) {
	tests := []struct {
		name                 string
		progress, status     string
		openQty, unbilledQty float64
		want                 string
		include              bool
	}{
		{name: "approval beats open qty", progress: "e_approval", status: "confirmed", openQty: 5, want: "waiting_approval", include: true},
		{name: "unconfirmed", progress: "unconfirmed", status: "draft", want: "unconfirmed", include: true},
		{name: "awaiting receipt", progress: "completed", status: "confirmed", openQty: 2, want: "awaiting_receipt", include: true},
		{name: "partial awaiting receipt", progress: "completed", status: "partially_received", openQty: 1, want: "awaiting_receipt", include: true},
		{name: "awaiting bill after received", progress: "completed", status: "received", unbilledQty: 3, want: "awaiting_bill", include: true},
		{name: "open other completed no gap", progress: "completed", status: "received", want: "open_other", include: false},
		{name: "cancelled excluded", progress: "unconfirmed", status: "cancelled", openQty: 9, want: "unconfirmed", include: false},
		{name: "draft distinct from completed", progress: "unconfirmed", status: "draft", want: "unconfirmed", include: true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyPOReason(tc.progress, tc.status, tc.openQty, tc.unbilledQty)
			if got != tc.want {
				t.Fatalf("classifyPOReason = %s, want %s", got, tc.want)
			}
			if poHeaderIncluded(tc.progress, tc.status, tc.openQty, tc.unbilledQty) != tc.include {
				t.Fatalf("poHeaderIncluded = %v, want %v", !tc.include, tc.include)
			}
		})
	}
}

func TestSOReasonAllowListComplete(t *testing.T) {
	seen := map[string]bool{}
	for _, m := range soReasonOrder {
		if m.Code == "" || m.Label == "" || m.Href == "" {
			t.Fatalf("incomplete SO reason %+v", m)
		}
		if seen[m.Code] {
			t.Fatalf("duplicate SO reason %s", m.Code)
		}
		seen[m.Code] = true
	}
	for _, code := range []string{"waiting_approval", "unconfirmed", "not_released", "not_delivered", "not_invoiced", "in_progress", "open_other"} {
		if !seen[code] {
			t.Fatalf("missing SO reason %s", code)
		}
	}
}

func TestPOReasonAllowListComplete(t *testing.T) {
	seen := map[string]bool{}
	for _, m := range poReasonOrder {
		if m.Code == "" || m.Label == "" || m.Href == "" {
			t.Fatalf("incomplete PO reason %+v", m)
		}
		if seen[m.Code] {
			t.Fatalf("duplicate PO reason %s", m.Code)
		}
		seen[m.Code] = true
	}
	for _, code := range []string{"waiting_approval", "unconfirmed", "awaiting_receipt", "awaiting_bill", "open_other"} {
		if !seen[code] {
			t.Fatalf("missing PO reason %s", code)
		}
	}
}

func TestNormalizeInboundType(t *testing.T) {
	if normalizeInboundType("goods_receipt") != "goods_receipt" {
		t.Fatal("goods_receipt should stay named")
	}
	if normalizeInboundType("so_release") != "other" {
		t.Fatal("unknown inbound types bucket to other")
	}
	if inboundTypeLabel("other") == "" || inboundTypeLabels["other"] == "" {
		t.Fatal("other inbound label required")
	}
}
