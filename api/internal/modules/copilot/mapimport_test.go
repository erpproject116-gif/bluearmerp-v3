package copilot

import (
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestFirstSheetCSV(t *testing.T) {
	plain := "item_name,unit\nPen,pcs"
	if got := firstSheetCSV(plain); got != plain {
		t.Fatalf("plain csv changed: %q", got)
	}
	multi := "## Sheet: One\nitem_name,unit\nPen,pcs\n\n## Sheet: Two\nother,cols"
	got := firstSheetCSV(multi)
	if strings.Contains(got, "## Sheet") || strings.Contains(got, "other,cols") {
		t.Fatalf("expected first sheet only, got %q", got)
	}
	if !strings.HasPrefix(got, "item_name,unit") {
		t.Fatalf("expected first sheet header, got %q", got)
	}
}

func TestCsvHeaderCells(t *testing.T) {
	cells := csvHeaderCells("\n\"Item Name\",Unit, Sales Price ,\nrow2")
	want := []string{"Item Name", "Unit", "Sales Price"}
	if len(cells) != len(want) {
		t.Fatalf("cells = %v", cells)
	}
	for i := range want {
		if cells[i] != want[i] {
			t.Fatalf("cell %d = %q, want %q", i, cells[i], want[i])
		}
	}
}

func TestGuessMigKind(t *testing.T) {
	cases := []struct {
		headers []string
		want    string
	}{
		{[]string{"Item Name", "Unit", "Sales Price"}, "items"},
		{[]string{"Company Name", "Partner Kind", "TIN"}, "partners"},
		{[]string{"Vendor Name", "Phone", "Email"}, "partners"},
		{[]string{"Account Code", "Account Name", "Account Type"}, "accounts"},
		{[]string{"random", "cols"}, "items"},
	}
	for _, c := range cases {
		if got := guessMigKind(c.headers); got != c.want {
			t.Errorf("guessMigKind(%v) = %q, want %q", c.headers, got, c.want)
		}
	}
}

func TestAutoColumnMap(t *testing.T) {
	m := autoColumnMap("items", []string{"Item Name", "UOM", "Selling Price", "Cost", "Category"})
	expect := map[string]string{
		"item_name":      "Item Name",
		"unit":           "UOM",
		"sales_price":    "Selling Price",
		"purchase_price": "Cost",
		"item_category":  "Category",
	}
	for field, header := range expect {
		if m[field] != header {
			t.Errorf("map[%q] = %q, want %q (full %v)", field, m[field], header, m)
		}
	}
	// A single header must not be mapped to two fields.
	seen := map[string]string{}
	for f, h := range m {
		if prev, ok := seen[h]; ok {
			t.Errorf("header %q mapped to both %q and %q", h, prev, f)
		}
		seen[h] = f
	}
}

func TestLooksLikeRfqSheetText(t *testing.T) {
	if !looksLikeRfqSheetText("REQUEST FOR QUOTATION\nPR No. 38936") {
		t.Fatal("expected RFQ detection")
	}
	if looksLikeRfqSheetText("item_name,unit\nPen,pcs") {
		t.Fatal("plain items csv must not read as RFQ")
	}
}

func TestSanitizeMapImportPayload(t *testing.T) {
	payload := map[string]any{
		"kind":      "partners",
		"file_name": "vendors.csv",
		"headers":   []any{"Company Name", "Phone", ""},
		"column_map": map[string]any{
			"company_name": "Company Name",
			"phone":        "Phone",
			"bogus_field":  "Company Name",
			"email":        "Not A Header",
		},
		"csv_text":  "Company Name,Phone\nAcme,123",
		"truncated": false,
		"ui":        "/evil",
	}
	out := sanitizeMapImportPayload(payload)
	if out["kind"] != "partners" {
		t.Fatalf("kind = %v", out["kind"])
	}
	if _, ok := out["ui"]; ok {
		t.Fatal("ui must be dropped")
	}
	cm, _ := out["column_map"].(map[string]string)
	if cm["company_name"] != "Company Name" || cm["phone"] != "Phone" {
		t.Fatalf("column_map = %v", cm)
	}
	if _, ok := cm["bogus_field"]; ok {
		t.Fatal("non-catalog field must be dropped")
	}
	if _, ok := cm["email"]; ok {
		t.Fatal("mapping to unknown header must be dropped")
	}
	headers, _ := out["headers"].([]string)
	if len(headers) != 2 {
		t.Fatalf("headers = %v", headers)
	}
	// Unknown kind falls back to items.
	out2 := sanitizeMapImportPayload(map[string]any{"kind": "yolo"})
	if out2["kind"] != "items" {
		t.Fatalf("fallback kind = %v", out2["kind"])
	}
}

func TestWantsDatasetImport(t *testing.T) {
	if !wantsDatasetImport("please import this file", "draft_open_document", "quotation") {
		t.Fatal("importish query should trigger")
	}
	if !wantsDatasetImport("anything", "draft_open_document", "bulk_inventory") {
		t.Fatal("bulk_inventory kind should trigger")
	}
	if wantsDatasetImport("create a quotation for Acme", "draft_open_document", "quotation") {
		t.Fatal("plain create should not trigger")
	}
}

func TestToolMapImportDatasetPermissionAndDraft(t *testing.T) {
	tuNo := auth.TenantUser{}
	tr := toolMapImportDataset(tuNo, map[string]any{"file_name": "x.csv", "csv_text": "a,b\n1,2"})
	if !tr.Denied {
		t.Fatal("expected denied without migration.center read")
	}

	tu := auth.TenantUser{IsTenantOwner: true}
	tr = toolMapImportDataset(tu, map[string]any{
		"file_name": "items.csv",
		"csv_text":  "Item Name,UOM,Selling Price\nPen,pcs,10",
	})
	if !tr.OK || tr.ActionDraft == nil {
		t.Fatalf("expected draft, got %+v", tr)
	}
	if tr.ActionDraft.Type != "map_import_dataset" {
		t.Fatalf("draft type = %q", tr.ActionDraft.Type)
	}
	if tr.ActionDraft.Payload["kind"] != "items" {
		t.Fatalf("kind = %v", tr.ActionDraft.Payload["kind"])
	}
	cm, _ := tr.ActionDraft.Payload["column_map"].(map[string]string)
	if cm["item_name"] != "Item Name" || cm["unit"] != "UOM" {
		t.Fatalf("column_map = %v", cm)
	}
}
