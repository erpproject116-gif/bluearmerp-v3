package entitlement

import (
	"strconv"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
)

func TestInvalidateTenantClearsBillingState(t *testing.T) {
	if !billingCache.Enabled() {
		t.Skip("entitlement cache disabled in this environment")
	}
	t.Cleanup(ResetCache)
	ResetCache()

	billingCache.Set(strconv.Itoa(7), billingState{HasCustomer: true, Urgency: "trial_active"})
	if _, ok := billingCache.Get("7"); !ok {
		t.Fatal("expected the cached state to be readable")
	}
	InvalidateTenant(7)
	if _, ok := billingCache.Get("7"); ok {
		t.Fatal("expected InvalidateTenant to clear the entry")
	}
}

// Suspending or renewing a customer must not wait out the TTL: the registry hook
// registered in init() has to reach this cache.
func TestRegistryHookInvalidates(t *testing.T) {
	if !billingCache.Enabled() {
		t.Skip("entitlement cache disabled in this environment")
	}
	t.Cleanup(ResetCache)
	ResetCache()

	billingCache.Set("9", billingState{HasCustomer: true})
	customerregistry.NotifyTenantBillingChanged(9)
	if _, ok := billingCache.Get("9"); ok {
		t.Fatal("billing-changed hook did not reach the entitlement cache")
	}
}
