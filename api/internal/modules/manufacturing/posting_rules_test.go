package manufacturing

import "testing"

func TestComponentStockStatus(t *testing.T) {
	if got := ComponentStockStatus(10, 8, 2); got != StockInsufficient {
		t.Fatalf("got %s want insufficient", got)
	}
	if got := ComponentStockStatus(10, 11, 0); got != StockLowStock {
		t.Fatalf("got %s want low_stock", got)
	}
	if got := ComponentStockStatus(10, 20, 0); got != StockInStock {
		t.Fatalf("got %s want in_stock", got)
	}
}

func TestCanEditAndCancel(t *testing.T) {
	if !CanEditWorkOrder(WOStatusDraft) {
		t.Fatal("draft should be editable")
	}
	if CanEditWorkOrder(WOStatusReleased) {
		t.Fatal("released should not be editable")
	}
	if !CanCancelWorkOrder(WOStatusDraft, false) {
		t.Fatal("draft cancel ok")
	}
	if CanCancelWorkOrder(WOStatusReleased, true) {
		t.Fatal("posted moves block cancel")
	}
}

func TestCanRevertToDraft(t *testing.T) {
	if !CanRevertToDraft(WOStatusReleased, false, false) {
		t.Fatal("expected revert ok")
	}
	if CanRevertToDraft(WOStatusReleased, true, false) {
		t.Fatal("posted blocks revert")
	}
	if CanRevertToDraft(WOStatusReleased, false, true) {
		t.Fatal("staging blocks revert")
	}
	if CanRevertToDraft(WOStatusDraft, false, false) {
		t.Fatal("draft cannot revert")
	}
}

func TestCanCompleteWorkOrder(t *testing.T) {
	ok, _ := CanCompleteWorkOrder(WOStatusReleased, InspectionReleased)
	if !ok {
		t.Fatal("released+inspection released should complete")
	}
	ok, reason := CanCompleteWorkOrder(WOStatusDraft, InspectionReleased)
	if ok || reason == "" {
		t.Fatal("draft should not complete")
	}
	ok, _ = CanCompleteWorkOrder(WOStatusReleased, InspectionPending)
	if ok {
		t.Fatal("pending QC should block")
	}
	ok, _ = CanCompleteWorkOrderWithPolicy(WOStatusReleased, InspectionPending, false)
	if !ok {
		t.Fatal("pending QC should not block when the tenant QC gate is disabled")
	}
	ok, _ = CanCompleteWorkOrderWithPolicy(WOStatusReleased, InspectionPending, true)
	if ok {
		t.Fatal("pending QC should block when the tenant QC gate is enabled")
	}
}

func TestCanPostAssemblyWithShortage(t *testing.T) {
	if CanPostAssemblyWithShortage(true, false) {
		t.Fatal("shortage should block when negative off")
	}
	if !CanPostAssemblyWithShortage(true, true) {
		t.Fatal("override should allow")
	}
	if !CanPostAssemblyWithShortage(false, false) {
		t.Fatal("no shortage should allow")
	}
}

func TestRequiredComponentQty(t *testing.T) {
	if got := RequiredComponentQty(2, 5); got != 10 {
		t.Fatalf("got %v want 10", got)
	}
}

func TestOutputClassificationAndWaste(t *testing.T) {
	if NormalizeOutputClassification("by-product") != OutputClassByproduct {
		t.Fatal("by-product normalize")
	}
	if ReceivesStockForClassification(OutputClassWaste) {
		t.Fatal("waste should not receive stock")
	}
	if !ReceivesStockForClassification(OutputClassFinished) {
		t.Fatal("finished should receive stock")
	}
	rid := int64(1)
	if msg := ValidateWasteLine(2, 2, true, nil, true); msg == "" {
		t.Fatal("abnormal without reason should fail")
	}
	if msg := ValidateWasteLine(2, 2, true, &rid, true); msg != "" {
		t.Fatalf("abnormal with reason should pass: %s", msg)
	}
	if msg := ValidateWasteLine(5, 3, false, nil, true); msg == "" {
		t.Fatal("excess without reason should fail")
	}
	if msg := ValidateWasteLine(3, 3, false, nil, true); msg != "" {
		t.Fatalf("in-band waste without reason should pass: %s", msg)
	}
	if ExcessWasteQty(3, 5) != 2 {
		t.Fatal("excess waste")
	}
	if !WasteRequiresReason(5, 3, false) || WasteRequiresReason(3, 3, false) {
		t.Fatal("WasteRequiresReason")
	}
}

func TestNormalizeBomTypeRecipe(t *testing.T) {
	if normalizeBomType("recipe") != "recipe" {
		t.Fatal("recipe")
	}
	if normalizeBomType("processing") != "recipe" {
		t.Fatal("processing alias")
	}
	if !IsAssemblyLikeBomType("recipe") || !IsAssemblyLikeBomType("assembly") {
		t.Fatal("assembly-like")
	}
	if IsAssemblyLikeBomType("disassembly") {
		t.Fatal("disassembly not assembly-like")
	}
	if workOrderNoPrefix("assembly") != "ASM" || workOrderNoPrefix("disassembly") != "CUT" || workOrderNoPrefix("recipe") != "REC" {
		t.Fatal("prefixes")
	}
	if parseBomTypeListFilter("recipe") != "recipe" {
		t.Fatal("list filter")
	}
}

func TestYieldBandStatus(t *testing.T) {
	min, max := 90.0, 110.0
	if got := yieldBandStatus(100, 100, &min, &max); got != "in_band" {
		t.Fatalf("got %s", got)
	}
	if got := yieldBandStatus(80, 100, &min, &max); got != "below_min" {
		t.Fatalf("got %s", got)
	}
	if got := yieldBandStatus(120, 100, &min, &max); got != "above_max" {
		t.Fatalf("got %s", got)
	}
}
