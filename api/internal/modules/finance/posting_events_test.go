package finance

import (
	"math"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
)

func sumDebitsCredits(lines []ledger.PostingLine) (debit, credit float64) {
	for _, ln := range lines {
		debit += ln.Debit
		credit += ln.Credit
	}
	return debit, credit
}

func TestBuildPVPostingEventBalancesWithWithholding(t *testing.T) {
	ev := buildPVPostingEvent(1, 42, 7, 1000, 20, "bank_transfer", "2040")
	if ev.SourceType != "payment_voucher" || ev.SourceID != 42 {
		t.Fatalf("unexpected source: %s-%d", ev.SourceType, ev.SourceID)
	}
	debit, credit := sumDebitsCredits(ev.Lines)
	if math.Abs(debit-credit) > 0.0001 {
		t.Fatalf("event not balanced: debit=%.4f credit=%.4f", debit, credit)
	}
	var creditAcct string
	var whtCredit float64
	for _, ln := range ev.Lines {
		if ln.Credit > 0 && ln.AccountCode != "2040" {
			creditAcct = ln.AccountCode
		}
		if ln.AccountCode == "2040" {
			whtCredit = ln.Credit
		}
	}
	if creditAcct != "1023" {
		t.Fatalf("bank_transfer should credit 1023, got %s", creditAcct)
	}
	if math.Abs(whtCredit-20) > 0.0001 {
		t.Fatalf("withholding credit = %.4f, want 20", whtCredit)
	}
}

func TestBuildPVPostingEventCreditAccountByMethod(t *testing.T) {
	cases := map[string]string{"cash": "1020", "check": "1029", "bank_transfer": "1023"}
	for method, want := range cases {
		ev := buildPVPostingEvent(1, 1, 7, 500, 0, method, "2040")
		var got string
		for _, ln := range ev.Lines {
			if ln.Credit > 0 {
				got = ln.AccountCode
			}
		}
		if got != want {
			t.Errorf("method %s: credit account = %s, want %s", method, got, want)
		}
	}
}

func TestBuildORPostingEventSkipsInvalidLines(t *testing.T) {
	partner := int64(9)
	ev := buildORPostingEvent(1, 5, []journalLineBody{
		{DepositAccountCode: "1020", GLAccountCode: "1130", Amount: 100, Fees: 10, PartnerID: &partner},
		{DepositAccountCode: "", GLAccountCode: "1130", Amount: 100},  // missing deposit account
		{DepositAccountCode: "1020", GLAccountCode: "1130", Amount: 0}, // zero amount
	})
	// One valid line with fees expands to 4 posting lines (amount pair + fees pair).
	if len(ev.Lines) != 4 {
		t.Fatalf("expected 4 posting lines, got %d", len(ev.Lines))
	}
	debit, credit := sumDebitsCredits(ev.Lines)
	if math.Abs(debit-110) > 0.0001 || math.Abs(credit-110) > 0.0001 {
		t.Fatalf("expected 110/110, got debit=%.4f credit=%.4f", debit, credit)
	}
}

func TestOverAppliedErrorIsError(t *testing.T) {
	err := overAppliedError{message: "too much"}
	if err.Error() != "too much" {
		t.Fatalf("unexpected message: %s", err.Error())
	}
}
