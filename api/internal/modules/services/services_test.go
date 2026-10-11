package services

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
)

func TestDoubleConvertAndGenerateReturnExisting(t *testing.T) {
	id, create := existingOrCreate(42)
	if create || id != 42 {
		t.Fatalf("existing job: id=%d create=%v", id, create)
	}
	id, create = existingOrCreate(0)
	if !create || id != 0 {
		t.Fatalf("new job: id=%d create=%v", id, create)
	}
}

func TestStatusPatchCannotConfirm(t *testing.T) {
	if err := validateStatusPatch("approved", "completed"); err == nil {
		t.Fatal("approval status was accepted")
	}
	if err := validateStatusPatch("", "approved"); err == nil {
		t.Fatal("operational approved was accepted")
	}
	if err := validateStatusPatch("", "completed"); err != nil {
		t.Fatal(err)
	}
}

func TestSerializedQtyCannotBeFractional(t *testing.T) {
	if err := validateSlipItemQty(true, 0.5); err == nil {
		t.Fatal("fractional serial was accepted")
	}
	if err := validateSlipItemQty(true, 2); err == nil {
		t.Fatal("serial quantity above 1 was accepted")
	}
	if err := validateSlipItemQty(true, 1); err != nil {
		t.Fatal(err)
	}
	if err := validateSlipItemQty(false, 0.5); err != nil {
		t.Fatal(err)
	}
}

func TestCrossTenantReadDenied(t *testing.T) {
	if err := denyCrossTenant(2, 1); !errors.Is(err, errCrossTenant) {
		t.Fatalf("got %v", err)
	}
	if err := denyCrossTenant(1, 1); err != nil {
		t.Fatal(err)
	}
}

func TestReceiveWithoutDestinationAccessDenied(t *testing.T) {
	if err := authorizeSlipReceive(false); !errors.Is(err, branchiso.ErrForbiddenLocation) {
		t.Fatalf("got %v", err)
	}
	if err := authorizeSlipReceive(true); err != nil {
		t.Fatal(err)
	}
	if err := authorizeSlipDispatch(false); !errors.Is(err, branchiso.ErrForbiddenLocation) {
		t.Fatalf("dispatch got %v", err)
	}
}

func TestDisabledModuleDecision(t *testing.T) {
	status, code := moduleAccessDecision(false, nil)
	if status != 403 || code != "ERR_MODULE_DISABLED" {
		t.Fatalf("status=%d code=%s", status, code)
	}
	if status, code := moduleAccessDecision(true, nil); status != 0 || code != "" {
		t.Fatalf("enabled status=%d code=%s", status, code)
	}
}

func TestPartnerRequiredUnlessInternal(t *testing.T) {
	id := int64(9)
	if err := partnerRequired(TypeConfig{}, nil); err == nil {
		t.Fatal("customer job allowed a missing customer")
	}
	if err := partnerRequired(TypeConfig{Internal: true}, nil); err != nil {
		t.Fatal(err)
	}
	if err := partnerRequired(TypeConfig{}, &id); err != nil {
		t.Fatal(err)
	}
}

func TestServicesPackageDoesNotPostOrTouchLedgers(t *testing.T) {
	forbidden := []string{
		"ApplyStockDelta",
		"invoicejournal",
		"inventorygl",
		"ledger.Poster",
		"inv_stock_movements",
		"fin_journal_entries",
		"inv_item_location_balances",
		"payroll",
	}
	entries, err := os.ReadDir(".")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		body, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		text := string(body)
		for _, word := range forbidden {
			if strings.Contains(text, word) {
				t.Fatalf("%s contains %s", name, word)
			}
		}
	}
}

func TestMigrationStaysInsideServices(t *testing.T) {
	path := filepath.Join("..", "..", "..", "migrations", "319_services_module.sql")
	body, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	text := strings.ToLower(string(body))
	for _, banned := range []string{
		"alter table public.so_",
		"alter table public.sa_",
		"alter table public.quo_",
		"alter table public.inv_",
		"alter table public.fin_",
		"alter table public.crm_",
		"alter table public.book_",
		"alter table public.mfg_",
		"inv_items",
		"is_enabled",
		"integration_mode in (",
	} {
		if strings.Contains(text, banned) {
			t.Fatalf("migration contains %s", banned)
		}
	}
	if !strings.Contains(text, "check (integration_mode = 'a')") {
		t.Fatal("integration mode is not locked to A")
	}
	if !strings.Contains(text, "check (posting_status = 'not_posted')") {
		t.Fatal("materials posting is not locked")
	}
	if !strings.Contains(text, "check (inventory_posting_status = 'not_applicable')") {
		t.Fatal("job inventory posting is not locked")
	}
	if !strings.Contains(text, "uq_svc_equipment_active_serial") {
		t.Fatal("missing active serial uniqueness")
	}
	if !strings.Contains(text, "svc_slip_serial_not_fractional") {
		t.Fatal("missing serial quantity constraint")
	}
	if !strings.Contains(text, "uq_svc_jobs_sales_order") {
		t.Fatal("missing one job per sales order")
	}
}

func TestTypePatchDoesNotRewriteJobs(t *testing.T) {
	body, err := os.ReadFile("settings.go")
	if err != nil {
		t.Fatal(err)
	}
	fn := string(body)
	start := strings.Index(fn, "func patchType")
	end := strings.Index(fn, "func listTransitions")
	if start < 0 || end < start {
		t.Fatal("patchType not found")
	}
	if strings.Contains(fn[start:end], "svc_jobs") {
		t.Fatal("type update writes job rows")
	}
}
