package approval

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type amountPolicyBody struct {
	EntityType      string  `json:"entity_type"`
	ThresholdAmount float64 `json:"threshold_amount"`
	IsActive        *bool   `json:"is_active"`
}

func registerAmountPolicyRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("settings.process_policies", auth.AccessRead)).Get("/approval-amount-policies", listAmountPolicyHandler(pool))
	r.With(auth.RequirePermission("settings.process_policies", auth.AccessWrite)).Put("/approval-amount-policies/{entityType}", upsertAmountPolicyHandler(pool))
}

func RegisterAmountPolicyRoutes(r chi.Router, pool *pgxpool.Pool) {
	registerAmountPolicyRoutes(r, pool)
}

func listAmountPolicyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		items, err := ListAmountPolicies(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load amount policies.", "ERR_INTERNAL")
			return
		}
		response.OK(w, items, "OK")
	}
}

func upsertAmountPolicyHandler(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType := strings.TrimSpace(chi.URLParam(r, "entityType"))
		if entityType != "payment_voucher" && entityType != "expense" {
			response.Validation(w, map[string]string{"entity_type": "Must be payment_voucher or expense."})
			return
		}
		var body amountPolicyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.ThresholdAmount <= 0 {
			response.Validation(w, map[string]string{"threshold_amount": "Must be greater than zero."})
			return
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		if err := UpsertAmountPolicy(r.Context(), pool, tu.TenantID, entityType, body.ThresholdAmount, active); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save policy.", "ERR_INTERNAL")
			return
		}
		response.OK(w, AmountPolicy{EntityType: entityType, ThresholdAmount: body.ThresholdAmount, IsActive: active}, "Saved.")
	}
}
