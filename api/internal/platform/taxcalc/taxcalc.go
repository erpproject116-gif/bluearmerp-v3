package taxcalc

import "math"

// TaxType defines how line amounts are derived.
type TaxType struct {
	TaxMode     string  // included | excluded | none
	RatePercent float64
}

// LineAmounts holds computed monetary fields for one quotation line.
type LineAmounts struct {
	UnitNonVat  float64 `json:"unit_non_vat"`
	NonVatTotal float64 `json:"non_vat_total"`
	TaxAmount   float64 `json:"tax_amount"`
	UnitVatInc  float64 `json:"unit_vat_inc"`
	LineTotal   float64 `json:"line_total"`
}

// InputBasis tells which unit field the user edited.
const (
	InputVatIncUnit  = "vat_inc_unit"
	InputNonVatUnit  = "non_vat_unit"
)

// ComputeLine derives all line amounts from a unit price and quantity.
func ComputeLine(tt TaxType, unitInput float64, qty float64, inputBasis string) LineAmounts {
	if qty <= 0 {
		return LineAmounts{}
	}
	rate := tt.RatePercent / 100.0

	var unitNonVat, unitTax, unitVatInc float64

	switch tt.TaxMode {
	case "none":
		switch inputBasis {
		case InputVatIncUnit:
			unitVatInc = unitInput
			unitNonVat = unitInput
		default:
			unitNonVat = unitInput
			unitVatInc = unitInput
		}
		unitTax = 0
	case "included":
		divisor := 1 + rate
		switch inputBasis {
		case InputNonVatUnit:
			unitNonVat = unitInput
			unitTax = unitNonVat * rate
			unitVatInc = unitNonVat + unitTax
		default:
			unitVatInc = unitInput
			unitNonVat = unitVatInc / divisor
			unitTax = unitVatInc - unitNonVat
		}
	case "excluded":
		switch inputBasis {
		case InputVatIncUnit:
			divisor := 1 + rate
			unitVatInc = unitInput
			unitNonVat = unitVatInc / divisor
			unitTax = unitVatInc - unitNonVat
		default:
			unitNonVat = unitInput
			unitTax = unitNonVat * rate
			unitVatInc = unitNonVat + unitTax
		}
	default:
		unitNonVat = unitInput
		unitVatInc = unitInput
	}

	nonVatTotal := round4(unitNonVat * qty)
	taxAmount := round4(unitTax * qty)
	lineTotal := round4(unitVatInc * qty)

	return LineAmounts{
		UnitNonVat:  round4(unitNonVat),
		NonVatTotal: nonVatTotal,
		TaxAmount:   taxAmount,
		UnitVatInc:  round4(unitVatInc),
		LineTotal:   lineTotal,
	}
}

func round4(v float64) float64 {
	return math.Round(v*10000) / 10000
}
