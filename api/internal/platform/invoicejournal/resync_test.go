package invoicejournal

import (
	"os"
	"strings"
	"testing"
)

// Resync must void then Sync with a nil existing id so a posted JE is not left untouched.
func TestResyncSourceCreatesFreshEntry(t *testing.T) {
	src, err := os.ReadFile("resync.go")
	if err != nil {
		t.Fatal(err)
	}
	body := string(src)
	if !strings.Contains(body, "VoidTx(") {
		t.Fatal("Resync must call VoidTx before rebuilding")
	}
	if !strings.Contains(body, "SyncTx(") {
		t.Fatal("Resync must call SyncTx to create the replacement entry")
	}
	if !strings.Contains(body, "SyncTx(ctx, tx, tenantID, userID, entryDate, remarks, nil, lines, autoPost)") {
		t.Fatal("Resync must pass nil existingJEID so Sync creates a new entry (posted IDs are immutable in Sync)")
	}
}

// Account changes after post must not reverse inventory — same rule as void voucher.
func TestResyncNeverTouchesInventory(t *testing.T) {
	files := []string{"resync.go", "void.go", "invoicejournal.go"}
	forbidden := []string{"inv_stock_movements", "inv_serial_units", "inv_lot_batches"}
	for _, f := range files {
		src, err := os.ReadFile(f)
		if err != nil {
			t.Fatalf("read %s: %v", f, err)
		}
		for _, table := range forbidden {
			if strings.Contains(string(src), table) {
				t.Fatalf("%s must not reference %s", f, table)
			}
		}
	}
}
