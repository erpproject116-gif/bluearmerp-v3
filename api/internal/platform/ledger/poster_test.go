package ledger

import "testing"

func TestEntryNo(t *testing.T) {
	cases := []struct {
		sourceType string
		id         int64
		want       string
	}{
		{"official_receipt", 42, "official_receipt-42"},
		{"payment_voucher", 7, "payment_voucher-7"},
		{"official_receipt", 0, "official_receipt-0"},
	}
	for _, c := range cases {
		if got := EntryNo(c.sourceType, c.id); got != c.want {
			t.Errorf("EntryNo(%s, %d) = %s, want %s", c.sourceType, c.id, got, c.want)
		}
	}
}
