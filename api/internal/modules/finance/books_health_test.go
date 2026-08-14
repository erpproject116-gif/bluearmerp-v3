package finance

import "testing"

func TestBooksHealthReadyBlocksOnExceptions(t *testing.T) {
	h := booksHealthResponse{
		Exceptions: []booksHealthException{
			{Code: "draft_journals", Severity: "block", Count: 2},
		},
	}
	if booksHealthReady(h) {
		t.Fatal("expected not ready when block exceptions present")
	}
	h.Exceptions = []booksHealthException{
		{Code: "sales_pre_invoicing", Severity: "warn", Count: 3},
	}
	if !booksHealthReady(h) {
		t.Fatal("warnings alone should not block ready_to_close")
	}
	h.Fiscal.IsClosed = true
	if booksHealthReady(h) {
		t.Fatal("closed fiscal period should not be ready_to_close")
	}
}

func TestBuildBooksHealthExceptionsHybrid(t *testing.T) {
	h := booksHealthResponse{
		Policies: booksHealthPolicies{InventoryGLHybridEnabled: true},
		HybridInventoryUnmapped: true,
		InventoryClosingDifference: 12.5,
		SignoffLinks: booksHealthSignoffLinks{
			ChartOfAccountsDefaults:     "/coa",
			AcctInventoryReconciliation: "/recon",
			JournalEntries:              "/je",
		},
	}
	ex := buildBooksHealthExceptions(h)
	foundUnmapped, foundDiff := false, false
	for _, e := range ex {
		if e.Code == "hybrid_inventory_unmapped" {
			foundUnmapped = true
		}
		if e.Code == "inventory_vs_gl" {
			foundDiff = true
		}
	}
	if !foundUnmapped || !foundDiff {
		t.Fatalf("expected hybrid exceptions, got %#v", ex)
	}
}
