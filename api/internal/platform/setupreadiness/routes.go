package setupreadiness

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	svc := &service{pool: pool}
	r.Get("/platform/setup-readiness", svc.getReadiness)
	r.Post("/platform/setup-readiness/ack-coa", svc.ackCOA)
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
	payload, err := Load(r.Context(), s.pool, tu.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}

func (s *service) ackCOA(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	if err := AckChartOfAccounts(r.Context(), s.pool, tu.TenantID); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to save acknowledgment.", "ERR_INTERNAL")
		return
	}
	payload, err := Load(r.Context(), s.pool, tu.TenantID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load setup readiness.", "ERR_INTERNAL")
		return
	}
	response.OK(w, payload, "OK")
}
