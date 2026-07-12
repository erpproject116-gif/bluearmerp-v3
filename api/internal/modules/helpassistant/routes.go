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
		hr.Post("/compose", postCompose())
		hr.With(auth.RequirePermission("user_management.users", auth.AccessRead)).Get("/feedback", listFeedback(pool))
		hr.With(auth.RequirePermission("user_management.users", auth.AccessRead)).Get("/feedback/summary", summarizeFeedback(pool))
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
