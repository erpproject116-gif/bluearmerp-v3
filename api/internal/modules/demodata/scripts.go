package demodata

import (
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

//go:embed sql
var embeddedSQL embed.FS

// baseConfigScript seeds per-tenant defaults (currency, tax types, code sequences)
// so a freshly provisioned demo tenant has the prerequisites the seeds rely on.
// It is safe (idempotent) on the legacy DEMO000/BLUEARM tenants too.
const baseConfigScript = "seed-demo-base-config.sql"

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
	// Per-industry transactional copy overlay (base = no-op; industry folders
	// re-theme printed narrative on seeded documents). Runs last so it can
	// re-word rows created by every earlier step.
	"seed-demo-copy.sql",
}

const verifyScript = "verify-demo-full-chain.sql"
const verifyReconciliationScript = "verify-demo-reconciliation.sql"
const purgeScript = "purge-demo-data.sql"

// DemoTenantCodes are the legacy built-in demo tenants. Eligibility is now driven
// by tenants.is_demo (see status.go); this set is kept only as a backward-compatible
// fallback and for documentation.
var DemoTenantCodes = map[string]struct{}{
	"DEMO000": {},
	"BLUEARM": {},
}

// industrySupportsVerify reports whether the golden/reconciliation verify chain
// applies to the given industry. The verify scripts assert manufacturing-specific
// golden records, so only the manufacturing (or legacy, unspecified) dataset runs them.
func industrySupportsVerify(industry string) bool {
	industry = strings.TrimSpace(industry)
	// These industries only override master data and reuse the same base
	// golden-scenario chain, so the golden/reconciliation asserts apply to them.
	switch industry {
	case "", "manufacturing", "retail", "pharmacy", "restaurant":
		return true
	default:
		return false
	}
}

// readSQL resolves a seed script, preferring an industry-specific override
// (sql/<industry>/<name>) and falling back to the shared base script (sql/<name>).
func readSQL(industry, name string) (string, error) {
	industry = strings.TrimSpace(industry)
	candidates := make([]string, 0, 2)
	if industry != "" {
		candidates = append(candidates, filepath.ToSlash(filepath.Join(industry, name)))
	}
	candidates = append(candidates, name)

	for _, rel := range candidates {
		if b, err := embeddedSQL.ReadFile("sql/" + rel); err == nil {
			return string(b), nil
		}
	}

	dir, err := resolveScriptsDir()
	if err != nil {
		return "", fmt.Errorf("read %s: %w", name, err)
	}
	for _, rel := range candidates {
		path := filepath.Join(dir, filepath.FromSlash(rel))
		if b, err := os.ReadFile(path); err == nil {
			return string(b), nil
		}
	}
	return "", fmt.Errorf("read %s from %s (industry %q): not found", name, dir, industry)
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
