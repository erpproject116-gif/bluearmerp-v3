package sales

import "testing"

func TestUnconfirmedSaleSaveCreatesNoJournal(t *testing.T) {
	for _, status := range []string{"unconfirmed", "in_progress", "confirm", "e_approval", "finished"} {
		if got := PlanSaleJournal(status, false, "", 0, 6500); got != SaleJournalSkip {
			t.Fatalf("%s planned %s, want skip", status, got)
		}
	}
}

func TestCompletedSalePostsOnceAndSecondSaveKeepsIt(t *testing.T) {
	if got := PlanSaleJournal("completed", false, "", 0, 6500); got != SaleJournalCreate {
		t.Fatalf("first completed save planned %s, want create", got)
	}
	if got := PlanSaleJournal("completed", true, "posted", 6500, 6500); got != SaleJournalKeep {
		t.Fatalf("second save planned %s, want keep", got)
	}
	if got := PlanSaleJournal("completed", true, "posted", 5000, 6500); got != SaleJournalResync {
		t.Fatalf("changed total planned %s, want resync", got)
	}
}
