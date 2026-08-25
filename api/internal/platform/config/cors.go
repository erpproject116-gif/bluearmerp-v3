package config

import (
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/cors"
)

var corsAllowedHeaders = []string{
	"Accept",
	"Authorization",
	"Content-Type",
	"X-Tenant-ID",
	"X-Branch-ID",
	"X-User-Activity",
}

// CORSOrigins splits CORS_ORIGIN on commas and normalizes (trim space, strip trailing slash).
func (c Config) CORSOrigins() []string {
	raw := strings.TrimSpace(c.CORSOrigin)
	if raw == "" {
		return []string{"http://localhost:5173"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = normalizeOrigin(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:5173"}
	}
	return out
}

func normalizeOrigin(origin string) string {
	return strings.TrimRight(strings.TrimSpace(origin), "/")
}

func parseEnvBool(v string, def bool) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return def
	}
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return def
	}
}

// corsAllowVercelPreviews permits any https://*.vercel.app origin when enabled or when a
// production Vercel URL is already listed in CORS_ORIGIN.
func (c Config) corsAllowVercelPreviews() bool {
	if parseEnvBool(os.Getenv("CORS_ALLOW_VERCEL_PREVIEWS"), false) {
		return true
	}
	for _, o := range c.CORSOrigins() {
		if strings.Contains(o, ".vercel.app") {
			return true
		}
	}
	return false
}

func (c Config) corsAllowOrigin(origin string) bool {
	origin = normalizeOrigin(origin)
	if origin == "" {
		return false
	}
	for _, allowed := range c.CORSOrigins() {
		if origin == allowed {
			return true
		}
	}
	if c.corsAllowVercelPreviews() && strings.HasPrefix(origin, "https://") && strings.HasSuffix(origin, ".vercel.app") {
		return true
	}
	return false
}

// CORSOptions returns chi CORS middleware settings for the API router.
func (c Config) CORSOptions() cors.Options {
	return cors.Options{
		AllowOriginFunc: func(_ *http.Request, origin string) bool {
			return c.corsAllowOrigin(origin)
		},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"},
		AllowedHeaders:   corsAllowedHeaders,
		AllowCredentials: true,
		MaxAge:           300,
	}
}
