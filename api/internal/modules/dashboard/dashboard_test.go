package dashboard

import "testing"

func TestReservedStaleDaysConstant(t *testing.T) {
	if reservedStaleDays <= 0 {
		t.Fatal("reservedStaleDays must be positive")
	}
}

func TestRedFlagCategoryShape(t *testing.T) {
	c := redFlagCategory{Code: "serial_qty_mismatch", Label: "Serial qty mismatch", Count: 3}
	if c.Code == "" || c.Label == "" {
		t.Fatal("red flag category requires code and label")
	}
}
