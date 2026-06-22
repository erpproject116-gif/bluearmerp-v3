package taxcalc

import "testing"

func TestComputeLine_VatIncluded12FromVatInc(t *testing.T) {
	tt := TaxType{TaxMode: "included", RatePercent: 12}
	got := ComputeLine(tt, 37000, 1, InputVatIncUnit)
	if got.UnitNonVat < 33035.71 || got.UnitNonVat > 33035.72 {
		t.Fatalf("unit_non_vat = %v, want ~33035.7143", got.UnitNonVat)
	}
	if got.TaxAmount < 3964.28 || got.TaxAmount > 3964.30 {
		t.Fatalf("tax = %v, want ~3964.29", got.TaxAmount)
	}
	if got.LineTotal != 37000 {
		t.Fatalf("line_total = %v, want 37000", got.LineTotal)
	}
}

func TestComputeLine_NonVat(t *testing.T) {
	tt := TaxType{TaxMode: "none", RatePercent: 0}
	got := ComputeLine(tt, 8950, 2, InputNonVatUnit)
	if got.LineTotal != 17900 {
		t.Fatalf("line_total = %v", got.LineTotal)
	}
	if got.TaxAmount != 0 {
		t.Fatalf("tax = %v", got.TaxAmount)
	}
}

func TestComputeLine_VatIncluded5(t *testing.T) {
	tt := TaxType{TaxMode: "included", RatePercent: 5}
	got := ComputeLine(tt, 105, 1, InputVatIncUnit)
	if got.UnitNonVat != 100 {
		t.Fatalf("unit_non_vat = %v, want 100", got.UnitNonVat)
	}
	if got.TaxAmount != 5 {
		t.Fatalf("tax = %v, want 5", got.TaxAmount)
	}
}

func TestComputeLine_VatIncluded6(t *testing.T) {
	tt := TaxType{TaxMode: "included", RatePercent: 6}
	got := ComputeLine(tt, 106, 1, InputVatIncUnit)
	if got.UnitNonVat != 100 {
		t.Fatalf("unit_non_vat = %v, want 100", got.UnitNonVat)
	}
	if got.TaxAmount != 6 {
		t.Fatalf("tax = %v, want 6", got.TaxAmount)
	}
}

func TestComputeLine_Excluded30(t *testing.T) {
	tt := TaxType{TaxMode: "excluded", RatePercent: 30}
	got := ComputeLine(tt, 100, 1, InputNonVatUnit)
	if got.UnitVatInc != 130 {
		t.Fatalf("unit_vat_inc = %v", got.UnitVatInc)
	}
	if got.TaxAmount != 30 {
		t.Fatalf("tax = %v", got.TaxAmount)
	}
}
