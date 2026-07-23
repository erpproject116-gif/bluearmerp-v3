package money

import "testing"

func TestDisplaySign(t *testing.T) {
	cases := map[string]string{
		"":         PesoSign,
		"PHP":      PesoSign,
		"php":      PesoSign,
		"DOMESTIC": PesoSign,
		"$":        PesoSign,
		"USD":      "USD",
		PesoSign:   PesoSign,
	}
	for in, want := range cases {
		if got := DisplaySign(in); got != want {
			t.Fatalf("DisplaySign(%q)=%q want %q", in, got, want)
		}
	}
}

func TestFormat(t *testing.T) {
	if got := Format(1234.5, "PHP"); got != "₱1,234.50" {
		t.Fatalf("got %q", got)
	}
	if got := Format(1000000, ""); got != "₱1,000,000.00" {
		t.Fatalf("got %q", got)
	}
	if got := Format(-12.3, "PHP"); got != "-₱12.30" {
		t.Fatalf("got %q", got)
	}
}
