package usermgmt

import (
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func TestCanTransferCompanyOwnership(t *testing.T) {
	if canTransferCompanyOwnership(auth.TenantUser{TenantRole: "member"}) {
		t.Fatal("member must not transfer ownership")
	}
	if canTransferCompanyOwnership(auth.TenantUser{IsStoreAdmin: true, TenantRole: "store_admin"}) {
		t.Fatal("store admin who is not owner must not transfer ownership")
	}
	if !canTransferCompanyOwnership(auth.TenantUser{IsTenantOwner: true}) {
		t.Fatal("current owner must be able to transfer")
	}
	if !canTransferCompanyOwnership(auth.TenantUser{IsPlatformSuperadmin: true}) {
		t.Fatal("platform superadmin must be able to transfer")
	}
	if !canTransferCompanyOwnership(auth.TenantUser{Email: "itsjohnranel@gmail.com"}) {
		t.Fatal("bootstrap superadmin email must be able to transfer")
	}
}

func TestOperatorOwnerLockMessage(t *testing.T) {
	if msg := operatorOwnerLockMessage("ACME", "anyone@x.com"); msg != "" {
		t.Fatalf("customer company must allow transfer: %s", msg)
	}
	if msg := operatorOwnerLockMessage("BLUEARM", "bluearmph@gmail.com"); msg != "" {
		t.Fatalf("bluearmph must remain allowed on BLUEARM: %s", msg)
	}
	if msg := operatorOwnerLockMessage("BLUEARM", "glen.bluearm@gmail.com"); msg == "" {
		t.Fatal("BLUEARM must not transfer to anyone except bluearmph")
	}
}
