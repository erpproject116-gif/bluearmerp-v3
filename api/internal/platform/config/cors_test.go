package config

import "testing"

func TestCORSOrigins(t *testing.T) {
	tests := []struct {
		name string
		raw  string
		want []string
	}{
		{"empty defaults localhost", "", []string{"http://localhost:5173"}},
		{"single", "https://bluearmerp-v3.vercel.app", []string{"https://bluearmerp-v3.vercel.app"}},
		{"trailing slash stripped", "https://bluearmerp-v3.vercel.app/", []string{"https://bluearmerp-v3.vercel.app"}},
		{"comma separated", "https://a.vercel.app, http://localhost:5173", []string{"https://a.vercel.app", "http://localhost:5173"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := (Config{CORSOrigin: tt.raw}).CORSOrigins()
			if len(got) != len(tt.want) {
				t.Fatalf("got %v want %v", got, tt.want)
			}
			for i := range got {
				if got[i] != tt.want[i] {
					t.Fatalf("got %v want %v", got, tt.want)
				}
			}
		})
	}
}

func TestCORSAllowOrigin_vercelPreview(t *testing.T) {
	cfg := Config{CORSOrigin: "https://bluearmerp-v3.vercel.app"}
	if !cfg.corsAllowOrigin("https://bluearmerp-v3.vercel.app") {
		t.Fatal("expected production origin")
	}
	if !cfg.corsAllowOrigin("https://bluearmerp-v3-git-main-user.vercel.app") {
		t.Fatal("expected vercel preview origin")
	}
	if cfg.corsAllowOrigin("https://evil.vercel.app.evil.com") {
		t.Fatal("expected reject lookalike domain")
	}
}
