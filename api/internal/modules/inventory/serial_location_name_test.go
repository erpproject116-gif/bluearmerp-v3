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
	src := string(raw)

	mustContain := []string{
		"loc.location_name",
		"fl.location_name",
		"tl.location_name",
	}
	for _, s := range mustContain {
		if !strings.Contains(src, s) {
			t.Errorf("serial.go must contain %q", s)
		}
	}

	// Forbidden: location alias .name (categories use cat.name — leave those alone).
	badPatterns := []*regexp.Regexp{
		regexp.MustCompile(`\bloc\.name\b`),
		regexp.MustCompile(`\bfl\.name\b`),
		regexp.MustCompile(`\btl\.name\b`),
	}
	for _, re := range badPatterns {
		if re.MatchString(src) {
			t.Errorf("serial.go must not contain %s (use location_name)", re.String())
		}
	}
}
