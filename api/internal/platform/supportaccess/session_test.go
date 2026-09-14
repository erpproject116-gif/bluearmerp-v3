package supportaccess

import "testing"

func TestNormalizeMode(t *testing.T) {
	if NormalizeMode("") != ModeReadOnly {
		t.Fatal("default")
	}
	if NormalizeMode("READ_WRITE") != ModeReadWrite {
		t.Fatal("write")
	}
	if NormalizeMode("read_only") != ModeReadOnly {
		t.Fatal("ro")
	}
}

func TestMutationAllowed(t *testing.T) {
	if !MutationAllowed("GET", "/api/v1/inventory/items", ModeReadOnly) {
		t.Fatal("get should allow")
	}
	if MutationAllowed("POST", "/api/v1/inventory/items", ModeReadOnly) {
		t.Fatal("post blocked in read_only")
	}
	if !MutationAllowed("POST", "/api/v1/inventory/items", ModeReadWrite) {
		t.Fatal("post allowed in read_write")
	}
	if !MutationAllowed("POST", "/api/v1/auth/me", ModeReadOnly) {
		t.Fatal("allowlisted")
	}
	if MutationAllowed("POST", "/api/v1/platform/console/customers/1/wipe", ModeReadWrite) {
		t.Fatal("wipe always blocked via MutationAllowed destructive path")
	}
}

func TestIsDestructiveRequest(t *testing.T) {
	if !IsDestructiveRequest("POST", "/api/v1/platform/console/customers/9/wipe") {
		t.Fatal("wipe")
	}
	if !IsDestructiveRequest("POST", "/api/v1/platform/console/customers/9/suspend") {
		t.Fatal("suspend")
	}
	if !IsDestructiveRequest("DELETE", "/api/v1/platform/console/customers/9") {
		t.Fatal("delete customer")
	}
	if IsDestructiveRequest("GET", "/api/v1/platform/console/customers/9") {
		t.Fatal("get ok")
	}
}
