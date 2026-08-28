package manufacturing

import (
	"testing"
	"time"
)

func TestNormalizeWoSerialNo(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"  SN001  ", "SN001"},
		{"", ""},
		{"SN-2026\r\n", "SN-2026"},
	}
	for _, tc := range tests {
		if got := normalizeWoSerialNo(tc.in); got != tc.want {
			t.Errorf("normalizeWoSerialNo(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestNormalizeWoLotNo(t *testing.T) {
	if got := normalizeWoLotNo("  LOT-1  "); got != "LOT-1" {
		t.Fatalf("normalizeWoLotNo = %q", got)
	}
}

func TestMaxWoOutputBatchSize(t *testing.T) {
	if maxWoOutputBatchSize != 100 {
		t.Fatalf("expected batch cap 100, got %d", maxWoOutputBatchSize)
	}
}

func TestAutoWoLotNo(t *testing.T) {
	got := autoWoLotNo("FG-01", 2)
	if got == "" {
		t.Fatal("autoWoLotNo returned empty string")
	}
	if len(got) < 10 {
		t.Fatalf("autoWoLotNo too short: %q", got)
	}
}

func TestDefaultWoExpiry(t *testing.T) {
	if defaultWoExpiry(nil) != nil {
		t.Fatal("expected nil for nil shelf days")
	}
	days := 14
	got := defaultWoExpiry(&days)
	if got == nil {
		t.Fatal("expected expiry date")
	}
}

func TestBomComponentIDsAssembly(t *testing.T) {
	bom := Bom{Lines: []BomLine{
		{ComponentItemID: 10},
		{ComponentItemID: 20},
	}}
	ids := bomComponentIDs(bom, 99, false)
	if !ids[10] || !ids[20] || ids[99] {
		t.Fatalf("unexpected component map: %#v", ids)
	}
}

func TestBomComponentIDsDisassembly(t *testing.T) {
	bom := Bom{Lines: []BomLine{{ComponentItemID: 10}}}
	ids := bomComponentIDs(bom, 99, true)
	if !ids[99] || ids[10] {
		t.Fatalf("disassembly should only include finished item: %#v", ids)
	}
}

func TestWarrantyEndFromMonths(t *testing.T) {
	start, err := time.Parse("2006-01-02", "2026-01-15")
	if err != nil {
		t.Fatal(err)
	}
	if warrantyEndFromMonths(start, 0) != nil {
		t.Fatal("expected nil for zero months")
	}
	end := warrantyEndFromMonths(start, 12)
	if end == nil || end.Format("2006-01-02") != "2027-01-15" {
		t.Fatalf("unexpected warranty end: %v", end)
	}
}
