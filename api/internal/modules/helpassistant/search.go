package helpassistant

import (
	_ "embed"
	"encoding/json"
	"strings"
	"sync"
)

// HelpChunk mirrors web HelpChunk for server-side keyword retrieve.
type HelpChunk struct {
	ID           string   `json:"id"`
	Source       string   `json:"source"`
	ArticleID    string   `json:"articleId"`
	Title        string   `json:"title"`
	Scenario     string   `json:"scenario,omitempty"`
	Href         string   `json:"href"`
	ActionHref   string   `json:"actionHref,omitempty"`
	ActionLabel  string   `json:"actionLabel,omitempty"`
	ModuleTags   []string `json:"moduleTags"`
	Questions    []string `json:"questions,omitempty"`
	ErrorPhrases []string `json:"errorPhrases,omitempty"`
	Text         string   `json:"text"`
	Steps        []string `json:"steps,omitempty"`
}

type SearchHit struct {
	Chunk   HelpChunk `json:"chunk"`
	Score   float64   `json:"score"`
	Snippet string    `json:"snippet"`
}

const (
	minScore       = 1.15
	titleWeight    = 4.0
	scenarioWeight = 3.0
	questionWeight = 5.0
	errorWeight    = 8.0
	tagWeight      = 2.5
	textWeight     = 1.0
	routeBoost     = 2.0
	phraseBonus    = 3.0
	kbSourceBonus  = 1.25
)

func tagMatches(term string, tags []string) bool {
	for _, tag := range tags {
		if strings.Contains(tag, term) || strings.Contains(term, tag) {
			return true
		}
	}
	return false
}

func listBlob(items []string) string {
	return strings.ToLower(strings.Join(items, " \n "))
}

func errorPhraseHit(queryLower string, phrases []string) bool {
	for _, raw := range phrases {
		p := strings.ToLower(strings.TrimSpace(raw))
		if len(p) < 4 {
			continue
		}
		if strings.Contains(queryLower, p) || strings.Contains(p, queryLower) {
			return true
		}
	}
	return false
}

func questionHit(terms []string, phrase string, questions []string) float64 {
	best := 0.0
	for _, q := range questions {
		ql := strings.ToLower(q)
		local := 0.0
		if len(phrase) >= 4 && strings.Contains(ql, phrase) {
			local += questionWeight * 1.5
		}
		for _, term := range terms {
			if strings.Contains(ql, term) {
				local += questionWeight
			}
		}
		if local > best {
			best = local
		}
	}
	return best
}

func scoreChunk(chunk HelpChunk, terms []string, phrase, queryLower string, routeTags []string) float64 {
	if len(terms) == 0 {
		return 0
	}
	title := strings.ToLower(chunk.Title)
	scenario := strings.ToLower(chunk.Scenario)
	text := strings.ToLower(chunk.Text)
	questionsBlob := listBlob(chunk.Questions)

	score := 0.0
	for _, term := range terms {
		if strings.Contains(title, term) {
			score += titleWeight
		}
		if strings.Contains(scenario, term) {
			score += scenarioWeight
		}
		if strings.Contains(questionsBlob, term) {
			score += questionWeight * 0.35
		}
		if tagMatches(term, chunk.ModuleTags) {
			score += tagWeight
		}
		if strings.Contains(text, term) {
			score += textWeight
		}
	}
	score += questionHit(terms, phrase, chunk.Questions)
	if errorPhraseHit(queryLower, chunk.ErrorPhrases) {
		score += errorWeight * float64(max(len(terms), 1))
	}
	if len(phrase) >= 4 {
		if strings.Contains(title, phrase) || strings.Contains(scenario, phrase) ||
			strings.Contains(text, phrase) || strings.Contains(questionsBlob, phrase) {
			score += phraseBonus
		}
	}
	for _, tag := range routeTags {
		for _, mt := range chunk.ModuleTags {
			if mt == tag {
				score += routeBoost
			}
		}
	}
	if chunk.Source == "kb" {
		score += kbSourceBonus
	}
	return score / float64(len(terms))
}

func makeSnippet(chunk HelpChunk, terms []string, phrase string) string {
	raw := strings.TrimSpace(chunk.Text)
	if raw == "" {
		if len(chunk.Steps) > 0 {
			return chunk.Steps[0]
		}
		if chunk.Scenario != "" {
			return chunk.Scenario
		}
		return chunk.Title
	}
	lower := strings.ToLower(raw)
	idx := -1
	if len(phrase) >= 4 {
		idx = strings.Index(lower, phrase)
	}
	if idx < 0 {
		for _, term := range terms {
			idx = strings.Index(lower, term)
			if idx >= 0 {
				break
			}
		}
	}
	if idx < 0 {
		if len(raw) > 220 {
			return raw[:217] + "…"
		}
		return raw
	}
	start := max(0, idx-40)
	end := min(len(raw), idx+180)
	snippet := strings.TrimSpace(raw[start:end])
	if start > 0 {
		snippet = "…" + snippet
	}
	if end < len(raw) {
		snippet = snippet + "…"
	}
	return snippet
}

func compareHits(a, b SearchHit) int {
	if b.Score != a.Score {
		if b.Score > a.Score {
			return 1
		}
		return -1
	}
	if a.Chunk.Source != b.Chunk.Source {
		if a.Chunk.Source == "kb" {
			return -1
		}
		return 1
	}
	aSc, bSc := 0, 0
	if a.Chunk.Scenario != "" {
		aSc = 1
	}
	if b.Chunk.Scenario != "" {
		bSc = 1
	}
	return bSc - aSc
}

// SearchHelp scores embedded corpus chunks (same rules as web helpSearch.ts).
func SearchHelp(query, pathname string, limit int, minScoreThreshold float64, overrides []RankingOverride) []SearchHit {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return nil
	}
	if limit <= 0 {
		limit = 3
	}
	if minScoreThreshold <= 0 {
		minScoreThreshold = minScore
	}
	terms := expandQueryTerms(trimmed)
	phrase := strings.Join(tokenize(trimmed), " ")
	queryLower := strings.ToLower(trimmed)
	routeTags := routeTagsFromPath(pathname)

	byArticle := map[string]SearchHit{}
	for _, chunk := range getHelpChunks() {
		score := scoreChunk(chunk, terms, phrase, queryLower, routeTags)
		score = applyRankingBoost(score, chunk.ArticleID, terms, overrides)
		if score < minScoreThreshold {
			continue
		}
		hit := SearchHit{Chunk: chunk, Score: score, Snippet: makeSnippet(chunk, terms, phrase)}
		prev, ok := byArticle[chunk.ArticleID]
		if !ok || hit.Score > prev.Score {
			byArticle[chunk.ArticleID] = hit
		}
	}
	out := make([]SearchHit, 0, len(byArticle))
	for _, h := range byArticle {
		out = append(out, h)
	}
	// Sort
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if compareHits(out[i], out[j]) > 0 {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	if len(out) > limit {
		out = out[:limit]
	}
	return out
}

var (
	chunksOnce sync.Once
	chunks     []HelpChunk
	chunksErr  error
)

//go:embed corpus/help_chunks.json
var helpChunksJSON []byte

func getHelpChunks() []HelpChunk {
	chunksOnce.Do(func() {
		if len(helpChunksJSON) == 0 {
			chunks = nil
			return
		}
		chunksErr = json.Unmarshal(helpChunksJSON, &chunks)
		if chunksErr != nil {
			chunks = nil
		}
	})
	return chunks
}

func CorpusChunkCount() int {
	return len(getHelpChunks())
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
