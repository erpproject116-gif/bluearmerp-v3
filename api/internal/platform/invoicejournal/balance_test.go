package invoicejournal

import "testing"

func TestLinesBalancedRejectsTaxWithoutVATAccount(t *testing.T) {
	// A completed sale with tax whose output-VAT line was not added
	// (account missing) is not a balanced journal and must not be posted.
	lines := []Line{
		{AccountID: 1, Debit: 1120},
		{AccountID: 2, Credit: 1000},
	}
	if LinesBalanced(lines) {
		t.Fatal("unbalanced tax journal was accepted")
	}
	balanced := []Line{
		{AccountID: 1, Debit: 1120},
		{AccountID: 2, Credit: 1000},
		{AccountID: 3, Credit: 120},
	}
	if !LinesBalanced(balanced) {
		t.Fatal("balanced journal was rejected")
	}
	penny := []Line{
		{AccountID: 1, Debit: 10.00005},
		{AccountID: 2, Credit: 10},
	}
	if !LinesBalanced(penny) {
		t.Fatal("difference within 0.0001 was rejected")
	}
}
