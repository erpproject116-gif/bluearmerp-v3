package inventory

import (
	"fmt"
	"strings"
)

const (
	LotAllocationManual = "manual"
	LotAllocationFEFO   = "fefo"
	LotAllocationFIFO   = "fifo"
	PriceBasisUnit      = "unit"
	PriceBasisPerKg     = "per_kg"
)

func NormalizeLotAllocationMethod(method string) string {
	switch strings.ToLower(strings.TrimSpace(method)) {
	case LotAllocationFEFO:
		return LotAllocationFEFO
	case LotAllocationFIFO:
		return LotAllocationFIFO
	default:
		return LotAllocationManual
	}
}

func NormalizePriceBasis(basis string) string {
	if strings.ToLower(strings.TrimSpace(basis)) == PriceBasisPerKg {
		return PriceBasisPerKg
	}
	return PriceBasisUnit
}

func ValidatePerishableItemFields(trackSerial, trackLot, catchWeight bool, lotAllocation, priceBasis string) map[string]string {
	errs := map[string]string{}
	if catchWeight {
		if trackSerial {
			errs["catch_weight"] = "Catch weight requires lot tracking, not serial."
		}
		if !trackLot {
			errs["catch_weight"] = "Catch weight requires lot tracking."
		}
	}
	if lotAllocation != "" {
		n := NormalizeLotAllocationMethod(lotAllocation)
		if n != lotAllocation && lotAllocation != "manual" && lotAllocation != "fefo" && lotAllocation != "fifo" {
			errs["lot_allocation_method"] = "Must be manual, fefo, or fifo."
		}
	}
	if priceBasis != "" {
		n := NormalizePriceBasis(priceBasis)
		if n != priceBasis && priceBasis != "unit" && priceBasis != "per_kg" {
			errs["price_basis"] = "Must be unit or per_kg."
		}
	}
	if !trackLot && lotAllocation != "" && NormalizeLotAllocationMethod(lotAllocation) != LotAllocationManual {
		errs["lot_allocation_method"] = "Automatic allocation requires lot tracking."
	}
	return errs
}

func mergePerishableErrs(errs map[string]string, extra map[string]string) map[string]string {
	if len(extra) == 0 {
		return errs
	}
	if errs == nil {
		errs = map[string]string{}
	}
	for k, v := range extra {
		errs[k] = v
	}
	return errs
}

func effectiveLotAllocation(itemMethod, tenantDefault string) string {
	m := NormalizeLotAllocationMethod(itemMethod)
	if m != LotAllocationManual {
		return m
	}
	return NormalizeLotAllocationMethod(tenantDefault)
}

func formatLotAllocationLabel(method string) string {
	switch NormalizeLotAllocationMethod(method) {
	case LotAllocationFEFO:
		return "FEFO (first expired)"
	case LotAllocationFIFO:
		return "FIFO (first received)"
	default:
		return "Manual pick"
	}
}

func validateShelfLifeDays(days *int) error {
	if days == nil {
		return nil
	}
	if *days < 0 || *days > 3650 {
		return fmt.Errorf("shelf life days must be between 0 and 3650")
	}
	return nil
}
