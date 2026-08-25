package inventory

import "testing"

func TestNormalizeResolveSerialNo(t *testing.T) {
	if got := normalizeResolveSerialNo("  abc\r\n"); got != "abc" {
		t.Fatalf("got %q", got)
	}
}

func TestExtractManufacturer(t *testing.T) {
	vals := map[string]any{"Manufacturer": "Logitech", "model": "K120"}
	if got := extractManufacturer(vals); got != "Logitech" {
		t.Fatalf("got %q", got)
	}
	if got := extractManufacturer(map[string]any{"brand": "A4Tech"}); got != "A4Tech" {
		t.Fatalf("got %q", got)
	}
}

func TestResolveOneSerialBatchDuplicate(t *testing.T) {
	seen := map[string]bool{}
	res := resolveOneSerial(t.Context(), nil, 0, "", nil, nil, "sale", seen)
	if res.Status != resolveScanEmpty {
		t.Fatalf("empty status got %s", res.Status)
	}
	seen = map[string]bool{"sn1": true}
	res = resolveOneSerial(t.Context(), nil, 0, "SN1", nil, nil, "sale", seen)
	if res.Status != resolveScanBatchDuplicate {
		t.Fatalf("expected batch_duplicate got %s", res.Status)
	}
}

func TestIsStockConsumingResolveContext(t *testing.T) {
	for _, ctx := range []string{"sale", "pos", "release"} {
		if !isStockConsumingResolveContext(ctx) {
			t.Fatalf("%s should be stock-consuming", ctx)
		}
	}
	for _, ctx := range []string{"purchase", "lookup", ""} {
		if isStockConsumingResolveContext(ctx) {
			t.Fatalf("%s should not be stock-consuming", ctx)
		}
	}
}

func TestClassifyLedgerMiss_PlannedOnlySale(t *testing.T) {
	res := classifyLedgerMiss("BA082026000180", "sale", true, false)
	if res.Status != resolveScanNotReceived {
		t.Fatalf("status got %s want not_received", res.Status)
	}
	if res.Unit != nil {
		t.Fatal("must not return a unit for planned-only serial")
	}
	if res.Message != msgSerialNotReceivedPO {
		t.Fatalf("message got %q", res.Message)
	}
}

func TestClassifyLedgerMiss_DraftGRSale(t *testing.T) {
	res := classifyLedgerMiss("SN-DRAFT", "pos", false, true)
	if res.Status != resolveScanNotReceived {
		t.Fatalf("status got %s want not_received", res.Status)
	}
	if res.Message != msgSerialNotReceivedGR {
		t.Fatalf("message got %q", res.Message)
	}
	if res.Unit != nil {
		t.Fatal("must not return a unit")
	}
}

func TestClassifyLedgerMiss_UnknownSale(t *testing.T) {
	res := classifyLedgerMiss("UNKNOWN", "sale", false, false)
	if res.Status != resolveScanNotFound {
		t.Fatalf("status got %s want not_found", res.Status)
	}
	if res.Message != msgSerialNotFound {
		t.Fatalf("message got %q", res.Message)
	}
}

func TestClassifyLedgerMiss_PlannedOnPurchaseContextStillNotFound(t *testing.T) {
	// purchase/lookup never invents a ledger unit from planned-only; not_received is sale-path only.
	res := classifyLedgerMiss("SN-PO", "purchase", true, false)
	if res.Status != resolveScanNotFound {
		t.Fatalf("purchase planned-only should stay not_found, got %s", res.Status)
	}
	res = classifyLedgerMiss("SN-PO", "lookup", true, true)
	if res.Status != resolveScanNotFound {
		t.Fatalf("lookup planned-only should stay not_found, got %s", res.Status)
	}
}

func TestResolveLedgerMiss_NilPoolUnknown(t *testing.T) {
	res := resolveLedgerMiss(t.Context(), nil, 1, "SN-NONE", "sale")
	if res.Status != resolveScanNotFound {
		t.Fatalf("nil pool miss should be not_found, got %s", res.Status)
	}
	if res.Unit != nil {
		t.Fatal("unit must be nil")
	}
}

func TestNormalizeResolveSerialNo_StripsInnerPadding(t *testing.T) {
	if got := normalizeResolveSerialNo("  BA082126000181 \n"); got != "BA082126000181" {
		t.Fatalf("got %q", got)
	}
}
