package sales

import (
	"testing"
)

func TestSourceAttachmentDocIDsFromBody_HeaderAndLines(t *testing.T) {
	soID := int64(42)
	soLine := int64(1001)
	quoLine := int64(2002)
	body := saleBody{
		SourceSalesOrderID: &soID,
		Lines: []saleLineBody{
			{LineNo: 1, SourceSalesOrderLineID: &soLine},
			{LineNo: 2, SourceQuotationLineID: &quoLine},
		},
	}
	soIDs, quoIDs := sourceAttachmentDocIDsFromBody(
		body,
		func(lineID int64) (int64, bool) {
			if lineID == soLine {
				return 77, true
			}
			return 0, false
		},
		func(lineID int64) (int64, bool) {
			if lineID == quoLine {
				return 88, true
			}
			return 0, false
		},
	)
	if _, ok := soIDs[42]; !ok {
		t.Fatalf("expected header SO 42, got %#v", soIDs)
	}
	if _, ok := soIDs[77]; !ok {
		t.Fatalf("expected line-resolved SO 77, got %#v", soIDs)
	}
	if _, ok := quoIDs[88]; !ok {
		t.Fatalf("expected quotation 88, got %#v", quoIDs)
	}
}

func TestSourceAttachmentDocIDsFromBody_Empty(t *testing.T) {
	soIDs, quoIDs := sourceAttachmentDocIDsFromBody(saleBody{}, nil, nil)
	if len(soIDs) != 0 || len(quoIDs) != 0 {
		t.Fatalf("expected empty maps, got so=%#v quo=%#v", soIDs, quoIDs)
	}
}

func TestSaleCreateMessage(t *testing.T) {
	if got := saleCreateMessage(0); got != "Created." {
		t.Errorf("got %q", got)
	}
	if got := saleCreateMessage(3); got != "Created. Copied 3 attachment(s) from source document(s)." {
		t.Errorf("got %q", got)
	}
}
