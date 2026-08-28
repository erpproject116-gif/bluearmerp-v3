package shipping

import "testing"

func TestNormalizeShippingOrderStatus(t *testing.T) {
	if got, ok := NormalizeShippingOrderStatus(""); !ok || got != "draft" {
		t.Fatalf("empty => draft, got %q ok=%v", got, ok)
	}
	if got, ok := NormalizeShippingOrderStatus("Shipped"); !ok || got != "shipped" {
		t.Fatalf("shipped, got %q ok=%v", got, ok)
	}
	if _, ok := NormalizeShippingOrderStatus("bogus"); ok {
		t.Fatal("bogus should fail")
	}
}

func TestNormalizeDeliveryTripStatus(t *testing.T) {
	if got, ok := NormalizeDeliveryTripStatus(""); !ok || got != "planned" {
		t.Fatalf("empty => planned, got %q ok=%v", got, ok)
	}
	if got, ok := NormalizeDeliveryTripStatus("IN_PROGRESS"); !ok || got != "in_progress" {
		t.Fatalf("in_progress, got %q ok=%v", got, ok)
	}
	if _, ok := NormalizeDeliveryTripStatus("draft"); ok {
		t.Fatal("draft is not a trip status")
	}
}
