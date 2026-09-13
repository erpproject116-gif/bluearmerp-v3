package console

import "testing"

func TestCustomerAccessFlags(t *testing.T) {
	po := customerAccessFlags("itsjohnranel@gmail.com", "ACME")
	if po["is_product_owner"] != true || po["is_platform_superadmin"] != true {
		t.Fatalf("expected product owner flags: %#v", po)
	}
	if po["access_label"] != "Product owner / superadmin" {
		t.Fatalf("label: %#v", po["access_label"])
	}
	op := customerAccessFlags("shop@example.com", "BLUEARM")
	if op["is_operator_workspace"] != true {
		t.Fatalf("expected operator workspace: %#v", op)
	}
	if op["is_product_owner"] != false {
		t.Fatalf("shop email must not be product owner: %#v", op)
	}
}
