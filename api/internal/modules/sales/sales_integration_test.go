package sales

import (
	"strings"
	"testing"
)

func TestBalanceExpr_releaseMode(t *testing.T) {
	got := balanceExpr(false)
	if !strings.Contains(got, "ln.qty") || !strings.Contains(got, "slip.sold") || !strings.Contains(got, "track_serial") {
		t.Fatalf("unexpected legacy balance expr: %q", got)
	}
}

func TestBalanceExpr_deliveryMode(t *testing.T) {
	got := balanceExpr(true)
	if !strings.Contains(got, "dr.delivered") || !strings.Contains(got, "slip.sold") {
		t.Fatalf("unexpected delivery balance expr: %q", got)
	}
}

func TestZeroBalanceMessage(t *testing.T) {
	if !strings.Contains(zeroBalanceMessage(false), "open sales order quantity") {
		t.Fatal("legacy message mismatch")
	}
	if zeroBalanceMessage(true) != "No delivered balance available." {
		t.Fatal("delivery message mismatch")
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
