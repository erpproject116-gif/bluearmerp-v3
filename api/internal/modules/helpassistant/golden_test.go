package helpassistant

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

type goldenQuery struct {
	Query           string `json:"query"`
	Path            string `json:"path"`
	ExpectArticleID string `json:"expectArticleId"`
}

// TestGoldenQueriesRetrieve mirrors web HELP_GOLDEN_QUERIES against the embedded corpus.
// Requires corpus/help_chunks.json (npm run export:help-corpus) and golden_queries.json.
func TestGoldenQueriesRetrieve(t *testing.T) {
	if CorpusChunkCount() == 0 {
		t.Skip("help corpus not embedded")
	}
	_, thisFile, _, _ := runtime.Caller(0)
	path := filepath.Join(filepath.Dir(thisFile), "corpus", "golden_queries.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read golden queries: %v", err)
	}
	var queries []goldenQuery
	if err := json.Unmarshal(raw, &queries); err != nil {
		t.Fatalf("parse golden: %v", err)
	}
	if len(queries) < 20 {
		t.Fatalf("expected many golden queries, got %d", len(queries))
	}

	pass := 0
	for _, g := range queries {
		hits := SearchHelp(g.Query, g.Path, 3, minScore, nil)
		ok := false
		for _, h := range hits {
			if h.Chunk.ArticleID == g.ExpectArticleID {
				ok = true
				break
			}
		}
		if ok {
			pass++
		} else {
			got := ""
			if len(hits) > 0 {
				got = hits[0].Chunk.ArticleID
			}
			t.Logf("MISS query=%q path=%q want=%s got=%s", g.Query, g.Path, g.ExpectArticleID, got)
		}
	}
	rate := float64(pass) / float64(len(queries))
	t.Logf("golden retrieve %d/%d (%.1f%%)", pass, len(queries), rate*100)
	if rate < 0.90 {
		t.Fatalf("golden retrieve rate %.1f%% below 90%% threshold", rate*100)
	}
}
