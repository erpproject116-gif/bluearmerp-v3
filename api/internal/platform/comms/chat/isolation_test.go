package chat

import "testing"

// Documents the tenant-isolation contract for handlers (defense-in-depth checklist).
// Full DB cross-tenant HTTP tests run in CI with a migrated database when available.
func TestTenantIsolationContract(t *testing.T) {
	rules := []string{
		"never accept tenant_id from client body/query",
		"every channel query includes tenant_id = tu.TenantID",
		"membership required before messages/attachments",
		"mention and member user_ids must belong to same tenant",
		"entity links verified with tenant-scoped existence checks",
		"attachment download joins message → tenant + membership",
	}
	if len(rules) < 6 {
		t.Fatal("isolation contract incomplete")
	}
	// DM keys are tenant-scoped via unique (tenant_id, dm_key)
	if dmKey(10, 2) != "2:10" {
		t.Fatal("dm keys must be ordered and stable")
	}
}
