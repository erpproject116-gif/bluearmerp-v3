package config

import (
	"fmt"
	"os"
	"strings"
)

// DatabaseConfigError explains missing database env vars.
func DatabaseConfigError() string {
	if u := strings.TrimSpace(os.Getenv("DATABASE_URL")); u != "" {
		return "database not configured: DATABASE_URL is set but empty or invalid"
	}

	var missing []string
	if strings.TrimSpace(os.Getenv("SUPABASE_URL")) == "" {
		missing = append(missing, "SUPABASE_URL")
	}
	if strings.TrimSpace(os.Getenv("SUPABASE_DB_PASSWORD")) == "" {
		missing = append(missing, "SUPABASE_DB_PASSWORD")
	}

	if len(missing) == 0 {
		ref := projectRefFromURL(os.Getenv("SUPABASE_URL"))
		if ref == "" {
			return "database not configured: SUPABASE_URL must look like https://YOUR_REF.supabase.co"
		}
		return "database not configured: set SUPABASE_DB_PASSWORD or DATABASE_URL"
	}

	return fmt.Sprintf(
		"database not configured: missing %s — set them on the API host (or set DATABASE_URL). See .env.example",
		strings.Join(missing, ", "),
	)
}
