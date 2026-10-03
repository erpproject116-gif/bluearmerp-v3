package pos

import "testing"

func TestBuildReceiptFormatSalesSlipTitle(t *testing.T) {
	rf := buildReceiptFormat(receiptBuildInput{
		CompanyName: "Demo Store",
		SalesNo:     "SI-1",
		Lines:       []CartLine{{ItemName: "Coffee", Qty: 1, UnitPrice: 50, LineTotal: 50}},
		GrandTotal:  50,
		Tenders:     []tenderBody{{TenderType: "cash", Amount: 50}},
	})
	if rf.DocTitle != "Sales slip" {
		t.Fatalf("title=%q", rf.DocTitle)
	}
	if rf.OfficialReceiptNo != nil {
		t.Fatal("expected no OR")
	}
	if rf.FooterNote == "" || rf.Lines[0].ItemName != "Coffee" {
		t.Fatal("incomplete slip")
	}
}

func TestBuildReceiptFormatOfficialReceiptTitle(t *testing.T) {
	or := "OR-100"
	rf := buildReceiptFormat(receiptBuildInput{
		CompanyName: "Demo Store",
		SalesNo:     "SI-2",
		ORNo:        &or,
		GrandTotal:  100,
		Tenders:     []tenderBody{{TenderType: "cash", Amount: 100}},
	})
	if rf.DocTitle != "Official Receipt" {
		t.Fatalf("title=%q", rf.DocTitle)
	}
	if rf.OfficialReceiptNo == nil || *rf.OfficialReceiptNo != "OR-100" {
		t.Fatal("OR no missing")
	}
}
