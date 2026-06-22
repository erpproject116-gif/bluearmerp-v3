package config

import (
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port                  string
	SupabaseURL           string
	SupabaseAnonKey       string
	SupabaseServiceRole   string
	DatabaseURL           string
	SupabaseJWTSecret     string
	CORSOrigin            string
	DemoEmail             string
	DemoPassword          string
}

func Load() Config {
	loadEnvFiles()

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	cors := os.Getenv("CORS_ORIGIN")
	if cors == "" {
		cors = "http://localhost:5173"
	}

	supabaseURL := os.Getenv("SUPABASE_URL")
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = resolveDatabaseURL(supabaseURL, os.Getenv("SUPABASE_DB_PASSWORD"))
	}

	return Config{
		Port:                port,
		SupabaseURL:         supabaseURL,
		SupabaseAnonKey:     os.Getenv("SUPABASE_ANON_KEY"),
		SupabaseServiceRole: os.Getenv("SUPABASE_SERVICE_ROLE_KEY"),
		DatabaseURL:         dbURL,
		SupabaseJWTSecret:   os.Getenv("SUPABASE_JWT_SECRET"),
		CORSOrigin:          cors,
		DemoEmail:           envOr("DEMO_USER_EMAIL", "demo@demo.bluearm.local"),
		DemoPassword:        os.Getenv("DEMO_USER_PASSWORD"),
	}
}

// CORSOrigins splits CORS_ORIGIN on commas (e.g. production + local dev).
func (c Config) CORSOrigins() []string {
	raw := strings.TrimSpace(c.CORSOrigin)
	if raw == "" {
		return []string{"http://localhost:5173"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	if len(out) == 0 {
		return []string{"http://localhost:5173"}
	}
	return out
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ParseIntDefault(s string, def int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	return n
}
