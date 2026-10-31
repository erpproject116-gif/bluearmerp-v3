package outbound

import (
	"net"
	"testing"
	"time"
)

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

func TestValidateTargetURL(t *testing.T) {
	prev := lookupIPs
	lookupIPs = func(host string) ([]net.IP, error) {
		if host == "example.com" {
			return []net.IP{net.ParseIP("93.184.216.34")}, nil
		}
		if host == "evil.internal" {
			return []net.IP{net.ParseIP("10.0.0.5")}, nil
		}
		return nil, &net.DNSError{Err: "no such host", Name: host, IsNotFound: true}
	}
	t.Cleanup(func() { lookupIPs = prev })

	if err := ValidateTargetURL("http://127.0.0.1/hook"); err == nil {
		t.Fatal("expected 127.0.0.1 rejected")
	}
	if err := ValidateTargetURL("https://localhost/hook"); err == nil {
		t.Fatal("expected localhost rejected")
	}
	if err := ValidateTargetURL("http://10.0.0.1/hook"); err == nil {
		t.Fatal("expected private IP rejected")
	}
	if err := ValidateTargetURL("https://evil.internal/hook"); err == nil {
		t.Fatal("expected hostname resolving to private IP rejected")
	}
	if err := ValidateTargetURL("ftp://example.com/hook"); err == nil {
		t.Fatal("expected non-http scheme rejected")
	}
	if err := ValidateTargetURL("https://example.com/hooks/bluearm"); err != nil {
		t.Fatalf("expected public https URL ok, got %v", err)
	}
}

func TestBackoffDuration(t *testing.T) {
	if backoffDuration(1) != 30*time.Second {
		t.Fatalf("attempt 1: got %v", backoffDuration(1))
	}
	if backoffDuration(2) != 60*time.Second {
		t.Fatalf("attempt 2: got %v", backoffDuration(2))
	}
	if backoffDuration(5) > 900*time.Second {
		t.Fatal("backoff should cap at 900s")
	}
}
