package documentlifecycle

import (
	"net/http/httptest"
	"testing"
)

func TestParseLifecycle(t *testing.T) {
	tests := []struct {
		input string
		want  string
		ok    bool
	}{
		{"", Active, true},
		{"active", Active, true},
		{"DELETED", Deleted, true},
		{" all ", All, true},
		{"archived", "", false},
	}
	for _, tt := range tests {
		got, err := Parse(tt.input)
		if (err == nil) != tt.ok || got != tt.want {
			t.Fatalf("Parse(%q) = %q, %v; want %q, ok=%v", tt.input, got, err, tt.want, tt.ok)
		}
	}
}

func TestListPredicate(t *testing.T) {
	tests := []struct {
		lifecycle string
		want      string
	}{
		{"", "d.deleted_at is null"},
		{Active, "d.deleted_at is null"},
		{Deleted, "d.deleted_at is not null"},
		{All, "true"},
	}
	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/documents?lifecycle="+tt.lifecycle, nil)
		got, err := ListPredicate(r, "d")
		if err != nil || got != tt.want {
			t.Fatalf("ListPredicate(%q) = %q, %v; want %q", tt.lifecycle, got, err, tt.want)
		}
	}
}

func TestAllDocumentConfigsAreValid(t *testing.T) {
	configs := []Config{
		QuotationConfig(),
		SalesOrderConfig(),
		SaleConfig(),
		PurchaseRequestConfig(),
		PurchaseOrderConfig(),
		SupplierInvoiceConfig(),
	}
	seen := map[string]bool{}
	for _, cfg := range configs {
		if err := ValidateConfig(cfg); err != nil {
			t.Fatalf("%s config is invalid: %v", cfg.DocumentType, err)
		}
		if seen[cfg.DocumentType] {
			t.Fatalf("duplicate document type %q", cfg.DocumentType)
		}
		seen[cfg.DocumentType] = true
		if len(cfg.Dependencies) == 0 {
			t.Fatalf("%s has no dependency guards", cfg.DocumentType)
		}
	}
}

func TestTransactionalDocumentsGuardBothActions(t *testing.T) {
	for _, cfg := range []Config{SaleConfig(), SupplierInvoiceConfig()} {
		hasDelete, hasRestore := false, false
		for _, dependency := range cfg.Dependencies {
			hasDelete = hasDelete || dependency.BlockDelete
			hasRestore = hasRestore || dependency.BlockRestore
		}
		if !hasDelete || !hasRestore {
			t.Fatalf("%s must guard delete and restore", cfg.DocumentType)
		}
	}
}
