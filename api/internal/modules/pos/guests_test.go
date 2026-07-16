package pos

import "testing"

func TestApplyGuestDiscountsEqualSplitSeniorAndRegular(t *testing.T) {
	lines := []CartLine{
		{ID: 1, LineNo: 1, LineTotal: 1000, GuestNo: 0},
	}
	guests := []checkoutGuestBody{
		{GuestNo: 1, DisplayName: "Lola", PrivilegeType: "senior", PrivilegeIDNo: "SC-1"},
		{GuestNo: 2, DisplayName: "Ana", PrivilegeType: "none"},
	}
	cfg := privilegeSettings{SeniorPct: 20, PwdPct: 20, StudentPct: 10}
	got, err := applyGuestDiscounts(lines, guests, cfg)
	if err != nil {
		t.Fatal(err)
	}
	if len(got.Guests) != 2 {
		t.Fatalf("guests=%d", len(got.Guests))
	}
	// Equal split 500 each; senior 20% of 500 = 100 → net 400; regular net 500.
	if got.Guests[0].DiscountAmount != 100 || got.Guests[0].NetAmount != 400 {
		t.Fatalf("senior guest: disc=%.2f net=%.2f", got.Guests[0].DiscountAmount, got.Guests[0].NetAmount)
	}
	if got.Guests[1].DiscountAmount != 0 || got.Guests[1].NetAmount != 500 {
		t.Fatalf("regular guest: disc=%.2f net=%.2f", got.Guests[1].DiscountAmount, got.Guests[1].NetAmount)
	}
	if got.ExemptBase != 400 || got.TaxableBase != 500 || got.DiscountTotal != 100 {
		t.Fatalf("bases exempt=%.2f taxable=%.2f disc=%.2f", got.ExemptBase, got.TaxableBase, got.DiscountTotal)
	}
}

func TestApplyGuestDiscountsAssignedLines(t *testing.T) {
	lines := []CartLine{
		{ID: 1, LineTotal: 800, GuestNo: 1},
		{ID: 2, LineTotal: 200, GuestNo: 2},
	}
	guests := []checkoutGuestBody{
		{GuestNo: 1, PrivilegeType: "pwd", PrivilegeIDNo: "PWD-9"},
		{GuestNo: 2, PrivilegeType: "none"},
	}
	got, err := applyGuestDiscounts(lines, guests, privilegeSettings{SeniorPct: 20, PwdPct: 20})
	if err != nil {
		t.Fatal(err)
	}
	if got.Guests[0].DiscountAmount != 160 || got.ExemptBase != 640 {
		t.Fatalf("pwd share disc=%.2f exempt=%.2f", got.Guests[0].DiscountAmount, got.ExemptBase)
	}
	if got.TaxableBase != 200 {
		t.Fatalf("taxable=%.2f", got.TaxableBase)
	}
}
