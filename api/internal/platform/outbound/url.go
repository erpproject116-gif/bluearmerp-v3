package outbound

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// lookupIPs resolves a hostname. Overridden in tests.
var lookupIPs = net.LookupIP

// ValidateTargetURL rejects non-http(s) URLs and hosts that resolve to
// loopback, link-local, or private/reserved addresses (SSRF guard).
func ValidateTargetURL(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return fmt.Errorf("empty URL")
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid URL")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return fmt.Errorf("use an http(s) URL")
	}
	host := strings.TrimSpace(u.Hostname())
	if host == "" {
		return fmt.Errorf("missing host")
	}
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") || lower == "0.0.0.0" {
		return fmt.Errorf("localhost and loopback hosts are not allowed")
	}
	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return fmt.Errorf("private or reserved addresses are not allowed")
		}
		return nil
	}
	ips, err := lookupIPs(host)
	if err != nil {
		// Hostname shape is fine; DNS may be unavailable at save time.
		// Worker re-validates before POST.
		return nil
	}
	if len(ips) == 0 {
		return fmt.Errorf("host did not resolve")
	}
	for _, ip := range ips {
		if isBlockedIP(ip) {
			return fmt.Errorf("private or reserved addresses are not allowed")
		}
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// Carrier-grade NAT / documentation / benchmarking ranges often used in SSRF.
	if ip4 := ip.To4(); ip4 != nil {
		// 169.254.0.0/16 already covered by link-local; 100.64.0.0/10 CGNAT
		if ip4[0] == 100 && ip4[1] >= 64 && ip4[1] <= 127 {
			return true
		}
	}
	return false
}
