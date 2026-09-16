package response

import "testing"

func TestAssistFromMessageKnownCodes(t *testing.T) {
	cases := []struct {
		msg  string
		code string
	}{
		{"Line 3 exceeds open PO quantity (1.0000 available).", SAPoQtyExceedsOpen},
		{"Quantity exceeds PO balance (2.5000).", SASIQtyExceedsPOBalance},
		{"Quantity is higher than the open PO balance (2.5000). Lower the qty or receive more first.", SASIQtyExceedsPOBalance},
		{"Quantity is higher than what was received (1.0000). Lower the qty or receive more first.", SASIQtyExceedsPOBalance},
		{"Quantity is higher than what's left to invoice (1.0000). Lower the qty, or pick/deliver more first.", SASINoOpenSOBalance},
		{"Quantity is higher than what was delivered for this sales order line. Post a Delivery note or lower the qty.", SASIExceedsDelivered},
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
		{"This item isn’t ready to invoice yet. For serial items, open the sales order → Pick List → release qty and scan the serial, then use Load Slip on this sale.", SASINeedsPickRelease},
		{"This sales order isn’t ready to invoice yet. Confirm it first (set Progress to In progress or Completed), then use Load Slip.", SASONotCompletedForSale},
		{"This sales order is not ready to invoice yet. Set its progress to Completed first (Confirm or In progress is not enough).", SASONotCompletedForSale},
		{"Nothing left to invoice on this sales order line. Lower the qty, or pick a line that still has open quantity.", SASINoOpenSOBalance},
		{"Nothing left to invoice on this sales order. Pick or deliver remaining qty first, or the order is already fully billed.", SASINoOpenSOBalance},
		{"not enough stock for this item (need more on hand)", SAInsufficientStock},
		{"line item 3: not enough stock (1.0000 on hand). Check Inv Per Branch or receive stock first", SAInsufficientStock},
		{"line 2: serial ABC is not available. Receive it under Purchase Receive, or pick a serial still in stock", SASerialNotInStock},
		{"Serial 9 is not available at this location. Pick a serial that is in stock here.", SASerialNotInStock},
		{"Serial numbers required before confirming this bill. Receive/scan them under Purchase Receive, or add them on this bill, then confirm.", SASISerialLotNeedsGR},
		{"Lot numbers required before confirming this bill. Receive/enter lots under Purchase Receive, or add them on this bill, then confirm.", SASISerialLotNeedsGR},
		{"Serial count (1) must equal qty (2). Add the missing serials under Purchase Receive or on this bill", SASISerialLotNeedsGR},
		{"Bill qty is higher than unreceived PO quantity (0.0000 available). Receive goods first, or lower the bill qty", SASIQtyExceedsUnreceivedPO},
		{"Line 3 qty is higher than the open purchase order (1.0000 available). Lower the qty or open the PO to check balance.", SAPoQtyExceedsOpen},
		{"Delivery qty is higher than what was picked. Release more on Pick List, or lower the delivery qty.", SADRExceedsReleased},
		{"Delivery qty is higher than what’s left to deliver (1.0000). Lower the qty or release more on Pick List.", SADRExceedsReleased},
		{"Release qty is higher than what’s left to release (1.0000 available). Lower the qty.", SASINeedsPickRelease},
		{"This line must be reserved before Pick List release. Confirm the sales order to reserve stock, then try again.", SAInsufficientStock},
		{"Not enough available stock for Pick List release. Check Inv Per Branch, or free reserved qty, then try again.", SAInsufficientStock},
		{"Couldn't finish Pick List release automatically. Open the sales order Pick List and release manually, then try again.", SASINeedsPickRelease},
		{"Goods receipt must be inspection-released before posting. Release QC on this receipt, then post again.", SASISerialLotNeedsGR},
		{"Only draft work orders can be released.", SAMfgWOReleaseDraftOnly},
		{"Only started (released) jobs can be finished.", SAMfgWOCompleteReleasedOnly},
		{"Quality check must pass before Finish.", SAMfgWOQCPassRequired},
		{"Abnormal or excess waste requires a waste reason.", SAMfgWOWasteReasonRequired},
		{"waste_lines[0]: waste reason not found", SAMfgWOWasteReasonNotFound},
		{"Take materials first: staged issue for SKU-1: staged serial count 0 is less than required 2", SAMfgWOTakeMaterials},
		{"Record finished product first: staged lot qty 0.0000 is less than required 1.0000", SAMfgWORecordFinished},
		{"insufficient stock for COMP-A: need 5.0000 EA at location", SAMfgWOComponentShortage},
		{"Insufficient qty on input lot batch.", SAMfgWOInputLotShortage},
		{"Only released work orders accept issue scans.", SAMfgWOCompleteReleasedOnly},
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

func TestApplyAssistOpenIDs(t *testing.T) {
	a := AssistFromMessage("lines", "This item isn’t ready to invoice yet. For serial items, open the sales order → Pick List → release qty and scan the serial, then use Load Slip on this sale.")
	if a == nil {
		t.Fatal("nil assist")
	}
	applyAssistOpenIDs(a, AssistLinkContext{SalesOrderID: 42})
	want := hrefSalesOrders + "?openId=42"
	if a.Actions[0].Href != want {
		t.Fatalf("href = %q, want %q", a.Actions[0].Href, want)
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
