package crm

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Notification struct {
	ID         int64   `json:"id"`
	RuleID     *int64  `json:"rule_id,omitempty"`
	Severity   string  `json:"severity"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	EntityType *string `json:"entity_type,omitempty"`
	EntityID   *int64  `json:"entity_id,omitempty"`
	Source     string  `json:"source"`
	Href       string  `json:"href"`
	ReadAt     *string `json:"read_at,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

func registerNotificationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/notifications", listNotifications(pool))
	r.Patch("/notifications/{id}/read", markNotificationRead(pool))
	r.Post("/notifications/read-all", markAllNotificationsRead(pool))
}

func listNotifications(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{"created_at": "n.created_at"})
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "n.tenant_id = $1 and (n.user_id is null or n.user_id = $2) and (n.actor_user_id is null or n.actor_user_id <> $2)"
		args := []any{tu.TenantID, tu.AppUserID}
		n := 3
		if strings.TrimSpace(r.URL.Query().Get("unread_only")) == "true" {
			where += " and n.read_at is null"
		}
		src := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("source")))
		switch src {
		case "activity", "rule", "support", "system":
			where += fmt.Sprintf(" and n.source = $%d", n)
			args = append(args, src)
			n++
		}
		q := fmt.Sprintf(`select n.id, n.rule_id, n.severity, n.title, n.body,
		  n.entity_type, n.entity_id, coalesce(n.source, 'activity'), n.read_at, n.created_at, count(*) over()
		  from public.crm_notifications n
		  where %s
		  order by n.created_at %s limit $%d offset $%d`,
			where, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list notifications.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Notification
		var total int64
		for rows.Next() {
			var row Notification
			var readAt *time.Time
			var createdAt time.Time
			if err := rows.Scan(
				&row.ID, &row.RuleID, &row.Severity, &row.Title, &row.Body,
				&row.EntityType, &row.EntityID, &row.Source, &readAt, &createdAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read notifications.", "ERR_INTERNAL")
				return
			}
			row.ReadAt = datePtrToStr(readAt)
			row.CreatedAt = createdAt.Format(time.RFC3339)
			row.Href = NotificationHref(row.EntityType, row.EntityID)
			out = append(out, row)
		}
		if out == nil {
			out = []Notification{}
		}
		var unreadTotal int64
		_ = pool.QueryRow(r.Context(), `
			select count(*) from public.crm_notifications
			where tenant_id = $1 and read_at is null
			  and (user_id is null or user_id = $2)
			  and (actor_user_id is null or actor_user_id <> $2)`, tu.TenantID, tu.AppUserID).Scan(&unreadTotal)
		response.OKListWithMeta(w, out, p.Page, p.PageSize, total, &unreadTotal)
	}
}

func markNotificationRead(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.crm_notifications set read_at = now()
			where id = $1 and tenant_id = $2
			  and (user_id is null or user_id = $3)
			  and read_at is null`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Marked read.")
	}
}

func markAllNotificationsRead(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		tag, err := pool.Exec(r.Context(), `
			update public.crm_notifications set read_at = now()
			where tenant_id = $1 and read_at is null
			  and (user_id is null or user_id = $2)`, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark read.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]int64{"updated": tag.RowsAffected()}, "Marked read.")
	}
}
