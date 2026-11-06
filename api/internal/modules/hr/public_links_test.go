package hr

import "testing"

func TestNormalizePublicCareersSlug(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{"", "", false},
		{"  ", "", false},
		{"JF-Hardware", "jf-hardware", false},
		{"jf_hardware", "jf-hardware", false},
		{"--jf-hardware--", "jf-hardware", false},
		{"a", "", true},
		{"Bad Name", "", true},
		{"apply", "", true},
		{"careers", "", true},
	}
	for _, tt := range tests {
		got, err := normalizePublicCareersSlug(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("%q: expected error", tt.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("%q: unexpected error %v", tt.in, err)
		}
		if got != tt.want {
			t.Fatalf("%q: got %q want %q", tt.in, got, tt.want)
		}
	}
}

func TestPublicPathSegment(t *testing.T) {
	if got := publicPathSegment("BLUEARM", "jf-hardware"); got != "jf-hardware" {
		t.Fatalf("prefer slug: %q", got)
	}
	if got := publicPathSegment("BLUEARM", ""); got != "BLUEARM" {
		t.Fatalf("fallback code: %q", got)
	}
}
