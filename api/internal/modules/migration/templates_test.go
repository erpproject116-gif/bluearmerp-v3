package migration

import (
	"regexp"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/csvmap"
)

var dateField = map[string]bool{"date": true, "as_of_date": true, "expiry_date": true}
var amountField = map[string]bool{
	"amount": true, "quantity": true, "qty": true, "catch_weight": true, "scrap_qty": true, "yield_pct": true,
	"purchase_price": true, "sales_price": true, "vip_price": true, "oe_price": true,
}

var ymd = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

func TestTemplatesCoverAllowedKinds(t *testing.T) {
	for kind := range allowedKinds {
		if _, ok := importTemplates[kind]; !ok {
			t.Errorf("missing template for kind %s", kind)
		}
	}
	for kind := range importTemplates {
		if !allowedKinds[kind] {
			t.Errorf("template for unknown kind %s", kind)
		}
	}
}

func TestTemplatesShareImporterSlices(t *testing.T) {
	want := map[string]struct {
		headers  []string
		required []string
	}{
		"items":          {itemCanonical, itemRequired},
		"partners":       {partnerCanonical, partnerRequired},
		"accounts":       {accountCanonical, accountRequired},
		"opening_stock":  {openingStockCanonical, openingStockRequired},
		"opening_lots":   {openingLotsCanonical, openingLotsRequired},
		"boms":           {bomCanonical, bomRequired},
		"open_si":        {openSICanonical, openSIRequired},
		"open_ap":        {openAPCanonical, openAPRequired},
		"open_po":        {openPOCanonical, openPORequired},
		"open_quo":       {openQuoCanonical, openQuoRequired},
		"open_so":        {openSOCanonical, openSORequired},
		"open_pr":        {openPRCanonical, openPRRequired},
		"open_rfq":       {openRFQCanonical, openRFQRequired},
		"in_transit":     {inTransitCanonical, inTransitRequired},
	}
	for kind, exp := range want {
		spec := importTemplates[kind]
		if !sameBacking(spec.Headers, exp.headers) {
			t.Errorf("%s headers must be the importer canonical slice", kind)
		}
		if !sameBacking(spec.Required, exp.required) {
			t.Errorf("%s required must be the importer required slice", kind)
		}
	}
}

func sameBacking(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	if len(a) == 0 {
		return true
	}
	return &a[0] == &b[0]
}

func TestTemplateExampleShape(t *testing.T) {
	for kind, spec := range importTemplates {
		if len(spec.Example) != len(spec.Headers) {
			t.Errorf("%s example length %d != headers %d", kind, len(spec.Example), len(spec.Headers))
			continue
		}
		for i, h := range spec.Headers {
			cell := spec.Example[i]
			if dateField[h] {
				if !ymd.MatchString(cell) {
					t.Errorf("%s.%s date %q is not YYYY-MM-DD", kind, h, cell)
				}
			}
			if amountField[h] && cell != "" {
				for _, r := range cell {
					if r == ',' {
						t.Errorf("%s.%s amount %q contains a thousands separator", kind, h, cell)
					}
				}
			}
		}
	}
}

func TestTemplateIdentityRemap(t *testing.T) {
	for kind, spec := range importTemplates {
		colMap := map[string]string{}
		for _, h := range spec.Headers {
			colMap[h] = h
		}
		got, err := csvmap.Remap([][]string{spec.Headers, spec.Example}, colMap, spec.Required, spec.Headers)
		if err != nil {
			t.Errorf("%s identity remap: %v", kind, err)
			continue
		}
		if len(got) != 2 {
			t.Errorf("%s remap rows = %d, want 2", kind, len(got))
		}
	}
}

func TestTemplateRemapWithBOM(t *testing.T) {
	spec := importTemplates["items"]
	headers := append([]string(nil), spec.Headers...)
	headers[0] = "\ufeff" + headers[0]
	colMap := map[string]string{}
	for _, h := range spec.Headers {
		colMap[h] = h
	}
	got, err := csvmap.Remap([][]string{headers, spec.Example}, colMap, spec.Required, spec.Headers)
	if err != nil {
		t.Fatal(err)
	}
	if got[1][0] != spec.Example[0] {
		t.Fatalf("item_code = %q", got[1][0])
	}
}

func TestTemplateFilenames(t *testing.T) {
	want := map[string]string{
		"items":         "mig-items-import-template.csv",
		"partners":      "mig-partners-import-template.csv",
		"accounts":      "mig-accounts-import-template.csv",
		"opening_stock": "mig-opening-stock-import-template.csv",
		"opening_lots":  "mig-opening-lots-import-template.csv",
		"boms":          "mig-boms-import-template.csv",
		"open_si":       "mig-open-si-import-template.csv",
		"open_ap":       "mig-open-ap-import-template.csv",
		"open_po":       "mig-open-po-import-template.csv",
		"in_transit":    "mig-in-transit-import-template.csv",
	}
	for kind, name := range want {
		if importTemplates[kind].Filename != name {
			t.Errorf("%s filename = %s, want %s", kind, importTemplates[kind].Filename, name)
		}
	}
}
