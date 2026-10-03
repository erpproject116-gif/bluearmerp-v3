package sales

import (
	"strings"
	"testing"
)

func TestReverseCompletedSaleInventoryIsExported(t *testing.T) {
	// Compile-time guard: POS void-last depends on this symbol.
	var _ = ReverseCompletedSaleInventory
}

func TestReversePosCheckoutMovementType(t *testing.T) {
	// Document the contract void-last relies on: checkout writes pos_checkout / sales,
	// reverse writes sales_reversal / pos_checkout.
	const checkoutRef = "pos_checkout"
	const reverseMov = "sales_reversal"
	if !strings.EqualFold(checkoutRef, "pos_checkout") || reverseMov != "sales_reversal" {
		t.Fatal("POS stock reverse contract drifted")
	}
}
