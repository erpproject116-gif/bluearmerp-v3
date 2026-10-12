package inventory

import "testing"

func TestParseLocationImportRow(t *testing.T) {
	body, err := parseLocationImportRow(map[string]string{
		"location_name":      " Dock ",
		"location_type":      "Factory",
		"is_rma":             "yes",
		"production_process": "Service",
	})
	if err != nil {
		t.Fatal(err)
	}
	if body.LocationName != "Dock" || body.LocationType != "factory" || !body.IsRMA || body.ProductionProcess != "service" {
		t.Fatalf("parsed %#v", body)
	}

	defaults, err := parseLocationImportRow(map[string]string{"location_name": "Store"})
	if err != nil {
		t.Fatal(err)
	}
	if defaults.LocationType != "location" || defaults.ProductionProcess != "bundle" || defaults.IsRMA {
		t.Fatalf("defaults %#v", defaults)
	}

	if _, err := parseLocationImportRow(map[string]string{"location_name": "X", "location_type": "office"}); err == nil {
		t.Fatal("expected invalid type")
	}
}
