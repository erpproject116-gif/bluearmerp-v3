package approval

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/approvals/pending", listPendingApprovals(pool))
	r.Post("/approvals/{entityType}/{entityId}/submit", submitApproval(pool))
	r.Post("/approvals/{entityType}/{entityId}/approve", approveEntity(pool))
	r.Post("/approvals/{entityType}/{entityId}/reject", rejectEntity(pool))
}

func listPendingApprovals(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		items, err := ListPending(r.Context(), pool, tu.TenantID, 100)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load approvals.", "ERR_INTERNAL")
			return
		}
		if items == nil {
			items = []Request{}
		}
		response.OK(w, items, "OK")
	}
}

type remarksBody struct {
	Remarks *string `json:"remarks"`
}

func submitApproval(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType := chi.URLParam(r, "entityType")
		entityID, err := strconv.ParseInt(chi.URLParam(r, "entityId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"entityId": "Invalid id."})
			return
		}
		var body remarksBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := Submit(r.Context(), tx, tu, entityType, entityID, body.Remarks); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to submit.", "ERR_INTERNAL")
			return
		}
		_ = SyncEntityProgress(r.Context(), tx, tu.TenantID, entityType, entityID, "e_approval")
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"entity_type": entityType, "entity_id": entityID, "status": "e_approval"}, "Submitted.")
	}
}

func approveEntity(pool *pgxpool.Pool) http.HandlerFunc {
	return decideApproval(pool, true)
}

func rejectEntity(pool *pgxpool.Pool) http.HandlerFunc {
	return decideApproval(pool, false)
}

func decideApproval(pool *pgxpool.Pool, approve bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		entityType := chi.URLParam(r, "entityType")
		entityID, err := strconv.ParseInt(chi.URLParam(r, "entityId"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"entityId": "Invalid id."})
			return
		}
		var body remarksBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to decide.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := Decide(r.Context(), tx, tu, entityType, entityID, approve, body.Remarks); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		status := "confirmed"
		if !approve {
			status = "unconfirmed"
		}
		_ = SyncEntityProgress(r.Context(), tx, tu.TenantID, entityType, entityID, status)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"entity_type": entityType, "entity_id": entityID, "status": status}, "Updated.")
	}
}
