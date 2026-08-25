package inventory

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"testing"
)

// Guard against regressing inv_locations column usage: the table has location_name, not name.
func TestSerialGoUsesLocationNameNotLocName(t *testing.T) {
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	srcPath := filepath.Join(filepath.Dir(thisFile), "serial.go")
	raw, err := os.ReadFile(srcPath)
	if err != nil {
		t.Fatalf("read serial.go: %v", err)
	}
	assertLocationNameSQL(t, "serial.go", string(raw), []string{
		"loc.location_name",
		"fl.location_name",
		"tl.location_name",
	})

	resolvePath := filepath.Join(filepath.Dir(thisFile), "resolve_serial.go")
	resolveRaw, err := os.ReadFile(resolvePath)
	if err != nil {
		t.Fatalf("read resolve_serial.go: %v", err)
	}
	assertLocationNameSQL(t, "resolve_serial.go", string(resolveRaw), []string{"loc.location_name"})
}

func assertLocationNameSQL(t *testing.T, name, src string, mustContain []string) {
	t.Helper()
	for _, s := range mustContain {
		if !strings.Contains(src, s) {
			t.Errorf("%s must contain %q", name, s)
		}
	}
	badPatterns := []*regexp.Regexp{
		regexp.MustCompile(`\bloc\.name\b`),
		regexp.MustCompile(`\bfl\.name\b`),
		regexp.MustCompile(`\btl\.name\b`),
	}
	for _, re := range badPatterns {
		if re.MatchString(src) {
			t.Errorf("%s must not contain %s (use location_name)", name, re.String())
		}
	}
}
