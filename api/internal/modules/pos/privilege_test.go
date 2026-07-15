package pos

import "testing"

func TestApplyPrivilegeSeniorRequiresID(t *testing.T) {
	_, err := applyPrivilegeDiscount(1000, privilegeInput{Type: PrivilegeSenior}, privilegeSettings{SeniorPct: 20, PwdPct: 20, StudentPct: 10})
	if err == nil {
		t.Fatal("expected error without ID")
	}
}

func TestApplyPrivilegeSenior20VATExempt(t *testing.T) {
	r, err := applyPrivilegeDiscount(1120, privilegeInput{Type: PrivilegeSenior, IDNo: "SC-1", Name: "Juan"}, privilegeSettings{SeniorPct: 20, PwdPct: 20, StudentPct: 10})
	if err != nil {
		t.Fatal(err)
	}
	if r.Discount != 224 || r.BaseAfterDisc != 896 || !r.VATExempted {
		t.Fatalf("got disc=%.2f base=%.2f vatExempt=%v", r.Discount, r.BaseAfterDisc, r.VATExempted)
	}
}

func TestApplyPrivilegeStudentKeepsVAT(t *testing.T) {
	r, err := applyPrivilegeDiscount(1000, privilegeInput{Type: PrivilegeStudent}, privilegeSettings{StudentPct: 10})
	if err != nil {
		t.Fatal(err)
	}
	if r.Discount != 100 || r.VATExempted {
		t.Fatalf("got disc=%.2f vatExempt=%v", r.Discount, r.VATExempted)
	}
}
