package branding

import (
	"encoding/json"
	"testing"
)

func TestPreserveReceiptTextFieldsKeepsCompanyName(t *testing.T) {
	current := map[string]any{
		"receipt": map[string]any{
			"company_name": "Acme Corp",
			"phone":        "123",
		},
	}
	merged := map[string]any{
		"receipt": map[string]any{
			"company_name": "",
			"phone":        "123",
			"address":      "",
		},
	}
	patch := json.RawMessage(`{"receipt":{"company_name":"","phone":"123","address":""}}`)
	preserveReceiptTextFields(current, merged, patch)
	got := merged["receipt"].(map[string]any)["company_name"]
	if got != "Acme Corp" {
		t.Fatalf("expected company_name preserved, got %#v", got)
	}
}

func TestPreserveReceiptTextFieldsAllowsNonEmptyOverwrite(t *testing.T) {
	current := map[string]any{
		"receipt": map[string]any{"company_name": "Old"},
	}
	merged := map[string]any{
		"receipt": map[string]any{"company_name": "New"},
	}
	patch := json.RawMessage(`{"receipt":{"company_name":"New"}}`)
	preserveReceiptTextFields(current, merged, patch)
	got := merged["receipt"].(map[string]any)["company_name"]
	if got != "New" {
		t.Fatalf("expected overwrite to New, got %#v", got)
	}
}

func TestPreserveLogoAssetIDBlocksNullClear(t *testing.T) {
	current := map[string]any{
		"receipt": map[string]any{"logo_asset_id": float64(42)},
	}
	merged := map[string]any{
		"receipt": map[string]any{"logo_asset_id": nil},
	}
	patch := json.RawMessage(`{"receipt":{"logo_asset_id":null}}`)
	preserveLogoAssetID(current, merged, patch)
	got := logoAssetIDFromMap(merged["receipt"].(map[string]any)["logo_asset_id"])
	if got != 42 {
		t.Fatalf("expected logo id 42, got %d", got)
	}
}

func TestMergeSettingsMapsPreservesIdentity(t *testing.T) {
	current := map[string]any{
		"receipt": map[string]any{
			"company_name":  "Kept",
			"logo_asset_id": float64(9),
		},
		"colors": map[string]any{"primary": "#111111"},
	}
	patch := json.RawMessage(`{
		"colors":{"primary":"#222222"},
		"receipt":{"company_name":"","logo_asset_id":null}
	}`)
	out, err := mergeSettingsMaps(current, patch)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(out, &m); err != nil {
		t.Fatal(err)
	}
	receipt := m["receipt"].(map[string]any)
	if receipt["company_name"] != "Kept" {
		t.Fatalf("company_name: %#v", receipt["company_name"])
	}
	if logoAssetIDFromMap(receipt["logo_asset_id"]) != 9 {
		t.Fatalf("logo_asset_id: %#v", receipt["logo_asset_id"])
	}
	if m["colors"].(map[string]any)["primary"] != "#222222" {
		t.Fatalf("primary color not patched: %#v", m["colors"])
	}
}
