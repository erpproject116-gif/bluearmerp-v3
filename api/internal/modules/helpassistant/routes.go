package helpassistant

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/help", func(hr chi.Router) {
		hr.Get("/ai-config", getAIConfig())
		hr.Post("/feedback", postFeedback(pool))
		hr.Post("/compose", postCompose())
	})
}

func getAIConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := ConfigFromEnv()
		writeOK(w, map[string]any{
			"enabled":  c.Available(),
			"provider": "dashscope",
			"model":    c.Model,
		}, "OK")
	}
}
