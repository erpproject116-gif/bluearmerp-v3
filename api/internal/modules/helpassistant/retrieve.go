package helpassistant

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type retrieveBody struct {
	Query    string `json:"query"`
	Pathname string `json:"pathname"`
	Limit    int    `json:"limit"`
}

type retrieveHitOut struct {
	ArticleID   string   `json:"article_id"`
	Title       string   `json:"title"`
	Scenario    string   `json:"scenario,omitempty"`
	Snippet     string   `json:"snippet"`
	Steps       []string `json:"steps,omitempty"`
	Href        string   `json:"href,omitempty"`
	ActionHref  string   `json:"action_href,omitempty"`
	ActionLabel string   `json:"action_label,omitempty"`
	Score       float64  `json:"score"`
	Source      string   `json:"source"`
}

func retrieveHits(r *http.Request, pool *pgxpool.Pool, query, pathname string, limit int) []retrieveHitOut {
	if limit <= 0 {
		limit = 3
	}
	if limit > 8 {
		limit = 8
	}
	var overrides []RankingOverride
	if tu, ok := auth.FromContext(r.Context()); ok {
		overrides = loadRankingOverrides(r.Context(), pool, tu.TenantID)
	}
	hits := SearchHelp(query, pathname, limit, minScore, overrides)
	out := make([]retrieveHitOut, 0, len(hits))
	for _, h := range hits {
		out = append(out, retrieveHitOut{
			ArticleID:   h.Chunk.ArticleID,
			Title:       h.Chunk.Title,
			Scenario:    h.Chunk.Scenario,
			Snippet:     h.Snippet,
			Steps:       h.Chunk.Steps,
			Href:        h.Chunk.Href,
			ActionHref:  h.Chunk.ActionHref,
			ActionLabel: h.Chunk.ActionLabel,
			Score:       h.Score,
			Source:      h.Chunk.Source,
		})
	}
	return out
}

func postRetrieve(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body retrieveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		query := strings.TrimSpace(body.Query)
		if query == "" {
			response.Validation(w, map[string]string{"query": "Query is required."})
			return
		}
		out := retrieveHits(r, pool, query, strings.TrimSpace(body.Pathname), body.Limit)
		response.OK(w, map[string]any{
			"hits":         out,
			"corpus_count": CorpusChunkCount(),
		}, "OK")
	}
}

func getRetrieveQuery(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if q == "" {
			response.Validation(w, map[string]string{"q": "Query is required."})
			return
		}
		pathname := strings.TrimSpace(r.URL.Query().Get("pathname"))
		limit := 3
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
		out := retrieveHits(r, pool, q, pathname, limit)
		response.OK(w, map[string]any{"hits": out, "corpus_count": CorpusChunkCount()}, "OK")
	}
}
