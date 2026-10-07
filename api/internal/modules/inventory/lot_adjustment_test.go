package inventory

import (
	"testing"
	"time"
)

func TestValidateLotRegisterBodyRequiresManualLotNumber(t *testing.T) {
	body := lotRegisterBody{ItemID: 1, LocationID: 2, Qty: 1}
	errs := validateLotRegisterBody(body)
	if errs["lot_no"] != "Lot number is required." {
		t.Fatalf("expected manual lot-number validation, got %v", errs)
	}
}

func TestValidateLotRegisterBodyAllowsAutomaticLotNumber(t *testing.T) {
	body := lotRegisterBody{ItemID: 1, LocationID: 2, Qty: 1, AutoGenerate: true}
	if errs := validateLotRegisterBody(body); len(errs) != 0 {
		t.Fatalf("expected automatic registration body to be valid, got %v", errs)
	}
}

func TestGeneratedLotNumberFormat(t *testing.T) {
	now := time.Date(2026, time.October, 7, 23, 30, 0, 0, time.FixedZone("UTC+8", 8*60*60))
	if got, want := generatedLotSequenceKey(now), "lot_number:20261007"; got != want {
		t.Fatalf("generatedLotSequenceKey() = %q, want %q", got, want)
	}
	if got, want := formatGeneratedLotNumber(now, 42), "LOT-20261007-000042"; got != want {
		t.Fatalf("formatGeneratedLotNumber() = %q, want %q", got, want)
	}
}

func TestGeneratedLotNumbersDifferBySequence(t *testing.T) {
	now := time.Date(2026, time.October, 7, 0, 0, 0, 0, time.UTC)
	first := formatGeneratedLotNumber(now, 1)
	second := formatGeneratedLotNumber(now, 2)
	if first == second {
		t.Fatalf("different allocated sequences produced duplicate lot number %q", first)
	}
}
