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
	seen = map[string]bool{"SN1": true}
	res = resolveOneSerial(t.Context(), nil, 0, "SN1", nil, nil, "sale", seen)
	if res.Status != resolveScanBatchDuplicate {
		t.Fatalf("expected batch_duplicate got %s", res.Status)
	}
}
