package manufacturing

import (
	"encoding/json"
	"regexp"
	"testing"
	"time"
)

func TestFormatAssemblyBomCode(t *testing.T) {
	d := time.Date(2026, 9, 10, 0, 0, 0, 0, time.UTC)
	got := formatAssemblyBomCode(d, 1)
	want := "A09102026-000001"
	if got != want {
		t.Fatalf("formatAssemblyBomCode = %q, want %q", got, want)
	}
	re := regexp.MustCompile(`^A\d{8}-\d{6}$`)
	if !re.MatchString(got) {
		t.Fatalf("code %q does not match expected pattern", got)
	}
}

func TestValidateBomBodyAssemblyAllowsEmptyCode(t *testing.T) {
	body := bomBody{
		BomName:        "Test recipe",
		FinishedItemID: 1,
		BomType:        "assembly",
		Lines:          []bomLineBody{{ComponentItemID: 2, Qty: 1}},
	}
	if errs := validateBomBody(body); errs != nil {
		t.Fatalf("expected no errors for empty assembly code, got %#v", errs)
	}
}

func TestValidateBomBodyDisassemblyRequiresCode(t *testing.T) {
	body := bomBody{
		BomName:        "Cut recipe",
		FinishedItemID: 1,
		BomType:        "disassembly",
		Lines:          []bomLineBody{{ComponentItemID: 2, Qty: 1}},
	}
	errs := validateBomBody(body)
	if errs == nil || errs["bom_code"] == "" {
		t.Fatalf("expected bom_code required for disassembly, got %#v", errs)
	}
}

func TestResolveItemUnitCostPrefersPurchasePrice(t *testing.T) {
	std, _ := json.Marshal(map[string]float64{"material": 50, "labor": 10})
	if got := resolveItemUnitCost(12.5, std); got != 12.5 {
		t.Fatalf("got %v want 12.5", got)
	}
	if got := resolveItemUnitCost(0, std); got != 60 {
		t.Fatalf("got %v want 60 from standard_costs", got)
	}
	if got := resolveItemUnitCost(0, nil); got != 0 {
		t.Fatalf("got %v want 0", got)
	}
}

func TestResolveBomCostDefaults(t *testing.T) {
	labor := 3.5
	freight := 1.25
	l, f := resolveBomCostDefaults(bomBody{DirectLaborCost: &labor, InboundFreightCost: &freight})
	if l != 3.5 || f != 1.25 {
		t.Fatalf("got labor=%v freight=%v", l, f)
	}
}
