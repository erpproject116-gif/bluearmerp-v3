package branding

import "testing"

func TestNormalizePrintHeaderLines_dropsCompanyDuplicate(t *testing.T) {
	got := normalizePrintHeaderLines("Bluearm Computers", "Bluearm Computers\n1205 Hernan Cortes St")
	if got != "1205 Hernan Cortes St" {
		t.Fatalf("got %q", got)
	}
}

func TestNormalizePrintHeaderLines_stripsPrefix(t *testing.T) {
	got := normalizePrintHeaderLines(
		"Bluearm Computers",
		"Bluearm Computers 1205 Hernan Cortes St, Mandaue, 6014 Cebu",
	)
	want := "1205 Hernan Cortes St, Mandaue, 6014 Cebu"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}
