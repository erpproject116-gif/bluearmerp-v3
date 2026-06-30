package demodata

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed sql/*.sql
var embeddedSQL embed.FS

// PopulateScripts runs in order after an optional purge (inventory baseline first).
var PopulateScripts = []string{
	"seed-demo-inventory.sql",
	"seed-demo-quotations.sql",
	"seed-demo-purchase-requests.sql",
	"seed-demo-sales-orders.sql",
	"seed-demo-golden-scenarios.sql",
	"seed-demo-po-gr-open.sql",
	"seed-demo-sales.sql",
	"seed-demo-finance.sql",
	"seed-demo-finance-ap.sql",
	"seed-demo-crm.sql",
	"seed-demo-dashboard.sql",
}

const verifyScript = "verify-demo-full-chain.sql"
const purgeScript = "purge-demo-data.sql"

// DemoTenantCodes are the only tenants that may use populate/purge from the app.
var DemoTenantCodes = map[string]struct{}{
	"DEMO000": {},
	"BLUEARM": {},
}

func readSQL(name string) (string, error) {
	if b, err := embeddedSQL.ReadFile(filepath.Join("sql", name)); err == nil {
		return string(b), nil
	}
	dir, err := resolveScriptsDir()
	if err != nil {
		return "", fmt.Errorf("read %s: %w", name, err)
	}
	path := filepath.Join(dir, name)
	b, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s from %s: %w", name, path, err)
	}
	return string(b), nil
}

func resolveScriptsDir() (string, error) {
	if d := strings.TrimSpace(os.Getenv("BLUEARM_DEMO_SQL_DIR")); d != "" {
		if st, err := os.Stat(filepath.Join(d, purgeScript)); err == nil && !st.IsDir() {
			return d, nil
		}
		return "", fmt.Errorf("BLUEARM_DEMO_SQL_DIR=%q missing %s", d, purgeScript)
	}

	candidates := []string{
		"scripts",
		filepath.Join("..", "scripts"),
		filepath.Join("..", "..", "scripts"),
	}
	if exe, err := os.Executable(); err == nil {
		base := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(base, "scripts"),
			filepath.Join(base, "..", "scripts"),
		)
	}
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, "scripts"))
	}

	for _, c := range candidates {
		c = filepath.Clean(c)
		if st, err := os.Stat(filepath.Join(c, purgeScript)); err == nil && !st.IsDir() {
			return c, nil
		}
	}
	return "", fmt.Errorf("demo SQL scripts not found (set BLUEARM_DEMO_SQL_DIR or run from repo root)")
}

func listEmbeddedScripts() ([]string, error) {
	entries, err := fs.ReadDir(embeddedSQL, "sql")
	if err != nil {
		return nil, err
	}
	out := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			out = append(out, e.Name())
		}
	}
	return out, nil
}
