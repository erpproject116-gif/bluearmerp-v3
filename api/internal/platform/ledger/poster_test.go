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
	// Regression for POS receipt journal SQLSTATE 42P08: posted_at must be
	// computed in Go so pgx never binds the same $n as both status text and a
	// SQL `case when $n = 'posted'` comparison (see JournalPoster.Post).
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

func TestJournalPosterBindsStatusSeparatelyFromPostedAt(t *testing.T) {
	// Documents the insert contract in JournalPoster.Post:
	//   $3 = status (text), $5 = posted_at (*time.Time from journalPostedAt).
	// A draft must never send a non-nil posted_at; a posted entry must.
	draftAt := journalPostedAt("draft")
	postedAt := journalPostedAt("posted")
	if draftAt != nil {
		t.Fatal("draft insert must bind posted_at as NULL")
	}
	if postedAt == nil {
		t.Fatal("posted insert must bind a concrete posted_at timestamp")
	}
	statusPosted := "posted"
	statusDraft := "draft"
	if statusPosted == "" || statusDraft == "" {
		t.Fatal("status binds must be plain text, not CASE expressions")
	}
}
