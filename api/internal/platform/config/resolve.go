package config

import (
	"fmt"
	"net/url"
	"strings"
)

const localSupabaseDBURL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres"

// resolveDatabaseURL builds a Postgres DSN from Supabase settings when DATABASE_URL is unset.
//
// The service role key cannot be used here — it is for Supabase HTTP APIs, not pgx.
// Use SUPABASE_DB_PASSWORD from Dashboard → Settings → Database.
func resolveDatabaseURL(supabaseURL, dbPassword string) string {
	if isLocalSupabaseURL(supabaseURL) {
		return localSupabaseDBURL
	}

	ref := projectRefFromURL(supabaseURL)
	if ref == "" || dbPassword == "" {
		return ""
	}

	user := url.UserPassword("postgres", dbPassword)
	return fmt.Sprintf("postgresql://%s@db.%s.supabase.co:5432/postgres", user.String(), ref)
}

func isLocalSupabaseURL(raw string) bool {
	if raw == "" {
		return true
	}
	lower := strings.ToLower(raw)
	return strings.Contains(lower, "127.0.0.1") ||
		strings.Contains(lower, "localhost") ||
		strings.Contains(lower, "host.docker.internal")
}

func projectRefFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := u.Hostname()
	if host == "" {
		return ""
	}
	// https://abcdefgh.supabase.co → abcdefgh
	if strings.HasSuffix(host, ".supabase.co") {
		return strings.TrimSuffix(host, ".supabase.co")
	}
	return ""
}
