package setupreadiness

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	svc := &service{pool: pool}
	r.Get("/platform/setup-readiness", svc.getReadiness)
	r.Post("/platform/setup-readiness/ack-coa", svc.ackCOA)
	r.Post("/platform/setup-readiness/ack-step", svc.ackFoundationStep)
	r.Post("/platform/setup-readiness/skip", svc.skipWizard)
	r.Post("/platform/setup-readiness/snooze", svc.snoozeReminder)
}

type service struct {
	pool *pgxpool.Pool
}

func (s *service) getReadiness(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	payload, err := LoadForUser(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}

func (s *service) skipWizard(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	if err := skipWizardForUser(r.Context(), s.pool, tu.AppUserID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save preference.", "ERR_INTERNAL")
		return
	}
	payload, err := LoadForUser(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "Setup wizard skipped.")
}

func (s *service) snoozeReminder(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	if err := snoozeReminderForUser(r.Context(), s.pool, tu.AppUserID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save preference.", "ERR_INTERNAL")
		return
	}
	payload, err := LoadForUser(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "Reminder snoozed.")
}

func (s *service) ackCOA(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	ready, err := financedefaults.HasMinimumCoreAccounts(r.Context(), s.pool, tu.TenantID, minCOAAccounts, minCOATypes)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to verify chart of accounts.", "ERR_INTERNAL")
		return
	}
	if !ready {
		response.Err(w, http.StatusBadRequest,
			"Add at least one active account each for asset, liability, income, and expense before continuing.",
			"ERR_SETUP_INCOMPLETE")
		return
	}
	if err := AckChartOfAccounts(r.Context(), s.pool, tu.TenantID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save acknowledgment.", "ERR_INTERNAL")
		return
	}
	payload, err := LoadForUser(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}

type ackFoundationStepBody struct {
	StepID string `json:"step_id"`
}

func (s *service) ackFoundationStep(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	var body ackFoundationStepBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.StepID == "" {
		response.Err(w, http.StatusBadRequest, "step_id is required.", "ERR_VALIDATION")
		return
	}
	if _, ok := foundationAckKeys[body.StepID]; !ok {
		response.Err(w, http.StatusBadRequest, "Unknown step_id.", "ERR_VALIDATION")
		return
	}
	if err := AckFoundationStep(r.Context(), s.pool, tu.TenantID, body.StepID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save acknowledgment.", "ERR_INTERNAL")
		return
	}
	payload, err := LoadForUser(r.Context(), s.pool, tu)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}
