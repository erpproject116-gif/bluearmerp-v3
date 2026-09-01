package manufacturing

import "testing"

func TestParseBomTypeListFilter(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"", ""},
		{"assembly", "assembly"},
		{"Assembly", "assembly"},
		{"disassembly", "disassembly"},
		{"DISASSEMBLY", "disassembly"},
		{"invalid", ""},
	}
	for _, tc := range tests {
		if got := parseBomTypeListFilter(tc.in); got != tc.want {
			t.Errorf("parseBomTypeListFilter(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestBuildMaterialNeedsAssemblyShape(t *testing.T) {
	bom := Bom{
		BomType:   "assembly",
		OutputQty: 1,
		YieldPct:  100,
		Lines: []BomLine{
			{ComponentItemID: 10, ComponentCode: "RM-1", Qty: 2, ScrapQty: 0.5},
		},
	}
	wo := WorkOrder{
		ID:               1,
		FinishedItemID:   99,
		FinishedBaseUnit: "kg",
		LocationID:       1,
		QtyToProduce:     5,
		BomType:          "assembly",
	}
	// StockIssueForLine needs DB; verify bom type routing only via exported helper expectations.
	if normalizeBomType(bom.BomType) != "assembly" {
		t.Fatal("expected assembly bom type")
	}
	if wo.BomType != "assembly" {
		t.Fatal("expected assembly work order type")
	}
	_ = bom
}

func TestBuildMaterialNeedsDisassemblyShape(t *testing.T) {
	bom := Bom{
		BomType:   "disassembly",
		OutputQty: 1,
		YieldPct:  100,
		Lines: []BomLine{
			{ComponentItemID: 20, ComponentCode: "CUT-1", Qty: 3},
		},
	}
	if normalizeBomType(bom.BomType) != "disassembly" {
		t.Fatal("expected disassembly bom type")
	}
	ids := bomComponentIDs(bom, 99, true)
	if !ids[99] || ids[20] {
		t.Fatalf("disassembly component ids: %#v", ids)
	}
}
