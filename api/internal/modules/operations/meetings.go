package operations

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type allHandsMeetingBody struct {
	WorkspaceID int64  `json:"workspace_id"`
	ColumnID    int64  `json:"column_id"`
	Title       string `json:"title"`
	Date        string `json:"date"`
	StartTime   string `json:"start_time"`
	EndTime     string `json:"end_time"`
	Place       string `json:"place"`
	Note        string `json:"note"`
}

func createAllHandsMeeting(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.IsTenantOwner {
			response.Err(w, http.StatusForbidden, "Only the tenant owner can schedule an all-hands meeting.", "ERR_FORBIDDEN")
			return
		}

		var body allHandsMeetingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		place := strings.TrimSpace(body.Place)
		note := strings.TrimSpace(body.Note)
		meetingDate, dateErr := time.Parse("2006-01-02", strings.TrimSpace(body.Date))
		start, startErr := time.Parse("15:04", strings.TrimSpace(body.StartTime))
		end, endErr := time.Parse("15:04", strings.TrimSpace(body.EndTime))
		errs := map[string]string{}
		if body.WorkspaceID <= 0 {
			errs["workspace_id"] = "Workspace is required."
		}
		if body.ColumnID <= 0 {
			errs["column_id"] = "Column is required."
		}
		if title == "" {
			errs["title"] = "Title is required."
		}
		if dateErr != nil {
			errs["date"] = "Valid date is required."
		}
		if startErr != nil {
			errs["start_time"] = "Valid start time is required."
		}
		if endErr != nil {
			errs["end_time"] = "Valid end time is required."
		} else if startErr == nil && !end.After(start) {
			errs["end_time"] = "End time must be after start time."
		}
		if place == "" {
			errs["place"] = "Place or video link is required."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var valid bool
		err = tx.QueryRow(r.Context(), `
			select exists (
			  select 1
			  from public.wm_workspaces w
			  join public.wm_columns c on c.workspace_id = w.id
			  where w.id = $1 and c.id = $2 and w.tenant_id = $3
			)`, body.WorkspaceID, body.ColumnID, tu.TenantID).Scan(&valid)
		if err != nil || !valid {
			response.Validation(w, map[string]string{"workspace_id": "Workspace or column not found."})
			return
		}

		startValue := start.Format("15:04:05")
		endValue := end.Format("15:04:05")
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.wm_work_items (
			  tenant_id, workspace_id, column_id, title, description, status, priority,
			  start_date, end_date, start_time, end_time, all_day,
			  item_kind, all_hands, meeting_place
			) values ($1,$2,$3,$4,$5,'open','normal',$6,$6,$7,$8,false,'meeting',true,$9)
			returning id`,
			tu.TenantID, body.WorkspaceID, body.ColumnID, title, nullIfBlank(note),
			meetingDate, startValue, endValue, place,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create meeting.", "ERR_INTERNAL")
			return
		}

		announcement := allHandsMeetingAnnouncement(title, body.Date, body.StartTime, body.EndTime, place, note)
		var channelID int64
		err = tx.QueryRow(r.Context(), `
			select id from public.chat_channels
			where tenant_id = $1 and type = 'channel' and lower(name) = 'general' and archived_at is null
			order by id limit 1`, tu.TenantID).Scan(&channelID)
		if err == pgx.ErrNoRows {
			err = tx.QueryRow(r.Context(), `
				insert into public.chat_channels
				  (tenant_id, type, name, topic, is_private, created_by_user_id)
				values ($1, 'channel', 'general', 'Company-wide announcements and discussion', false, $2)
				returning id`, tu.TenantID, tu.AppUserID).Scan(&channelID)
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to prepare #general.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			insert into public.chat_channel_members (channel_id, user_id, role)
			select $1, u.id, case when u.id = $3 then 'admin' else 'member' end
			from public.users u
			where u.tenant_id = $2 and u.status = 'active'
			on conflict (channel_id, user_id) do nothing`, channelID, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add members to #general.", "ERR_INTERNAL")
			return
		}

		var messageID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind)
			values ($1, $2, null, $3, 'system')
			returning id`, tu.TenantID, channelID, announcement).Scan(&messageID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to announce meeting.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			insert into public.crm_notifications
			  (tenant_id, user_id, rule_id, severity, title, body, entity_type, entity_id, dedupe_key, actor_user_id, source)
			select $1, u.id, null, 'info', $2, $3, 'meeting', $4,
			       'meeting:' || $4::text || ':u' || u.id::text, null, 'system'
			from public.users u
			where u.tenant_id = $1 and u.status = 'active'
			on conflict (tenant_id, dedupe_key) do nothing`,
			tu.TenantID, "All-hands meeting: "+title, announcement, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to notify members.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create meeting.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.meeting.create", "wm_work_item", &id, nil, map[string]any{
			"workspace_id": body.WorkspaceID, "title": title, "date": body.Date, "message_id": messageID,
		})
		response.OK(w, row, "Meeting scheduled and announced.")
	}
}

func allHandsMeetingAnnouncement(title, date, start, end, place, note string) string {
	text := fmt.Sprintf("📅 All-hands meeting: %s\n%s, %s–%s\n%s", title, date, start, end, place)
	if strings.TrimSpace(note) != "" {
		text += "\n" + strings.TrimSpace(note)
	}
	return text
}
