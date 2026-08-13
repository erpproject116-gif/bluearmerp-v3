package chat

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func unreadTotal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var total int64
		err := pool.QueryRow(r.Context(), `
			select coalesce(sum(u.cnt), 0)::bigint from (
			  select (
			    select count(*)::bigint from public.chat_messages msg
			    where msg.channel_id = c.id and msg.tenant_id = c.tenant_id and msg.deleted_at is null
			      and (m.last_read_message_id is null or msg.id > m.last_read_message_id)
			  ) as cnt
			  from public.chat_channels c
			  join public.chat_channel_members m on m.channel_id = c.id and m.user_id = $2
			  where c.tenant_id = $1 and c.archived_at is null
			) u`, tu.TenantID, tu.AppUserID).Scan(&total)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load unread total.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"unread_total": total}, "OK")
	}
}

func postTyping(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `delete from public.chat_typing where expires_at < now()`)
		_, err = pool.Exec(r.Context(), `
			insert into public.chat_typing (channel_id, user_id, expires_at)
			values ($1, $2, now() + interval '5 seconds')
			on conflict (channel_id, user_id) do update set expires_at = excluded.expires_at`,
			channelID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record typing.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "OK")
	}
}

func listTyping(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `delete from public.chat_typing where expires_at < now()`)
		rows, err := pool.Query(r.Context(), `
			select t.user_id, coalesce(nullif(trim(u.full_name), ''), coalesce(u.email, 'User'))
			from public.chat_typing t
			join public.users u on u.id = t.user_id
			where t.channel_id = $1 and t.expires_at > now() and t.user_id <> $2`,
			channelID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list typing.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []TypingUser{}
		for rows.Next() {
			var u TypingUser
			if rows.Scan(&u.UserID, &u.FullName) == nil {
				out = append(out, u)
			}
		}
		response.OK(w, out, "OK")
	}
}

var allowedReactionEmojis = map[string]bool{
	"👍": true, "❤️": true, "😂": true, "👀": true, "✅": true,
}

type reactionBody struct {
	Emoji string `json:"emoji"`
}

func addReaction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		messageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid message id."})
			return
		}
		var body reactionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"emoji": "Invalid JSON."})
			return
		}
		emoji := strings.TrimSpace(body.Emoji)
		if !allowedReactionEmojis[emoji] {
			response.Validation(w, map[string]string{"emoji": "Unsupported emoji."})
			return
		}
		channelID, err := messageChannel(r.Context(), pool, tu.TenantID, messageID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		_, err = pool.Exec(r.Context(), `
			insert into public.chat_message_reactions (message_id, user_id, emoji)
			values ($1, $2, $3) on conflict do nothing`, messageID, tu.AppUserID, emoji)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add reaction.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Reacted.")
	}
}

func removeReaction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		messageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid message id."})
			return
		}
		emoji := strings.TrimSpace(r.URL.Query().Get("emoji"))
		if emoji == "" {
			var body reactionBody
			_ = json.NewDecoder(r.Body).Decode(&body)
			emoji = strings.TrimSpace(body.Emoji)
		}
		if !allowedReactionEmojis[emoji] {
			response.Validation(w, map[string]string{"emoji": "Unsupported emoji."})
			return
		}
		channelID, err := messageChannel(r.Context(), pool, tu.TenantID, messageID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			delete from public.chat_message_reactions
			where message_id = $1 and user_id = $2 and emoji = $3`, messageID, tu.AppUserID, emoji)
		response.OK(w, map[string]any{"ok": true}, "Removed.")
	}
}

type forwardBody struct {
	ChannelID int64 `json:"channel_id"`
}

func forwardMessage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		messageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid message id."})
			return
		}
		var body forwardBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ChannelID <= 0 {
			response.Validation(w, map[string]string{"channel_id": "Target channel is required."})
			return
		}
		srcChannel, err := messageChannel(r.Context(), pool, tu.TenantID, messageID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, srcChannel, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, body.ChannelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Target channel not found.", "ERR_NOT_FOUND")
			return
		}

		var srcBody string
		var deleted *time.Time
		err = pool.QueryRow(r.Context(), `
			select body, deleted_at from public.chat_messages
			where id = $1 and tenant_id = $2`, messageID, tu.TenantID).Scan(&srcBody, &deleted)
		if err != nil || deleted != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		fwdBody := strings.TrimSpace(srcBody)
		if fwdBody == "" {
			fwdBody = "(forwarded message)"
		}
		var newID int64
		var created time.Time
		err = tx.QueryRow(r.Context(), `
			insert into public.chat_messages
			  (tenant_id, channel_id, sender_user_id, body, forwarded_from_message_id, sender_kind)
			values ($1, $2, $3, $4, $5, 'user')
			returning id, created_at`,
			tu.TenantID, body.ChannelID, tu.AppUserID, fwdBody, messageID,
		).Scan(&newID, &created)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to forward message.", "ERR_INTERNAL")
			return
		}

		_, _ = tx.Exec(r.Context(), `
			insert into public.chat_message_links (message_id, entity_type, entity_id, label)
			select $1, entity_type, entity_id, label from public.chat_message_links where message_id = $2`,
			newID, messageID)

		var attBytes int64
		_ = tx.QueryRow(r.Context(), `
			select coalesce(sum(size_bytes), 0) from public.chat_message_attachments where message_id = $1`,
			messageID).Scan(&attBytes)
		if attBytes > 0 && attBytes <= MaxAttachmentsBytes {
			_, err = tx.Exec(r.Context(), `
				insert into public.chat_message_attachments
				  (message_id, file_name, mime_type, size_bytes, content, uploaded_by_user_id)
				select $1, file_name, mime_type, size_bytes, content, $2
				from public.chat_message_attachments where message_id = $3`,
				newID, tu.AppUserID, messageID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to copy attachments.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit forward.", "ERR_INTERNAL")
			return
		}

		msg := Message{
			ID: newID, ChannelID: body.ChannelID, SenderUserID: &tu.AppUserID,
			Body: fwdBody, CreatedAt: created.Format(time.RFC3339),
			ForwardedFromMessageID: &messageID, SenderKind: "user",
		}
		_ = pool.QueryRow(r.Context(), `
			select coalesce(nullif(trim(full_name), ''), email) from public.users where id=$1`,
			tu.AppUserID).Scan(&msg.SenderName)
		tmp := []Message{msg}
		enrichMessages(r.Context(), pool, tmp, tu.AppUserID)
		response.OK(w, tmp[0], "Forwarded.")
	}
}

type reminderCreateBody struct {
	Title         string `json:"title"`
	Body          string `json:"body"`
	RemindAt      string `json:"remind_at"`
	ChannelID     *int64 `json:"channel_id"`
	NotifyChannel bool   `json:"notify_channel"`
	AlsoCRMTask   bool   `json:"also_crm_task"`
}

func createReminder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body reminderCreateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		remindAt, err := time.Parse(time.RFC3339, strings.TrimSpace(body.RemindAt))
		if err != nil {
			response.Validation(w, map[string]string{"remind_at": "Use ISO-8601 datetime (RFC3339)."})
			return
		}
		if body.ChannelID != nil && *body.ChannelID > 0 {
			if _, err := requireMembership(r.Context(), pool, tu.TenantID, *body.ChannelID, tu.AppUserID); err != nil {
				response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
				return
			}
		} else {
			body.ChannelID = nil
			body.NotifyChannel = false
		}

		var crmTaskID *int64
		if body.AlsoCRMTask {
			var tid int64
			dueDate := remindAt.Format("2006-01-02")
			err = pool.QueryRow(r.Context(), `
				insert into public.crm_follow_up_tasks (
				  tenant_id, task_type, stage, due_date, pic_user_id, pic_name,
				  title, notes, created_by_user_id
				) values ($1, 'manual', 'scheduled', $2::date, $3, '', $4, $5, $3)
				returning id`,
				tu.TenantID, dueDate, tu.AppUserID, title, strings.TrimSpace(body.Body),
			).Scan(&tid)
			if err == nil {
				crmTaskID = &tid
			}
			// Optional — reminder still saves if CRM insert is unavailable.
		}

		var id int64
		var created time.Time
		err = pool.QueryRow(r.Context(), `
			insert into public.chat_reminders
			  (tenant_id, channel_id, created_by_user_id, title, body, remind_at, status, crm_task_id, notify_channel)
			values ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)
			returning id, created_at`,
			tu.TenantID, body.ChannelID, tu.AppUserID, title, strings.TrimSpace(body.Body),
			remindAt, crmTaskID, body.NotifyChannel,
		).Scan(&id, &created)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create reminder.", "ERR_INTERNAL")
			return
		}

		if body.ChannelID != nil {
			sysBody := fmt.Sprintf("Reminder scheduled: %s — %s", title, remindAt.Format(time.RFC3339))
			_, _ = pool.Exec(r.Context(), `
				insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind)
				values ($1, $2, null, $3, 'system')`,
				tu.TenantID, *body.ChannelID, sysBody)
		}

		rem := Reminder{
			ID: id, ChannelID: body.ChannelID, CreatedByUserID: &tu.AppUserID,
			Title: title, Body: strings.TrimSpace(body.Body),
			RemindAt: remindAt.Format(time.RFC3339), Status: "scheduled",
			CRMTaskID: crmTaskID, NotifyChannel: body.NotifyChannel,
			CreatedAt: created.Format(time.RFC3339),
		}
		response.OK(w, rem, "Reminder scheduled.")
	}
}

func listReminders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select r.id, r.channel_id, r.created_by_user_id, r.title, r.body, r.remind_at, r.status,
			  r.crm_task_id, r.notify_channel, r.created_at
			from public.chat_reminders r
			where r.tenant_id = $1
			  and (
			    r.created_by_user_id = $2
			    or (
			      r.channel_id is not null
			      and exists (
			        select 1 from public.chat_channel_members m
			        where m.channel_id = r.channel_id and m.user_id = $2
			      )
			    )
			  )
			order by r.remind_at asc
			limit 100`, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list reminders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []Reminder{}
		for rows.Next() {
			var rem Reminder
			var remindAt, created time.Time
			if err := rows.Scan(
				&rem.ID, &rem.ChannelID, &rem.CreatedByUserID, &rem.Title, &rem.Body,
				&remindAt, &rem.Status, &rem.CRMTaskID, &rem.NotifyChannel, &created,
			); err != nil {
				continue
			}
			rem.RemindAt = remindAt.Format(time.RFC3339)
			rem.CreatedAt = created.Format(time.RFC3339)
			out = append(out, rem)
		}
		response.OK(w, out, "OK")
	}
}

func dueReminders(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, channel_id, title, body, remind_at, notify_channel, created_by_user_id
			from public.chat_reminders
			where tenant_id = $1 and status = 'scheduled' and remind_at <= now()
			  and created_by_user_id = $2
			order by remind_at asc
			limit 20`, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load due reminders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		fired := []Reminder{}
		for rows.Next() {
			var id int64
			var channelID, createdBy *int64
			var title, body string
			var remindAt time.Time
			var notify bool
			if rows.Scan(&id, &channelID, &title, &body, &remindAt, &notify, &createdBy) != nil {
				continue
			}
			tag, err := pool.Exec(r.Context(), `
				update public.chat_reminders set status = 'fired'
				where id = $1 and tenant_id = $2 and status = 'scheduled'`, id, tu.TenantID)
			if err != nil || tag.RowsAffected() == 0 {
				continue
			}
			snippet := body
			if snippet == "" {
				snippet = title
			}
			if len(snippet) > 160 {
				snippet = snippet[:160] + "…"
			}
			_, _ = pool.Exec(r.Context(), `
				insert into public.crm_notifications
				  (tenant_id, user_id, actor_user_id, severity, title, body, entity_type, entity_id, source)
				values ($1, $2, $2, 'info', $3, $4, 'chat_reminder', $5, 'chat')`,
				tu.TenantID, tu.AppUserID, "Reminder: "+title, snippet, id)
			if notify && channelID != nil {
				sysBody := fmt.Sprintf("Reminder due: %s", title)
				_, _ = pool.Exec(r.Context(), `
					insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind)
					values ($1, $2, null, $3, 'system')`,
					tu.TenantID, *channelID, sysBody)
			}
			fired = append(fired, Reminder{
				ID: id, ChannelID: channelID, CreatedByUserID: createdBy,
				Title: title, Body: body, RemindAt: remindAt.Format(time.RFC3339),
				Status: "fired", NotifyChannel: notify,
			})
		}
		response.OK(w, fired, "OK")
	}
}

func cancelReminder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid reminder id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.chat_reminders set status = 'cancelled'
			where id = $1 and tenant_id = $2 and created_by_user_id = $3 and status = 'scheduled'`,
			id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Reminder not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"ok": true}, "Cancelled.")
	}
}
