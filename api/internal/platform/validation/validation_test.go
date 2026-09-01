package validation

import "testing"

func TestNormalizePHMobile(t *testing.T) {
	tests := []struct {
		in   string
		want string
		ok   bool
	}{
		{"0917 123 4567", "+639171234567", true},
		{"9171234567", "+639171234567", true},
		{"639171234567", "+639171234567", true},
		{"+639171234567", "+639171234567", true},
		{"08171234567", "", false},
		{"", "", false},
	}
	for _, tc := range tests {
		got, ok := NormalizePHMobile(tc.in)
		if got != tc.want || ok != tc.ok {
			t.Fatalf("NormalizePHMobile(%q) = (%q, %v), want (%q, %v)", tc.in, got, ok, tc.want, tc.ok)
		}
	}
}

func TestNormalizePHMobileLocal(t *testing.T) {
	got, ok := NormalizePHMobileLocal("917-123-4567")
	if !ok || got != "09171234567" {
		t.Fatalf("NormalizePHMobileLocal = (%q, %v)", got, ok)
	}
}

func TestNormalizePHTIN(t *testing.T) {
	got, ok := NormalizePHTIN("209-161-308- 000")
	if !ok || got != "209-161-308-000" {
		t.Fatalf("NormalizePHTIN 12-digit corporate = (%q, %v)", got, ok)
	}
	got, ok = NormalizePHTIN("123456789")
	if !ok || got != "123-456-789" {
		t.Fatalf("NormalizePHTIN 9-digit individual = (%q, %v)", got, ok)
	}
	got, ok = NormalizePHTIN("123-456-789-001")
	if !ok || got != "123-456-789-001" {
		t.Fatalf("NormalizePHTIN branch office = (%q, %v)", got, ok)
	}
	if _, ok := NormalizePHTIN("12345"); ok {
		t.Fatal("expected invalid TIN")
	}
}

func TestNormalizePHPhone(t *testing.T) {
	got, ok := NormalizePHPhone("(032) 123-4567")
	if !ok || got != "0321234567" {
		t.Fatalf("NormalizePHPhone = (%q, %v)", got, ok)
	}
	if _, ok := NormalizePHPhone("123"); ok {
		t.Fatal("expected invalid phone")
	}
}

func TestValidatePartnerContact(t *testing.T) {
	mobile := "09171234567"
	email := "bad@"
	if errs := ValidatePartnerContact(PartnerContact{Mobile: &mobile, Email: &email}); errs == nil {
		t.Fatal("expected email error")
	}
	if errs := ValidatePartnerContact(PartnerContact{Mobile: &mobile}); errs != nil {
		t.Fatalf("unexpected errors: %v", errs)
	}
}
