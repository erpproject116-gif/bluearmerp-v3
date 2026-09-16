package crm

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestSplitSerials(t *testing.T) {
	cases := []struct {
		in   string
		want []string
	}{
		{"", nil},
		{"  SN-1  ", []string{"SN-1"}},
		{"SN-1, SN-2,SN-3", []string{"SN-1", "SN-2", "SN-3"}},
		{"SN-1, , SN-2", []string{"SN-1", "SN-2"}},
	}
	for _, tc := range cases {
		got := splitSerials(tc.in)
		if len(got) != len(tc.want) {
			t.Fatalf("splitSerials(%q) len=%d want %d (%v)", tc.in, len(got), len(tc.want), got)
		}
		for i := range tc.want {
			if got[i] != tc.want[i] {
				t.Fatalf("splitSerials(%q)[%d]=%q want %q", tc.in, i, got[i], tc.want[i])
			}
		}
	}
}

// Guards the New Sales warranty 500 regressions:
// 1) upsert must conflict on tenant+serial (partial unique), not sales_line+serial
// 2) sync must collect query rows before Exec on the same tx (pgx conn busy)
func TestWarrantySyncSourceGuards(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	srcPath := filepath.Join(filepath.Dir(thisFile), "warranty_sync.go")
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		t.Fatalf("read warranty_sync.go: %v", err)
	}
	src := string(raw)

	const wantConflict = "on conflict (tenant_id, serial_no) where (status <> 'void')"
	if !strings.Contains(src, wantConflict) {
		t.Fatalf("warranty upsert must use %q so existing CRM serial rows update instead of 500", wantConflict)
	}
	if strings.Contains(src, "on conflict (tenant_id, sales_line_id, serial_no)") {
		t.Fatal("do not conflict on (tenant_id, sales_line_id, serial_no); that misses uq_crm_warranty_assets_tenant_serial")
	}

	// Naive structural guard: after the sales serial-unit Query, the first Next loop must only append
	// (collect), and Exec must appear only after that loop's Close.
	saleSyncStart := strings.Index(src, "func SyncWarrantyAssetsFromSale")
	if saleSyncStart < 0 {
		t.Fatal("SyncWarrantyAssetsFromSale missing")
	}
	saleSync := src[saleSyncStart:]
	if end := strings.Index(saleSync, "\nfunc "); end > 0 {
		saleSync = saleSync[:end]
	}
	firstQuery := strings.Index(saleSync, "tx.Query(")
	firstNext := strings.Index(saleSync, "for unitRows.Next()")
	firstClose := strings.Index(saleSync, "unitRows.Close()")
	firstExec := strings.Index(saleSync, "tx.Exec(")
	if firstQuery < 0 || firstNext < 0 || firstClose < 0 || firstExec < 0 {
		t.Fatalf("expected Query/Next/Close/Exec markers in SyncWarrantyAssetsFromSale")
	}
	if !(firstQuery < firstNext && firstNext < firstClose && firstClose < firstExec) {
		t.Fatalf("serial-unit path must Query → Next(collect) → Close → Exec; got order query=%d next=%d close=%d exec=%d",
			firstQuery, firstNext, firstClose, firstExec)
	}
}
