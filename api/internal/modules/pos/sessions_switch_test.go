package pos

import (
	"testing"
	"time"
)

func TestFormatSessionNo(t *testing.T) {
	at := time.Date(2026, 10, 3, 12, 0, 0, 0, time.UTC)
	got := formatSessionNo(at, 7)
	if got != "POS-20261003-007" {
		t.Fatalf("got %q want POS-20261003-007", got)
	}
}

func TestSwitchLocationInputErrors(t *testing.T) {
	if errs := switchLocationInputErrors(1, 0, 0, false); errs != nil {
		t.Fatalf("want nil, got %v", errs)
	}
	errs := switchLocationInputErrors(0, -1, -2, true)
	if errs["location_id"] == "" || errs["closing_cash"] == "" || errs["opening_cash"] == "" || errs["offline"] == "" {
		t.Fatalf("missing keys: %v", errs)
	}
}
