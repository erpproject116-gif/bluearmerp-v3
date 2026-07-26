package quotation

// Golden tests over real captured document payloads (testdata/rfq_corpus/payloads).
//
// Payloads are the exact {pages, tables} JSON the browser posts to /rfq-import/*,
// captured with web/scripts/capture-rfq-payload.mjs or the in-app
// "Export parse payload" button. Ground truth lives in payloads/expected.json.
//
// Cases marked held_out are regression sentinels: they run in CI like every
// other case, but parser/regex changes must not be tuned against their contents.

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type rfqPayloadFixture struct {
	Files  []string             `json:"files"`
	Pages  []RfqPageInput       `json:"pages"`
	Tables []RfqStructuredTable `json:"tables"`
}

type rfqExpectedLine struct {
	ItemName string `json:"item_name"`
	Qty      string `json:"qty"`
	Unit     string `json:"unit"`
}

type rfqExpectedCase struct {
	HeldOut      bool              `json:"held_out"`
	DocumentType string            `json:"document_type"`
	LineCount    *int              `json:"line_count"`
	Lines        []rfqExpectedLine `json:"lines"`
	Note         string            `json:"note"`
}

type rfqExpectedFile struct {
	Cases map[string]rfqExpectedCase `json:"cases"`
}

func loadRfqPayloadCorpus(t *testing.T) (map[string]rfqPayloadFixture, map[string]rfqExpectedCase) {
	t.Helper()
	dir := filepath.Join("testdata", "rfq_corpus", "payloads")

	raw, err := os.ReadFile(filepath.Join(dir, "expected.json"))
	if err != nil {
		t.Fatalf("read expected.json: %v", err)
	}
	var expected rfqExpectedFile
	if err := json.Unmarshal(raw, &expected); err != nil {
		t.Fatalf("parse expected.json: %v", err)
	}

	matches, err := filepath.Glob(filepath.Join(dir, "*.rfq-payload.json"))
	if err != nil {
		t.Fatal(err)
	}
	fixtures := map[string]rfqPayloadFixture{}
	for _, m := range matches {
		name := strings.TrimSuffix(filepath.Base(m), ".rfq-payload.json")
		data, err := os.ReadFile(m)
		if err != nil {
			t.Fatalf("read %s: %v", m, err)
		}
		var fx rfqPayloadFixture
		if err := json.Unmarshal(data, &fx); err != nil {
			t.Fatalf("parse %s: %v", m, err)
		}
		fixtures[name] = fx
	}

	if len(fixtures) == 0 {
		t.Fatal("no payload fixtures found — capture payloads with web/scripts/capture-rfq-payload.mjs")
	}
	for name := range expected.Cases {
		if _, ok := fixtures[name]; !ok {
			t.Fatalf("expected.json case %q has no matching payload fixture", name)
		}
	}
	for name := range fixtures {
		if _, ok := expected.Cases[name]; !ok {
			t.Fatalf("payload fixture %q has no expected.json entry", name)
		}
	}
	return fixtures, expected.Cases
}

func TestRfqPayloadCorpus(t *testing.T) {
	fixtures, cases := loadRfqPayloadCorpus(t)
	for name, exp := range cases {
		t.Run(name, func(t *testing.T) {
			fx := fixtures[name]
			result, docType := ParseRfqDeterministic(fx.Pages, fx.Tables, RfqParseOptions{})

			if string(docType) != exp.DocumentType {
				t.Errorf("document_type = %q, want %q", docType, exp.DocumentType)
			}
			wantCount := len(exp.Lines)
			if exp.LineCount != nil {
				wantCount = *exp.LineCount
			}
			if len(result.Lines) != wantCount {
				for _, ln := range result.Lines {
					t.Logf("got line: name=%q qty=%q unit=%q", ln.ItemName, ln.Qty, ln.Unit)
				}
				t.Fatalf("line count = %d, want %d", len(result.Lines), wantCount)
			}
			for i, want := range exp.Lines {
				got := result.Lines[i]
				if !strings.EqualFold(strings.TrimSpace(got.ItemName), want.ItemName) {
					t.Errorf("line %d item_name = %q, want %q", i+1, got.ItemName, want.ItemName)
				}
				if got.Qty != want.Qty {
					t.Errorf("line %d (%s) qty = %q, want %q", i+1, want.ItemName, got.Qty, want.Qty)
				}
				if got.Unit != want.Unit {
					t.Errorf("line %d (%s) unit = %q, want %q", i+1, want.ItemName, got.Unit, want.Unit)
				}
			}
		})
	}
}

// TestRfqPayloadScorecard aggregates accuracy across the payload corpus so
// regressions surface as a score drop, not just a single boolean failure.
func TestRfqPayloadScorecard(t *testing.T) {
	fixtures, cases := loadRfqPayloadCorpus(t)

	var typeHits, typeTotal, countHits, countTotal int
	var fieldHits, fieldTotal int

	for name, exp := range cases {
		fx := fixtures[name]
		result, docType := ParseRfqDeterministic(fx.Pages, fx.Tables, RfqParseOptions{})

		typeTotal++
		if string(docType) == exp.DocumentType {
			typeHits++
		}
		wantCount := len(exp.Lines)
		if exp.LineCount != nil {
			wantCount = *exp.LineCount
		}
		countTotal++
		if len(result.Lines) == wantCount {
			countHits++
		}
		for i, want := range exp.Lines {
			fieldTotal += 3
			if i >= len(result.Lines) {
				continue
			}
			got := result.Lines[i]
			if strings.EqualFold(strings.TrimSpace(got.ItemName), want.ItemName) {
				fieldHits++
			}
			if got.Qty == want.Qty {
				fieldHits++
			}
			if got.Unit == want.Unit {
				fieldHits++
			}
		}
	}

	pct := func(hits, total int) float64 {
		if total == 0 {
			return 1
		}
		return float64(hits) / float64(total)
	}
	summary := fmt.Sprintf(
		"RFQ payload scorecard: type %d/%d (%.0f%%) · line-count %d/%d (%.0f%%) · fields %d/%d (%.0f%%)",
		typeHits, typeTotal, pct(typeHits, typeTotal)*100,
		countHits, countTotal, pct(countHits, countTotal)*100,
		fieldHits, fieldTotal, pct(fieldHits, fieldTotal)*100,
	)
	t.Log(summary)

	// Regression floor: the corpus is fully green today; any drop is a regression.
	if typeHits < typeTotal || countHits < countTotal || fieldHits < fieldTotal {
		t.Errorf("scorecard below 100%% — %s", summary)
	}
}
