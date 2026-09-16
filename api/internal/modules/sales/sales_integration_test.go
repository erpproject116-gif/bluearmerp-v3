package sales

import (
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

func TestSalesUsesDeliveryBalance(t *testing.T) {
	cases := []struct {
		name    string
		legacy  bool
		require bool
		want    bool
	}{
		{name: "legacy combined", legacy: true, require: false, want: false},
		{name: "split without DR gate", legacy: false, require: false, want: false},
		{name: "split with DR gate", legacy: false, require: true, want: true},
		{name: "legacy ignores DR gate", legacy: true, require: true, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := salesUsesDeliveryBalance(processpolicy.Policy{
				LegacyCombinedSORelease:     tc.legacy,
				SalesRequireDeliveryReceipt: tc.require,
			})
			if got != tc.want {
				t.Fatalf("got %v want %v", got, tc.want)
			}
		})
	}
}

func TestBalanceExpr_releaseMode(t *testing.T) {
	got := balanceExpr(false)
	if !strings.Contains(got, "ln.qty") || !strings.Contains(got, "slip.sold") {
		t.Fatalf("unexpected legacy balance expr: %q", got)
	}
	if strings.Contains(got, "track_serial") || strings.Contains(got, "rel.released") {
		t.Fatalf("legacy balance should not special-case serial release: %q", got)
	}
}

func TestBalanceExpr_deliveryMode(t *testing.T) {
	got := balanceExpr(true)
	if !strings.Contains(got, "dr.delivered") || !strings.Contains(got, "slip.sold") {
		t.Fatalf("unexpected delivery balance expr: %q", got)
	}
}

func TestZeroBalanceMessage(t *testing.T) {
	if !strings.Contains(strings.ToLower(zeroBalanceMessage(false)), "nothing left to invoice") {
		t.Fatal("legacy message mismatch")
	}
	if strings.Contains(zeroBalanceMessage(false), "Pick List") {
		t.Fatal("legacy zero-balance message should not push Pick List for serials")
	}
	if !strings.Contains(strings.ToLower(zeroBalanceMessage(true)), "delivery") {
		t.Fatal("delivery message mismatch")
	}
}

func TestSoMustBeCompletedForSaleMessage(t *testing.T) {
	msg := soMustBeCompletedForSaleMessage()
	if !strings.Contains(msg, "In progress") || !strings.Contains(msg, "Completed") {
		t.Fatalf("expected confirm-or-complete gate message, got %q", msg)
	}
}

func TestSoReadyForInvoice(t *testing.T) {
	if soReadyForInvoice("unconfirmed") {
		t.Fatal("unconfirmed should not invoice")
	}
	if !soReadyForInvoice("in_progress") || !soReadyForInvoice("completed") {
		t.Fatal("in_progress and completed should invoice")
	}
}

func TestSalesOrderLineQtyError(t *testing.T) {
	if salesOrderLineQtyError(10, 5) != "" {
		t.Fatal("expected no error within balance")
	}
	if salesOrderLineQtyError(10, 10) != "" {
		t.Fatal("expected exact balance to pass")
	}
	if salesOrderLineQtyError(10, 10.00005) != "" {
		t.Fatal("expected epsilon tolerance")
	}
	msg := salesOrderLineQtyError(3.5, 4)
	if msg == "" || !strings.Contains(msg, "3.5000") {
		t.Fatalf("expected formatted overage error, got %q", msg)
	}
}

func TestComputeSalesOrderFulfillmentStatus(t *testing.T) {
	cases := []struct {
		name  string
		lines []releaseSoldLine
		want  string
	}{
		{
			name:  "no released lines",
			lines: []releaseSoldLine{{released: 0, sold: 0}},
			want:  "none",
		},
		{
			name:  "released not sold",
			lines: []releaseSoldLine{{released: 5, sold: 0}},
			want:  "none",
		},
		{
			name:  "partial sale",
			lines: []releaseSoldLine{{released: 10, sold: 4}},
			want:  "partial",
		},
		{
			name: "mixed lines partial",
			lines: []releaseSoldLine{
				{released: 10, sold: 10},
				{released: 5, sold: 2},
			},
			want: "partial",
		},
		{
			name: "all released lines fully sold",
			lines: []releaseSoldLine{
				{released: 10, sold: 10},
				{released: 5, sold: 5},
			},
			want: "completed",
		},
		{
			name: "ignores unreleased lines",
			lines: []releaseSoldLine{
				{released: 0, sold: 0},
				{released: 8, sold: 8},
			},
			want: "completed",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := computeSalesOrderFulfillmentStatus(tc.lines); got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
		})
	}
}
