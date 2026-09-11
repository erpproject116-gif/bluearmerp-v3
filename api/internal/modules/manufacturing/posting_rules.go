package manufacturing

import "strings"

// Phase 1 posting / edit rules (PDF §5–7, §12, §42–44, §47, §53, §59).
// UI mirrors these in web mfgRules.ts; the API remains authoritative.

const (
	WOStatusDraft     = "draft"
	WOStatusReleased  = "released"
	WOStatusCompleted = "completed"
	WOStatusCancelled = "cancelled"

	InspectionPending  = "pending"
	InspectionHeld     = "held"
	InspectionReleased = "released"
)

// StockAvailabilityStatus matches PDF assembly component chips.
type StockAvailabilityStatus string

const (
	StockInStock       StockAvailabilityStatus = "in_stock"
	StockLowStock      StockAvailabilityStatus = "low_stock"
	StockInsufficient  StockAvailabilityStatus = "insufficient"
)

// ComponentStockStatus classifies on-hand vs required.
// Insufficient when shortage > 0; Low when enough but on-hand < 1.2× required; else In Stock.
func ComponentStockStatus(required, onHand, shortage float64) StockAvailabilityStatus {
	if shortage > 0.0001 || required > onHand+0.0001 {
		return StockInsufficient
	}
	if required > 0 && onHand < required*1.2 {
		return StockLowStock
	}
	return StockInStock
}

func CanEditWorkOrder(status string) bool {
	return status == WOStatusDraft
}

func CanCancelWorkOrder(status string, hasPostedMoves bool) bool {
	if hasPostedMoves {
		return false
	}
	return status == WOStatusDraft || status == WOStatusReleased
}

func CanReleaseWorkOrder(status string) bool {
	return status == WOStatusDraft
}

func CanRevertToDraft(status string, hasPostedMoves, hasStaging bool) bool {
	if status != WOStatusReleased {
		return false
	}
	if hasPostedMoves || hasStaging {
		return false
	}
	return true
}

func CanCompleteWorkOrder(status, inspectionStatus string) (ok bool, reason string) {
	if status != WOStatusReleased {
		return false, "Only started (released) jobs can be finished."
	}
	if inspectionStatus == InspectionPending || inspectionStatus == InspectionHeld {
		return false, "Quality check must pass before Finish."
	}
	return true, ""
}

// CanPostAssemblyWithShortage is false by default (negative inventory OFF).
func CanPostAssemblyWithShortage(hasShortage bool, allowNegative bool) bool {
	if !hasShortage {
		return true
	}
	return allowNegative
}

func MaterialNeedsHasShortage(shortages []float64) bool {
	for _, s := range shortages {
		if s > 0.0001 {
			return true
		}
	}
	return false
}

// RequiredComponentQty is BOM qty-per × actual completed qty (PDF §12).
func RequiredComponentQty(bomQtyPerUnit, actualCompleted float64) float64 {
	if bomQtyPerUnit < 0 || actualCompleted < 0 {
		return 0
	}
	return bomQtyPerUnit * actualCompleted
}

const (
	OutputClassFinished  = "finished"
	OutputClassByproduct = "byproduct"
	OutputClassRework    = "rework"
	OutputClassWaste     = "waste"
)

func NormalizeOutputClassification(v string) string {
	switch strings.ToLower(strings.TrimSpace(v)) {
	case OutputClassByproduct, "by-product", "by_product":
		return OutputClassByproduct
	case OutputClassRework:
		return OutputClassRework
	case OutputClassWaste, "scrap":
		return OutputClassWaste
	default:
		return OutputClassFinished
	}
}

// ReceivesStockForClassification is false for waste (PDF §21 — waste not sellable stock by default).
func ReceivesStockForClassification(class string) bool {
	return NormalizeOutputClassification(class) != OutputClassWaste
}

// WasteRequiresReason is true for excess over expected or an abnormal reason (PDF §22 / §25).
func WasteRequiresReason(qty, expected float64, isAbnormalReason bool) bool {
	if qty <= 0.0001 {
		return false
	}
	if ExcessWasteQty(expected, qty) > 0 {
		return true
	}
	return isAbnormalReason
}

// ValidateWasteLine checks excess/abnormal waste requires a reason (PDF §22 / §25).
func ValidateWasteLine(qty, expected float64, isAbnormalReason bool, reasonID *int64, requireReasonForAbnormal bool) string {
	if qty < 0 {
		return "Waste quantity cannot be negative."
	}
	if qty <= 0.0001 {
		return ""
	}
	if !requireReasonForAbnormal {
		return ""
	}
	if WasteRequiresReason(qty, expected, isAbnormalReason) && (reasonID == nil || *reasonID <= 0) {
		return "Abnormal or excess waste requires a waste reason."
	}
	return ""
}

func ExcessWasteQty(expected, actual float64) float64 {
	if actual <= expected+0.0001 {
		return 0
	}
	return actual - expected
}

// IsAssemblyLikeBomType is true for assembly and recipe (multi-in → one FG).
func IsAssemblyLikeBomType(bomType string) bool {
	t := normalizeBomType(bomType)
	return t == "assembly" || t == "recipe"
}
