package copilot

import (
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestParseSerialLotCSVWithHeader(t *testing.T) {
	csv := "Serial No,Lot No,Item Code,Qty\nSN-001,L-01,PEN-01,1\nSN-002,,PEN-01,\n,L-02,INK-02,5\n"
	rows := parseSerialLotCSV(csv)
	if len(rows) != 3 {
		t.Fatalf("rows = %d (%+v)", len(rows), rows)
	}
	if rows[0].Serial != "SN-001" || rows[0].Lot != "L-01" || rows[0].ItemCode != "PEN-01" || rows[0].Qty != 1 {
		t.Fatalf("row0 = %+v", rows[0])
	}
	if rows[1].Serial != "SN-002" || rows[1].Lot != "" {
		t.Fatalf("row1 = %+v", rows[1])
	}
	if rows[2].Serial != "" || rows[2].Lot != "L-02" || rows[2].Qty != 5 {
		t.Fatalf("row2 = %+v", rows[2])
	}
}

func TestParseSerialLotCSVPlainList(t *testing.T) {
	rows := parseSerialLotCSV("SN-100\nSN-101\n\nSN-102\n")
	if len(rows) != 3 {
		t.Fatalf("rows = %d", len(rows))
	}
	for i, want := range []string{"SN-100", "SN-101", "SN-102"} {
		if rows[i].Serial != want {
			t.Fatalf("row %d = %+v", i, rows[i])
		}
	}
}

func TestParseSerialLotCSVRowCap(t *testing.T) {
	var b strings.Builder
	b.WriteString("serial\n")
	for i := 0; i < maxSerialSeedRows+50; i++ {
		b.WriteString("SN\n")
	}
	if got := len(parseSerialLotCSV(b.String())); got != maxSerialSeedRows {
		t.Fatalf("cap = %d, want %d", got, maxSerialSeedRows)
	}
}

func TestToolProposeSerialLotImport(t *testing.T) {
	// Note: legacy tenants without matrix rows get operational read on
	// inventory.*, so the deny path only applies with explicit matrix denies.
	tu := auth.TenantUser{IsTenantOwner: true}
	tr := toolProposeSerialLotImport(tu, map[string]any{
		"file_name": "serials.csv",
		"csv_text":  "serial,lot\nSN-1,L-1\nSN-2,\n",
	})
	if !tr.OK || tr.ActionDraft == nil {
		t.Fatalf("expected draft, got %+v", tr)
	}
	if tr.ActionDraft.Payload["serial_count"] != 2 || tr.ActionDraft.Payload["lot_count"] != 1 {
		t.Fatalf("counts = %v / %v", tr.ActionDraft.Payload["serial_count"], tr.ActionDraft.Payload["lot_count"])
	}
	if !strings.Contains(tr.ActionDraft.Summary, "nothing is registered") {
		t.Fatalf("summary must state propose-only: %q", tr.ActionDraft.Summary)
	}

	empty := toolProposeSerialLotImport(tu, map[string]any{"csv_text": ""})
	if empty.OK {
		t.Fatal("empty attachment must not produce a draft")
	}
}

func TestSanitizeSerialLotPayload(t *testing.T) {
	payload := map[string]any{
		"file_name": "serials.csv",
		"ui":        "/evil",
		"rows": []any{
			map[string]any{"serial": "SN-1", "lot": "L-1", "item_code": "PEN", "qty": float64(2)},
			map[string]any{"serial": "", "lot": ""},
			map[string]any{"lot": "L-2"},
			"garbage",
		},
	}
	out := sanitizeSerialLotPayload(payload)
	if _, ok := out["ui"]; ok {
		t.Fatal("ui must be dropped")
	}
	rows, _ := out["rows"].([]any)
	if len(rows) != 2 {
		t.Fatalf("rows = %v", rows)
	}
	if out["serial_count"] != 1 || out["lot_count"] != 2 {
		t.Fatalf("counts = %v / %v", out["serial_count"], out["lot_count"])
	}
}
