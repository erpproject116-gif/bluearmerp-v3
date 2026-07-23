package copilot

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
)

// RegisterRoutes mounts Copilot ask / tools / approve-to-act endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/copilot", func(cr chi.Router) {
		cr.Get("/config", getConfig())
		cr.Post("/ask", postAsk(pool))
		cr.Post("/tools/run", postRunTool(pool))
		cr.Post("/actions/approve", postApproveAction(pool))
		cr.Post("/actions/deny", postDenyAction(pool))
	})
}

func getConfig() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := helpassistant.ConfigFromEnv()
		writeOK(w, map[string]any{
			"enabled":      c.CopilotAvailable(),
			"provider":     "dashscope",
			"small_model":  c.SmallModel,
			"medium_model": c.MediumModel,
			"daily_cap":    c.DailyCap,
			"tools": []string{
				"get_financial_health",
				"list_overdue_ar",
				"find_stock",
				"crm_follow_ups",
				"draft_recurring_expense",
				"import_rfq_pdf",
			},
		}, "OK")
	}
}
