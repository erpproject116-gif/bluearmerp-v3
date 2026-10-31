package workflows

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/operations"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts Path B inbound workflow actions (named recipes only).
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/platform/workflows", func(wr chi.Router) {
		wr.Use(auth.RequirePermission("platform.workflows", auth.AccessWrite))
		wr.Post("/actions/crm.create_follow_up", createFollowUpAction(pool))
	})
}

type createFollowUpBody struct {
	Title     string  `json:"title"`
	DueDate   string  `json:"due_date"`
	Notes     *string `json:"notes"`
	PartnerID *int64  `json:"partner_id"`
	PicUserID *int64  `json:"pic_user_id"`
	PicName   string  `json:"pic_name"`
}

func createFollowUpAction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		key := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		if key == "" {
			response.Validation(w, map[string]string{"Idempotency-Key": "Required."})
			return
		}
		if len(key) > 200 {
			response.Validation(w, map[string]string{"Idempotency-Key": "Max 200 characters."})
			return
		}

		var cached []byte
		err := pool.QueryRow(r.Context(), `
			select result_json from public.workflow_action_idempotency
			where tenant_id = $1 and idempotency_key = $2`,
			tu.TenantID, key).Scan(&cached)
		if err == nil && len(cached) > 0 {
			var replay any
			_ = json.Unmarshal(cached, &replay)
			w.Header().Set("X-Idempotent-Replay", "true")
			response.OK(w, replay, "OK (idempotent replay).")
			return
		}
		if err != nil && err != pgx.ErrNoRows {
			response.Err(w, http.StatusInternalServerError, "Idempotency lookup failed.", "ERR_INTERNAL")
			return
		}

		var body createFollowUpBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		due := strings.TrimSpace(body.DueDate)
		if due == "" {
			due = time.Now().UTC().Format("2006-01-02")
		}
		if _, err := time.Parse("2006-01-02", due); err != nil {
			response.Validation(w, map[string]string{"due_date": "Use YYYY-MM-DD."})
			return
		}
		picName := strings.TrimSpace(body.PicName)
		if picName == "" {
			picName = "Workflows"
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.crm_follow_up_tasks (
			  tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
			  title, notes, created_by_user_id
			) values ($1,'manual','scheduled',$2::date,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, due, body.PartnerID, body.PicUserID, picName,
			title, body.Notes, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create follow-up.", "ERR_INTERNAL")
			return
		}

		result := map[string]any{
			"id":         id,
			"title":      title,
			"due_date":   due,
			"action":     "crm.create_follow_up",
			"recipe_hint": "R2",
		}
		raw, _ := json.Marshal(result)
		_, _ = pool.Exec(r.Context(), `
			insert into public.workflow_action_idempotency (tenant_id, idempotency_key, action_code, result_json)
			values ($1,$2,'crm.create_follow_up',$3::jsonb)
			on conflict (tenant_id, idempotency_key) do nothing`,
			tu.TenantID, key, string(raw))

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "workflows.action.crm.create_follow_up", "crm_follow_up_task", &id, nil, body)
		_ = operations.MirrorCRMFollowUpTask(r.Context(), pool, tu.TenantID, id)
		operations.EmitERPEvent(r.Context(), pool, tu.TenantID, "crm.follow_up.created", map[string]any{
			"follow_up_task_id": id,
			"stage":             "scheduled",
			"status":            "scheduled",
			"actor_user_id":     tu.AppUserID,
			"source":            "platform.workflows",
		})

		response.OK(w, result, "Created.")
	}
}
