package outbound

import "testing"

func TestSignAndVerify(t *testing.T) {
	body := []byte(`{"event":"booking.created"}`)
	sig := signBody("test-secret", body)
	if !VerifySignature("test-secret", "sha256="+sig, body) {
		t.Fatal("expected verify ok")
	}
	if VerifySignature("wrong", "sha256="+sig, body) {
		t.Fatal("expected verify fail")
	}
}

func TestEventAllowed(t *testing.T) {
	if !eventAllowed(nil, "booking.created") {
		t.Fatal("empty filter allows all")
	}
	if !eventAllowed([]string{"booking.*"}, "booking.created") {
		t.Fatal("prefix filter")
	}
	if eventAllowed([]string{"crm.*"}, "booking.created") {
		t.Fatal("should not allow")
	}
}
