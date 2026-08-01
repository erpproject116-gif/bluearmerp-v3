package helpassistant

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/help", func(hr chi.Router) {
		hr.Get("/ai-config", getAIConfig())
		hr.Post("/feedback", postFeedback(pool))
		hr.Post("/compose", postCompose(pool))
		hr.Post("/retrieve", postRetrieve(pool))
		hr.Get("/retrieve", getRetrieveQuery(pool))
		hr.With(auth.RequirePermission("user_management.users", auth.AccessRead)).Get("/feedback", listFeedback(pool))
		hr.With(auth.RequirePermission("user_management.users", auth.AccessRead)).Get("/feedback/summary", summarizeFeedback(pool))
	})
}

func getAIConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := ConfigFromEnv()
		base := c.BaseURL
		// Expose host only so operators can verify region without leaking the full secret URL path unnecessarily.
		writeOK(w, map[string]any{
			"enabled":      c.Available(),
			"copilot":      c.CopilotAvailable(),
			"baiko":        c.CopilotAvailable(),
			"provider":     "dashscope",
			"model":        c.Model,
			"small_model":  c.SmallModel,
			"medium_model": c.MediumModel,
			"daily_cap":    c.DailyCap,
			"corpus_count": CorpusChunkCount(),
			"base_url":     base,
			"has_api_key":  c.APIKey != "",
		}, "OK")
	}
}
