package response

import "testing"

func TestAssistFromMessageKnownCodes(t *testing.T) {
	cases := []struct {
		msg  string
		code string
	}{
		{"Line 3 exceeds open PO quantity (1.0000 available).", SAPoQtyExceedsOpen},
		{"Quantity exceeds PO balance (2.5000).", SASIQtyExceedsPOBalance},
		{"Serial/lot items require Goods Receipt (Receiving) before purchase. Use Load Slip → Goods Receipt.", SASISerialLotNeedsGR},
		{"line 1: exceeds unreceived PO quantity (0.0000 available). Use Load Slip → Goods Receipt for already received qty, or lower invoice qty", SASIQtyExceedsUnreceivedPO},
		{"Fiscal year FY2025 is closed. Reopen it under Fiscal years before posting to this date.", SAFiscalYearClosed},
		{"Fiscal period 2025-07 is closed. Reopen it under Fiscal years before posting to this date.", SAFiscalPeriodClosed},
		{"Applied amount exceeds outstanding balance (100.0000).", SAPaymentExceedsOutstanding},
		{"Retainer must be funded via OR.", SARetainerNotFunded},
		{"Amount exceeds remaining retainer.", SARetainerExceedsRemaining},
		{"withholding tax code not found", SAWHTCodeNotFound},
		{"Journal entry must balance before posting.", SAJEMustBalance},
		{"Backdated posting is blocked for this tenant.", SABackdatedPostBlocked},
	}
	for _, tc := range cases {
		a := AssistFromMessage("field", tc.msg)
		if a == nil {
			t.Fatalf("nil assist for %q", tc.msg)
		}
		if a.Code != tc.code {
			t.Fatalf("code for %q = %q, want %q", tc.msg, a.Code, tc.code)
		}
		if len(a.Actions) == 0 || a.Actions[0].Href == "" {
			t.Fatalf("missing action for %s", tc.code)
		}
	}
}

func TestValidationSmartAttachesAssist(t *testing.T) {
	// covered via AssistFromErrors + ValidationAssist unit tests
	errs := map[string]string{"qty": "Quantity exceeds PO balance (1.0000)."}
	a := AssistFromErrors(errs)
	if a == nil || a.Code != SASIQtyExceedsPOBalance {
		t.Fatalf("got %#v", a)
	}
}
