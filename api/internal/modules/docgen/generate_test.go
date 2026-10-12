package docgen

import (
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestRfqGenerateAllowed(t *testing.T) {
	if !rfqGenerateAllowed(auth.TenantUser{}, "purchase_order") {
		t.Fatal("purchase order target stays available")
	}
	if !rfqGenerateAllowed(auth.TenantUser{IsTenantOwner: true}, "rfq") {
		t.Fatal("owner can generate an RFQ")
	}
	if rfqGenerateAllowed(auth.TenantUser{}, "rfq") {
		t.Fatal("RFQ target requires purchase_order.rfq_create")
	}
}
