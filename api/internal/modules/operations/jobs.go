package operations

import (
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type syncCRMTasksResult struct {
	TasksSynced int `json:"tasks_synced"`
}

// RegisterJobRoutes mounts Operations Hub background jobs (no auth middleware).
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/operations/jobs/sync-crm-tasks", syncCRMTasksJob(pool))
}

func syncCRMTasksJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("OPERATIONS_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(os.Getenv("CRM_JOB_SECRET"))
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Operations job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		hdr := strings.TrimSpace(r.Header.Get("X-Operations-Job-Secret"))
		if hdr == "" {
			hdr = strings.TrimSpace(r.Header.Get("X-CRM-Job-Secret"))
		}
		if hdr != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		synced, err := SyncAllCRMFollowUpTasks(r.Context(), pool)
		if err != nil {
			log.Printf("operations sync-crm-tasks: %v", err)
			response.Err(w, http.StatusInternalServerError, "CRM task sync failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, syncCRMTasksResult{TasksSynced: synced}, "CRM tasks synced.")
	}
}
