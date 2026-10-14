package finance

import (
	"context"
	"strings"
	"testing"
)

func TestPayableDebitUsesBillAccountNotUnclearedPayments(t *testing.T) {
	if got := payableDebitCode("2010", "2519"); got != "2010" {
		t.Fatalf("withdrawal account = %s, want 2010", got)
	}
	if got := payableDebitCode("", "2519"); got != "2519" {
		t.Fatalf("role account = %s, want 2519", got)
	}
	if got := payableDebitCode("", ""); got != "2010" {
		t.Fatalf("fallback = %s, want 2010", got)
	}
	if got := payableDebitCode("2611", "2010"); got != "2010" {
		t.Fatalf("2611 withdrawal fell through to %s, want 2010", got)
	}
	if got := payableDebitCode("2611", "2611"); got != "2010" {
		t.Fatalf("2611 role fell through to %s, want 2010", got)
	}
}

func TestChooseOneAccountRejectsMixedPayables(t *testing.T) {
	code, err := chooseOneAccount([]string{"2010", "2010"})
	if err != nil || code != "2010" {
		t.Fatalf("same account: code=%s err=%v", code, err)
	}
	if _, err := chooseOneAccount([]string{"2010", "2519"}); err == nil {
		t.Fatal("mixed payable accounts were accepted")
	}
}

func TestDocumentCompletedIsExact(t *testing.T) {
	for _, status := range []string{"", "unconfirmed", "in_progress", "confirm", "e_approval", "finished"} {
		if documentCompleted(status) {
			t.Fatalf("%q was treated as completed", status)
		}
	}
	if !documentCompleted("completed") {
		t.Fatal("completed was not accepted")
	}
}

func TestUnfinishedRepairRemarkMatchesMigration(t *testing.T) {
	sale := unfinishedJournalVoidRemark("Unfinished sale")
	purchase := unfinishedJournalVoidRemark("Unfinished purchase")
	if sale != "Unfinished sale journal reversed because the document is not completed" {
		t.Fatalf("sale remark = %q", sale)
	}
	if purchase != "Unfinished purchase journal reversed because the document is not completed" {
		t.Fatalf("purchase remark = %q", purchase)
	}
}

func TestRepairVoidsOnlyUnfinishedInvoiceJournals(t *testing.T) {
	if !shouldVoidUnfinishedInvoiceJournal("unconfirmed", 14) {
		t.Fatal("unconfirmed sale journal should be reversed")
	}
	if !shouldVoidUnfinishedInvoiceJournal("e_approval", 9) {
		t.Fatal("e-approval purchase journal should be reversed")
	}
	if shouldVoidUnfinishedInvoiceJournal("completed", 14) {
		t.Fatal("completed document journal must stay")
	}
	if shouldVoidUnfinishedInvoiceJournal("unconfirmed", 0) {
		t.Fatal("missing journal must not be voided")
	}
	if err := voidUnfinishedInvoiceJournals(context.Background(), nil, 1, 1, "fin_payment_vouchers", "payment"); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("payment voucher repair err = %v", err)
	}
	if err := voidUnfinishedInvoiceJournals(context.Background(), nil, 1, 1, "fin_official_receipts", "receipt"); err == nil || !strings.Contains(err.Error(), "unsupported") {
		t.Fatalf("official receipt repair err = %v", err)
	}
}

func TestCompletedPurchasePaymentDebitsPayableAndBalances(t *testing.T) {
	ev := buildPVPostingEvent(1, 14, 3, 17500, 0, "cash", payableDebitCode("2010", "2519"), "2360")
	debit, credit := sumDebitsCredits(ev.Lines)
	if debit != credit {
		t.Fatalf("debit %.2f != credit %.2f", debit, credit)
	}
	for _, ln := range ev.Lines {
		if ln.AccountCode == "2611" {
			t.Fatal("completed purchase payment debited 2611")
		}
		if ln.Debit > 0 && ln.AccountCode != "2010" {
			t.Fatalf("debit account %s, want 2010", ln.AccountCode)
		}
	}
}

func TestUncompletedPurchaseIsNotPayable(t *testing.T) {
	for _, status := range []string{"unconfirmed", "e_approval", "confirm", "in_progress"} {
		if documentCompleted(status) {
			t.Fatalf("payment of %s purchase would be allowed", status)
		}
	}
}
