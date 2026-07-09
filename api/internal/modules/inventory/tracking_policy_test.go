package inventory

import "testing"

func TestNormalizeTrackingPolicy(t *testing.T) {
	if NormalizeTrackingPolicy(TrackingPolicyOptional) != TrackingPolicyOptional {
		t.Fatal("optional")
	}
	if NormalizeTrackingPolicy("") != TrackingPolicyRequired {
		t.Fatal("empty -> required")
	}
	if NormalizeTrackingPolicy("bogus") != TrackingPolicyRequired {
		t.Fatal("bogus -> required")
	}
}

func TestValidateSerialUnitCapture(t *testing.T) {
	if err := ValidateSerialUnitCapture(1, TrackingPolicyOptional, 0, 2); err != nil {
		t.Fatalf("optional empty: %v", err)
	}
	if err := ValidateSerialUnitCapture(1, TrackingPolicyRequired, 0, 2); err == nil {
		t.Fatal("required empty should fail")
	}
	if err := ValidateSerialUnitCapture(2, TrackingPolicyRequired, 2, 2); err != nil {
		t.Fatalf("required match: %v", err)
	}
	if err := ValidateSerialUnitCapture(3, TrackingPolicyOptional, 1, 2); err == nil {
		t.Fatal("partial serials should fail count match")
	}
}

func TestValidateLotBatchCapture(t *testing.T) {
	id := int64(5)
	if err := ValidateLotBatchCapture(1, TrackingPolicyOptional, nil); err != nil {
		t.Fatalf("optional nil: %v", err)
	}
	if err := ValidateLotBatchCapture(1, TrackingPolicyRequired, nil); err == nil {
		t.Fatal("required nil should fail")
	}
	if err := ValidateLotBatchCapture(1, TrackingPolicyRequired, &id); err != nil {
		t.Fatalf("required set: %v", err)
	}
}

func TestValidatePlannedSerialCapture(t *testing.T) {
	if err := ValidatePlannedSerialCapture(1, TrackingPolicyOptional, 0, 3); err != nil {
		t.Fatalf("optional no planned: %v", err)
	}
	if err := ValidatePlannedSerialCapture(1, TrackingPolicyRequired, 0, 3); err == nil {
		t.Fatal("required no planned should fail")
	}
	if err := ValidatePlannedSerialCapture(1, TrackingPolicyRequired, 3, 3); err != nil {
		t.Fatalf("required full planned: %v", err)
	}
}
