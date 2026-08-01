package copilot

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
)

// RegisterRoutes mounts Baiko ask / tools / approve-to-act endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/copilot", func(cr chi.Router) {
		cr.Get("/config", getConfig())
		cr.Get("/entities/search", getEntitySearch(pool))
		cr.Post("/entities/search", postEntitySearch(pool))
		cr.Post("/ask", postAsk(pool))
		cr.Post("/tools/run", postRunTool(pool))
		cr.Post("/actions/approve", postApproveAction(pool))
		cr.Post("/actions/deny", postDenyAction(pool))
		registerSessionRoutes(cr, pool)
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
				"lookup_entities",
				"smart_notifications",
				"recommend_items",
				"compare_pricing",
				"draft_recurring_expense",
				"import_rfq_pdf",
				"run_smart_rfq",
				"map_import_dataset",
				"propose_serial_lot_import",
				"draft_quotation_from_rfq",
				"draft_follow_up",
				"draft_generate_quotation",
				"draft_open_document",
				"draft_send_quotation_email",
				"draft_send_document_email",
			},
			"actions": []string{
				"quotation", "sales_order", "sales", "purchase_request", "rfq",
				"purchase_order", "purchases", "product_bundle", "bom", "bulk_inventory",
				"send_email", "crm_follow_up",
				"smart_rfq", "quotation_from_rfq",
			},
			"entity_types": []string{
				"item", "customer", "vendor", "serial", "sales", "quotation",
				"purchase_order", "sales_order", "load_slip",
			},
		}, "OK")
	}
}
