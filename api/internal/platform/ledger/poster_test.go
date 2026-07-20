package ledger

import (
	"testing"
	"time"
)

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

func TestJournalPostedAt(t *testing.T) {
	if got := journalPostedAt("draft"); got != nil {
		t.Fatalf("draft status should not set posted_at, got %v", got)
	}
	if got := journalPostedAt("cancelled"); got != nil {
		t.Fatalf("cancelled status should not set posted_at, got %v", got)
	}
	got := journalPostedAt("posted")
	if got == nil {
		t.Fatal("posted status should set posted_at")
	}
	if time.Since(*got) > 5*time.Second || time.Until(*got) > time.Second {
		t.Fatalf("posted_at should be near now, got %v", *got)
	}
}
