package migration

import (
	"encoding/csv"
	"fmt"
	"net/http"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type importTemplate struct {
	Kind     string
	Filename string
	Headers  []string
	Required []string
	Example  []string
}

// importTemplates keyed by allowedKinds. Headers/Required are the importer slices (same backing array).
var importTemplates = map[string]importTemplate{
	"items": {
		Kind:     "items",
		Filename: "mig-items-import-template.csv",
		Headers:  itemCanonical,
		Required: itemRequired,
		Example: []string{
			"EXAMPLE-ITEM", "EXAMPLE Widget", "100.00", "150.00", "140.00", "active",
			"false", "false", "required", "required", "true", "12",
			"", "pc", "merchandise", "item", "0",
		},
	},
	"partners": {
		Kind:     "partners",
		Filename: "mig-partners-import-template.csv",
		Headers:  partnerCanonical,
		Required: partnerRequired,
		Example: []string{
			"EXAMPLE-C", "EXAMPLE Customer Co", "customer", "", "", "", "", "", "", "active",
		},
	},
	"accounts": {
		Kind:     "accounts",
		Filename: "mig-accounts-import-template.csv",
		Headers:  accountCanonical,
		Required: accountRequired,
		Example:  []string{"EXAMPLE-1999", "EXAMPLE Clearing", "asset", "false", "true", "99"},
	},
	"opening_stock": {
		Kind:     "opening_stock",
		Filename: "mig-opening-stock-import-template.csv",
		Headers:  openingStockCanonical,
		Required: openingStockRequired,
		Example:  []string{"EXAMPLE-ITEM", "EXAMPLE Widget", "10.5", "EXAMPLE Warehouse", "2026-01-31"},
	},
	"open_si": {
		Kind:     "open_si",
		Filename: "mig-open-si-import-template.csv",
		Headers:  openSICanonical,
		Required: openSIRequired,
		Example: []string{
			"EXAMPLE-SI-1", "EXAMPLE Customer Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "1", "1000.50", "",
		},
	},
	"open_ap": {
		Kind:     "open_ap",
		Filename: "mig-open-ap-import-template.csv",
		Headers:  openAPCanonical,
		Required: openAPRequired,
		Example: []string{
			"EXAMPLE-AP-1", "EXAMPLE Vendor Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "1", "1000.50", "",
		},
	},
	"open_po": {
		Kind:     "open_po",
		Filename: "mig-open-po-import-template.csv",
		Headers:  openPOCanonical,
		Required: openPORequired,
		Example: []string{
			"EXAMPLE-PO-1", "EXAMPLE Vendor Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "10.5", "1000.50",
		},
	},
	"open_quo": {
		Kind:     "open_quo",
		Filename: "mig-open-quo-import-template.csv",
		Headers:  openQuoCanonical,
		Required: openQuoRequired,
		Example: []string{
			"EXAMPLE-QUO-1", "EXAMPLE Customer Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "2", "500.00",
		},
	},
	"open_so": {
		Kind:     "open_so",
		Filename: "mig-open-so-import-template.csv",
		Headers:  openSOCanonical,
		Required: openSORequired,
		Example: []string{
			"EXAMPLE-SO-1", "EXAMPLE Customer Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "2", "500.00",
		},
	},
	"open_pr": {
		Kind:     "open_pr",
		Filename: "mig-open-pr-import-template.csv",
		Headers:  openPRCanonical,
		Required: openPRRequired,
		Example: []string{
			"EXAMPLE-PR-1", "EXAMPLE Vendor Co", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "5", "250.00",
		},
	},
	"open_rfq": {
		Kind:     "open_rfq",
		Filename: "mig-open-rfq-import-template.csv",
		Headers:  openRFQCanonical,
		Required: openRFQRequired,
		Example: []string{
			"EXAMPLE-RFQ-1", "2026-01-31", "EXAMPLE-ITEM", "EXAMPLE Widget", "10", "Cutover RFQ",
		},
	},
	"in_transit": {
		Kind:     "in_transit",
		Filename: "mig-in-transit-import-template.csv",
		Headers:  inTransitCanonical,
		Required: inTransitRequired,
		Example: []string{
			"EXAMPLE-ITEM", "EXAMPLE Widget", "10.5", "EXAMPLE Warehouse", "EXAMPLE Warehouse 2", "2026-01-31",
		},
	},
}

func importTemplateHandler(kind string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		spec, ok := importTemplates[kind]
		if !ok {
			response.Validation(w, map[string]string{"kind": "Unknown import kind."})
			return
		}
		writeCSVAttachment(w, spec.Filename, spec.Headers, [][]string{spec.Example})
	}
}

func writeCSVAttachment(w http.ResponseWriter, filename string, headers []string, rows [][]string) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	cw := csv.NewWriter(w)
	_ = cw.Write(headers)
	for _, row := range rows {
		_ = cw.Write(row)
	}
	cw.Flush()
}
