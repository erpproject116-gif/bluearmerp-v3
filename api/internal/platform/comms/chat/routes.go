package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/filedownload"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts team chat under /comms/chat.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/chat", func(cr chi.Router) {
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/unread-total", unreadTotal(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/channels", listChannels(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels", createChannel(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/dms", createOrGetDM(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/channels/{id}/members", listMembers(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels/{id}/members", addMembers(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/channels/{id}/messages", listMessages(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels/{id}/messages", postMessage(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels/{id}/read", markRead(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels/{id}/typing", postTyping(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/channels/{id}/typing", listTyping(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/channels/{id}/slash", postSlash(pool))
		cr.With(auth.RequirePermission("comms.chat_admin", auth.AccessWrite)).Post("/channels/{id}/archive", archiveChannel(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/messages/{id}/attachments", uploadAttachment(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/messages/{id}/forward", forwardMessage(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/messages/{id}/reactions", addReaction(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Delete("/messages/{id}/reactions", removeReaction(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/attachments/{id}/download", downloadAttachment(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/messages/{id}", getMessage(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/doc-search", docSearch(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/users", listChatUsers(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/baiko-capabilities", baikoCapabilities(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/reminders", createReminder(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/reminders", listReminders(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessRead)).Get("/reminders/due", dueReminders(pool))
		cr.With(auth.RequirePermission("comms.chat", auth.AccessWrite)).Post("/reminders/{id}/cancel", cancelReminder(pool))
	})
}

func getMessage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		messageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid message id."})
			return
		}
		var channelID int64
		var msg Message
		var created time.Time
		var deleted *time.Time
		var parentID, fwdID *int64
		err = pool.QueryRow(r.Context(), `
			select m.id, m.channel_id, m.sender_user_id,
			  coalesce(nullif(trim(u.full_name), ''), coalesce(u.email, case when m.sender_kind = 'baiko' then 'Baiko' when m.sender_kind = 'system' then 'System' else 'User' end)),
			  m.body, m.created_at, m.deleted_at, m.parent_message_id, m.forwarded_from_message_id, coalesce(m.sender_kind, 'user')
			from public.chat_messages m
			left join public.users u on u.id = m.sender_user_id
			where m.id = $1 and m.tenant_id = $2`, messageID, tu.TenantID,
		).Scan(&msg.ID, &channelID, &msg.SenderUserID, &msg.SenderName, &msg.Body, &created, &deleted, &parentID, &fwdID, &msg.SenderKind)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		msg.ChannelID = channelID
		msg.ParentMessageID = parentID
		msg.ForwardedFromMessageID = fwdID
		msg.CreatedAt = created.Format(time.RFC3339)
		if deleted != nil {
			s := deleted.Format(time.RFC3339)
			msg.DeletedAt = &s
			msg.Body = ""
		}
		tmp := []Message{msg}
		enrichMessages(r.Context(), pool, tmp, tu.AppUserID)
		response.OK(w, tmp[0], "OK")
	}
}

func listChannels(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select c.id, c.type, c.name, c.topic, c.is_private, c.created_by_user_id,
			  c.created_at, c.archived_at,
			  (select count(*)::bigint from public.chat_channel_members m2 where m2.channel_id = c.id),
			  coalesce((
			    select count(*)::bigint from public.chat_messages msg
			    where msg.channel_id = c.id and msg.tenant_id = c.tenant_id and msg.deleted_at is null
			      and (m.last_read_message_id is null or msg.id > m.last_read_message_id)
			  ), 0),
			  (select max(msg.created_at) from public.chat_messages msg
			    where msg.channel_id = c.id and msg.tenant_id = c.tenant_id and msg.deleted_at is null),
			  (select left(msg.body, 120) from public.chat_messages msg
			    where msg.channel_id = c.id and msg.tenant_id = c.tenant_id and msg.deleted_at is null
			    order by msg.id desc limit 1)
			from public.chat_channels c
			join public.chat_channel_members m on m.channel_id = c.id and m.user_id = $2
			where c.tenant_id = $1 and c.archived_at is null
			order by coalesce((
			  select max(msg.created_at) from public.chat_messages msg
			  where msg.channel_id = c.id and msg.deleted_at is null
			), c.created_at) desc, c.id desc`, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list channels.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []Channel{}
		for rows.Next() {
			var ch Channel
			var createdAt time.Time
			var archivedAt *time.Time
			var lastAt *time.Time
			var preview *string
			if err := rows.Scan(
				&ch.ID, &ch.Type, &ch.Name, &ch.Topic, &ch.IsPrivate, &ch.CreatedByUserID,
				&createdAt, &archivedAt, &ch.MemberCount, &ch.UnreadCount, &lastAt, &preview,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read channels.", "ERR_INTERNAL")
				return
			}
			ch.CreatedAt = createdAt.Format(time.RFC3339)
			if archivedAt != nil {
				s := archivedAt.Format(time.RFC3339)
				ch.ArchivedAt = &s
			}
			if lastAt != nil {
				s := lastAt.Format(time.RFC3339)
				ch.LastMessageAt = &s
			}
			if preview != nil {
				ch.LastMessagePreview = *preview
			}
			out = append(out, ch)
		}
		response.OK(w, out, "OK")
	}
}

type createChannelBody struct {
	Type      string  `json:"type"`
	Name      string  `json:"name"`
	Topic     string  `json:"topic"`
	IsPrivate bool    `json:"is_private"`
	MemberIDs []int64 `json:"member_ids"`
}

func createChannel(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body createChannelBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		typ := strings.ToLower(strings.TrimSpace(body.Type))
		if typ != "channel" && typ != "group" {
			response.Validation(w, map[string]string{"type": "type must be channel or group."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if typ == "channel" && name == "" {
			response.Validation(w, map[string]string{"name": "Channel name is required."})
			return
		}
		if typ == "group" && name == "" {
			name = "Group chat"
		}
		isPrivate := body.IsPrivate || typ == "group"

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var channelID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.chat_channels (tenant_id, type, name, topic, is_private, created_by_user_id)
			values ($1, $2, $3, $4, $5, $6) returning id`,
			tu.TenantID, typ, name, strings.TrimSpace(body.Topic), isPrivate, tu.AppUserID,
		).Scan(&channelID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create channel.", "ERR_INTERNAL")
			return
		}
		_, err = tx.Exec(r.Context(), `
			insert into public.chat_channel_members (channel_id, user_id, role)
			values ($1, $2, 'admin')`, channelID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add creator.", "ERR_INTERNAL")
			return
		}
		for _, uid := range body.MemberIDs {
			if uid == tu.AppUserID || uid <= 0 {
				continue
			}
			if !tenantUserExists(r.Context(), pool, tu.TenantID, uid) {
				response.Validation(w, map[string]string{"member_ids": fmt.Sprintf("User %d is not in this tenant.", uid)})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.chat_channel_members (channel_id, user_id, role)
				values ($1, $2, 'member') on conflict do nothing`, channelID, uid)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to add members.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": channelID}, "Channel created.")
	}
}

type dmBody struct {
	UserID int64 `json:"user_id"`
}

func createOrGetDM(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body dmBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID <= 0 {
			response.Validation(w, map[string]string{"user_id": "Other user is required."})
			return
		}
		if body.UserID == tu.AppUserID {
			response.Validation(w, map[string]string{"user_id": "Cannot DM yourself."})
			return
		}
		if !tenantUserExists(r.Context(), pool, tu.TenantID, body.UserID) {
			response.Validation(w, map[string]string{"user_id": "User is not in this tenant."})
			return
		}
		key := dmKey(tu.AppUserID, body.UserID)

		var channelID int64
		err := pool.QueryRow(r.Context(), `
			select id from public.chat_channels
			where tenant_id = $1 and type = 'dm' and dm_key = $2`, tu.TenantID, key).Scan(&channelID)
		if err == nil {
			response.OK(w, map[string]any{"id": channelID, "created": false}, "OK")
			return
		}
		if err != pgx.ErrNoRows {
			response.Err(w, http.StatusInternalServerError, "Failed to look up DM.", "ERR_INTERNAL")
			return
		}

		var otherName string
		_ = pool.QueryRow(r.Context(), `
			select coalesce(nullif(trim(full_name), ''), email) from public.users
			where id = $1 and tenant_id = $2`, body.UserID, tu.TenantID).Scan(&otherName)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		err = tx.QueryRow(r.Context(), `
			insert into public.chat_channels (tenant_id, type, name, is_private, dm_key, created_by_user_id)
			values ($1, 'dm', $2, true, $3, $4)
			returning id`,
			tu.TenantID, otherName, key, tu.AppUserID,
		).Scan(&channelID)
		if err != nil {
			// Race: another request created the DM
			err2 := pool.QueryRow(r.Context(), `
				select id from public.chat_channels where tenant_id=$1 and type='dm' and dm_key=$2`,
				tu.TenantID, key).Scan(&channelID)
			if err2 == nil {
				response.OK(w, map[string]any{"id": channelID, "created": false}, "OK")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create DM.", "ERR_INTERNAL")
			return
		}
		for _, uid := range []int64{tu.AppUserID, body.UserID} {
			role := "member"
			if uid == tu.AppUserID {
				role = "admin"
			}
			_, _ = tx.Exec(r.Context(), `
				insert into public.chat_channel_members (channel_id, user_id, role)
				values ($1, $2, $3) on conflict do nothing`, channelID, uid, role)
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit DM.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": channelID, "created": true}, "DM ready.")
	}
}

func listMembers(pool *pgxpool.Pool) http.HandlerFunc {
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
		rows, err := pool.Query(r.Context(), `
			select m.user_id, coalesce(nullif(trim(u.full_name), ''), u.email), u.email, m.role, m.last_read_message_id, m.joined_at
			from public.chat_channel_members m
			join public.users u on u.id = m.user_id
			join public.chat_channels c on c.id = m.channel_id
			where m.channel_id = $1 and c.tenant_id = $2
			order by u.full_name, u.email`, channelID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list members.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []Member{}
		for rows.Next() {
			var m Member
			var joined time.Time
			if err := rows.Scan(&m.UserID, &m.FullName, &m.Email, &m.Role, &m.LastReadMessageID, &joined); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read members.", "ERR_INTERNAL")
				return
			}
			m.JoinedAt = joined.Format(time.RFC3339)
			out = append(out, m)
		}
		response.OK(w, out, "OK")
	}
}

type addMembersBody struct {
	UserIDs []int64 `json:"user_ids"`
}

func addMembers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		role, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		var chType string
		_ = pool.QueryRow(r.Context(), `select type from public.chat_channels where id=$1 and tenant_id=$2`, channelID, tu.TenantID).Scan(&chType)
		if chType == "dm" {
			response.Validation(w, map[string]string{"id": "Cannot add members to a DM."})
			return
		}
		if role != "admin" && !tu.HasPermission("comms.chat_admin", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "Only channel admins can add members.", "ERR_FORBIDDEN")
			return
		}
		var body addMembersBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.UserIDs) == 0 {
			response.Validation(w, map[string]string{"user_ids": "At least one user is required."})
			return
		}
		added := 0
		for _, uid := range body.UserIDs {
			if uid <= 0 || !tenantUserExists(r.Context(), pool, tu.TenantID, uid) {
				response.Validation(w, map[string]string{"user_ids": fmt.Sprintf("User %d is not in this tenant.", uid)})
				return
			}
			tag, err := pool.Exec(r.Context(), `
				insert into public.chat_channel_members (channel_id, user_id, role)
				values ($1, $2, 'member') on conflict do nothing`, channelID, uid)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to add member.", "ERR_INTERNAL")
				return
			}
			added += int(tag.RowsAffected())
		}
		response.OK(w, map[string]any{"added": added}, "Members updated.")
	}
}

func listMessages(pool *pgxpool.Pool) http.HandlerFunc {
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
		limit := 50
		if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
			limit = v
		}
		beforeID, _ := strconv.ParseInt(r.URL.Query().Get("before_id"), 10, 64)

		args := []any{tu.TenantID, channelID}
		where := `m.tenant_id = $1 and m.channel_id = $2`
		if beforeID > 0 {
			args = append(args, beforeID)
			where += fmt.Sprintf(` and m.id < $%d`, len(args))
		}
		args = append(args, limit)
		q := fmt.Sprintf(`
			select m.id, m.channel_id, m.sender_user_id,
			  coalesce(nullif(trim(u.full_name), ''), coalesce(u.email, case when m.sender_kind = 'baiko' then 'Baiko' when m.sender_kind = 'system' then 'System' else 'User' end)),
			  m.body, m.created_at, m.deleted_at, m.parent_message_id, m.forwarded_from_message_id, coalesce(m.sender_kind, 'user')
			from public.chat_messages m
			left join public.users u on u.id = m.sender_user_id
			where %s
			order by m.id desc
			limit $%d`, where, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list messages.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var msgs []Message
		var ids []int64
		for rows.Next() {
			var msg Message
			var created time.Time
			var deleted *time.Time
			var parentID, fwdID *int64
			if err := rows.Scan(&msg.ID, &msg.ChannelID, &msg.SenderUserID, &msg.SenderName, &msg.Body, &created, &deleted, &parentID, &fwdID, &msg.SenderKind); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read messages.", "ERR_INTERNAL")
				return
			}
			msg.ParentMessageID = parentID
			msg.ForwardedFromMessageID = fwdID
			msg.CreatedAt = created.Format(time.RFC3339)
			if deleted != nil {
				s := deleted.Format(time.RFC3339)
				msg.DeletedAt = &s
				msg.Body = ""
			}
			msgs = append(msgs, msg)
			ids = append(ids, msg.ID)
		}
		// reverse to chronological
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
		if len(ids) > 0 {
			enrichMessages(r.Context(), pool, msgs, tu.AppUserID)
		}
		if msgs == nil {
			msgs = []Message{}
		}
		response.OK(w, msgs, "OK")
	}
}

func enrichMessages(ctx context.Context, pool *pgxpool.Pool, msgs []Message, viewerUserID int64) {
	byID := map[int64]*Message{}
	ids := make([]int64, 0, len(msgs))
	parentIDs := make([]int64, 0)
	for i := range msgs {
		byID[msgs[i].ID] = &msgs[i]
		ids = append(ids, msgs[i].ID)
		if msgs[i].ParentMessageID != nil {
			parentIDs = append(parentIDs, *msgs[i].ParentMessageID)
		}
	}
	if len(parentIDs) > 0 {
		pRows, err := pool.Query(ctx, `
			select m.id, m.body, m.deleted_at,
			  coalesce(nullif(trim(u.full_name), ''), coalesce(u.email, case when m.sender_kind = 'baiko' then 'Baiko' when m.sender_kind = 'system' then 'System' else 'User' end))
			from public.chat_messages m
			left join public.users u on u.id = m.sender_user_id
			where m.id = any($1)`, parentIDs)
		if err == nil {
			defer pRows.Close()
			previews := map[int64]ParentPreview{}
			for pRows.Next() {
				var id int64
				var body, name string
				var deleted *time.Time
				if pRows.Scan(&id, &body, &deleted, &name) != nil {
					continue
				}
				pv := ParentPreview{ID: id, SenderName: name}
				if deleted != nil {
					pv.Deleted = true
					pv.Body = "Original message deleted"
				} else {
					if len(body) > 160 {
						body = body[:160] + "…"
					}
					pv.Body = body
				}
				previews[id] = pv
			}
			for i := range msgs {
				if msgs[i].ParentMessageID == nil {
					continue
				}
				if pv, ok := previews[*msgs[i].ParentMessageID]; ok {
					cp := pv
					msgs[i].ParentPreview = &cp
				}
			}
		}
	}
	mRows, err := pool.Query(ctx, `
		select message_id, user_id from public.chat_message_mentions
		where message_id = any($1)`, ids)
	if err == nil {
		defer mRows.Close()
		for mRows.Next() {
			var mid, uid int64
			if mRows.Scan(&mid, &uid) == nil {
				if m := byID[mid]; m != nil {
					m.MentionIDs = append(m.MentionIDs, uid)
				}
			}
		}
	}
	lRows, err := pool.Query(ctx, `
		select id, message_id, entity_type, entity_id, label
		from public.chat_message_links where message_id = any($1)`, ids)
	if err == nil {
		defer lRows.Close()
		for lRows.Next() {
			var link MessageLink
			var mid int64
			if lRows.Scan(&link.ID, &mid, &link.EntityType, &link.EntityID, &link.Label) == nil {
				link.Href = EntityHref(link.EntityType, link.EntityID)
				if m := byID[mid]; m != nil {
					m.Links = append(m.Links, link)
				}
			}
		}
	}
	aRows, err := pool.Query(ctx, `
		select id, message_id, file_name, mime_type, size_bytes, uploaded_by_user_id, created_at
		from public.chat_message_attachments where message_id = any($1)`, ids)
	if err == nil {
		defer aRows.Close()
		for aRows.Next() {
			var att MessageAttachment
			var mid int64
			var created time.Time
			if aRows.Scan(&att.ID, &mid, &att.FileName, &att.MimeType, &att.SizeBytes, &att.UploadedByUserID, &created) == nil {
				att.CreatedAt = created.Format(time.RFC3339)
				att.DownloadPath = fmt.Sprintf("/api/v1/comms/chat/attachments/%d/download", att.ID)
				if m := byID[mid]; m != nil {
					m.Attachments = append(m.Attachments, att)
				}
			}
		}
	}
	rRows, err := pool.Query(ctx, `
		select message_id, emoji, count(*)::bigint,
		  bool_or(user_id = $2) as me
		from public.chat_message_reactions
		where message_id = any($1)
		group by message_id, emoji`, ids, viewerUserID)
	if err == nil {
		defer rRows.Close()
		for rRows.Next() {
			var mid int64
			var react MessageReaction
			if rRows.Scan(&mid, &react.Emoji, &react.Count, &react.Me) == nil {
				if m := byID[mid]; m != nil {
					m.Reactions = append(m.Reactions, react)
				}
			}
		}
	}
}

type postLinkBody struct {
	EntityType string `json:"entity_type"`
	EntityID   *int64 `json:"entity_id"`
	Label      string `json:"label"`
}

type postMessageBody struct {
	Body            string         `json:"body"`
	MentionIDs      []int64        `json:"mention_ids"`
	Links           []postLinkBody `json:"links"`
	ParentMessageID *int64         `json:"parent_message_id"`
}

func postMessage(pool *pgxpool.Pool) http.HandlerFunc {
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
		var body postMessageBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		text := strings.TrimSpace(body.Body)
		if text == "" && len(body.Links) == 0 {
			response.Validation(w, map[string]string{"body": "Message body or a document link is required."})
			return
		}
		if len(text) > 8000 {
			response.Validation(w, map[string]string{"body": "Message is too long."})
			return
		}

		var parentID *int64
		if body.ParentMessageID != nil && *body.ParentMessageID > 0 {
			var parentChannel int64
			err = pool.QueryRow(r.Context(), `
				select channel_id from public.chat_messages
				where id = $1 and tenant_id = $2`, *body.ParentMessageID, tu.TenantID,
			).Scan(&parentChannel)
			if err != nil || parentChannel != channelID {
				response.Validation(w, map[string]string{"parent_message_id": "Parent must be a message in this channel."})
				return
			}
			parentID = body.ParentMessageID
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var messageID int64
		var created time.Time
		err = tx.QueryRow(r.Context(), `
			insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, parent_message_id, sender_kind)
			values ($1, $2, $3, $4, $5, 'user') returning id, created_at`,
			tu.TenantID, channelID, tu.AppUserID, text, parentID,
		).Scan(&messageID, &created)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post message.", "ERR_INTERNAL")
			return
		}

		validMentions := make([]int64, 0, len(body.MentionIDs))
		seen := map[int64]bool{}
		for _, uid := range body.MentionIDs {
			if uid <= 0 || uid == tu.AppUserID || seen[uid] {
				continue
			}
			if !tenantUserExists(r.Context(), pool, tu.TenantID, uid) {
				response.Validation(w, map[string]string{"mention_ids": fmt.Sprintf("User %d is not in this tenant.", uid)})
				return
			}
			seen[uid] = true
			validMentions = append(validMentions, uid)
			_, _ = tx.Exec(r.Context(), `
				insert into public.chat_message_mentions (message_id, user_id) values ($1, $2)
				on conflict do nothing`, messageID, uid)
		}

		for _, link := range body.Links {
			et := strings.TrimSpace(link.EntityType)
			if !IsAllowedEntityType(et) {
				response.Validation(w, map[string]string{"links": "Unsupported document type: " + et})
				return
			}
			var eid *int64
			label := strings.TrimSpace(link.Label)
			if IsReportEntityType(et) {
				if label == "" {
					label, _ = resolveEntityLabel(r.Context(), pool, tu.TenantID, et, 0)
				}
			} else {
				if link.EntityID == nil || *link.EntityID <= 0 {
					response.Validation(w, map[string]string{"links": "entity_id is required for " + et})
					return
				}
				resolved, ok := resolveEntityLabel(r.Context(), pool, tu.TenantID, et, *link.EntityID)
				if !ok {
					response.Validation(w, map[string]string{"links": "Document not found in this tenant."})
					return
				}
				if label == "" {
					label = resolved
				}
				eid = link.EntityID
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.chat_message_links (message_id, entity_type, entity_id, label)
				values ($1, $2, $3, $4)`, messageID, et, eid, label)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to attach document link.", "ERR_INTERNAL")
				return
			}
		}

		snippet := text
		if len(snippet) > 160 {
			snippet = snippet[:160] + "…"
		}
		if snippet == "" {
			snippet = "Shared a document"
		}
		title := "Mentioned you in Team Chat"
		for _, uid := range validMentions {
			_, _ = tx.Exec(r.Context(), `
				insert into public.crm_notifications
				  (tenant_id, user_id, actor_user_id, severity, title, body, entity_type, entity_id, source)
				values ($1, $2, $3, 'info', $4, $5, 'chat_message', $6, 'chat')`,
				tu.TenantID, uid, tu.AppUserID, title, snippet, messageID)
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit message.", "ERR_INTERNAL")
			return
		}

		msg := Message{
			ID: messageID, ChannelID: channelID, SenderUserID: &tu.AppUserID,
			Body: text, CreatedAt: created.Format(time.RFC3339), MentionIDs: validMentions,
			ParentMessageID: parentID, SenderKind: "user",
		}
		_ = pool.QueryRow(r.Context(), `
			select coalesce(nullif(trim(full_name), ''), email) from public.users where id=$1`,
			tu.AppUserID).Scan(&msg.SenderName)
		tmp := []Message{msg}
		enrichMessages(r.Context(), pool, tmp, tu.AppUserID)
		response.OK(w, tmp[0], "Posted.")
	}
}

type readBody struct {
	MessageID int64 `json:"message_id"`
}

func markRead(pool *pgxpool.Pool) http.HandlerFunc {
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
		var body readBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		msgID := body.MessageID
		if msgID <= 0 {
			_ = pool.QueryRow(r.Context(), `
				select coalesce(max(id), 0) from public.chat_messages
				where channel_id=$1 and tenant_id=$2`, channelID, tu.TenantID).Scan(&msgID)
		}
		_, err = pool.Exec(r.Context(), `
			update public.chat_channel_members
			set last_read_message_id = greatest(coalesce(last_read_message_id, 0), $3)
			where channel_id = $1 and user_id = $2`, channelID, tu.AppUserID, msgID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark read.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"last_read_message_id": msgID}, "Marked read.")
	}
}

func archiveChannel(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		if err := requireChannel(r.Context(), pool, tu.TenantID, channelID); err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.chat_channels set archived_at = now()
			where id = $1 and tenant_id = $2 and archived_at is null`, channelID, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Archived.")
	}
}

func uploadAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		messageID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid message id."})
			return
		}
		var channelID, tenantID int64
		var senderID *int64
		err = pool.QueryRow(r.Context(), `
			select channel_id, tenant_id, sender_user_id from public.chat_messages
			where id = $1 and tenant_id = $2 and deleted_at is null`, messageID, tu.TenantID,
		).Scan(&channelID, &tenantID, &senderID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Message not found.", "ERR_NOT_FOUND")
			return
		}
		if senderID == nil || *senderID != tu.AppUserID {
			response.Err(w, http.StatusForbidden, "Only the sender can attach files to this message.", "ERR_FORBIDDEN")
			return
		}

		var used int64
		_ = pool.QueryRow(r.Context(), `
			select coalesce(sum(size_bytes), 0) from public.chat_message_attachments where message_id = $1`,
			messageID).Scan(&used)
		remaining := MaxAttachmentsBytes - used
		if remaining <= 0 {
			response.Validation(w, map[string]string{"file": "Message already has 25 MB of attachments."})
			return
		}

		if err := r.ParseMultipartForm(MaxAttachmentsBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid multipart form."})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "file is required."})
			return
		}
		defer file.Close()
		safeName := filepath.Base(header.Filename)
		if safeName == "." || safeName == "/" || safeName == "" {
			response.Validation(w, map[string]string{"file": "Invalid file name."})
			return
		}
		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = "application/octet-stream"
		}
		if !allowedChatMime(mimeType, safeName) {
			response.Validation(w, map[string]string{"file": "Only images, documents, and short videos are allowed."})
			return
		}
		if header.Size > remaining {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Combined attachments must stay under 25 MB (%d bytes remaining).", remaining)})
			return
		}
		data, err := io.ReadAll(io.LimitReader(file, remaining+1))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read file.", "ERR_INTERNAL")
			return
		}
		if int64(len(data)) > remaining {
			response.Validation(w, map[string]string{"file": "Combined attachments must stay under 25 MB."})
			return
		}
		storagePath := fmt.Sprintf("%d/chat/%d/%d_%s", tu.TenantID, messageID, time.Now().UnixNano(), safeName)
		var attID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.chat_message_attachments
			  (message_id, file_name, mime_type, size_bytes, storage_path, file_bytes, uploaded_by_user_id)
			values ($1, $2, $3, $4, $5, $6, $7) returning id`,
			messageID, safeName, mimeType, int64(len(data)), storagePath, data, tu.AppUserID,
		).Scan(&attID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store attachment.", "ERR_INTERNAL")
			return
		}
		response.OK(w, MessageAttachment{
			ID: attID, FileName: safeName, MimeType: mimeType, SizeBytes: int64(len(data)),
			UploadedByUserID: &tu.AppUserID, CreatedAt: time.Now().UTC().Format(time.RFC3339),
			DownloadPath: fmt.Sprintf("/api/v1/comms/chat/attachments/%d/download", attID),
		}, "Uploaded.")
	}
}

func downloadAttachment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		attID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid attachment id."})
			return
		}
		var fileName, mimeType, storagePath string
		var fileBytes []byte
		var channelID int64
		err = pool.QueryRow(r.Context(), `
			select a.file_name, a.mime_type, a.storage_path, a.file_bytes, m.channel_id
			from public.chat_message_attachments a
			join public.chat_messages m on m.id = a.message_id
			where a.id = $1 and m.tenant_id = $2`, attID, tu.TenantID,
		).Scan(&fileName, &mimeType, &storagePath, &fileBytes, &channelID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Attachment not found.", "ERR_NOT_FOUND")
			return
		}
		_ = filedownload.ServeBytesOrStoredFile(w, r, fileBytes, "data/chat-attachments", storagePath, fileName, mimeType, time.Now())
	}
}

func listChatUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		like := "%" + q + "%"
		rows, err := pool.Query(r.Context(), `
			select id, coalesce(nullif(trim(full_name), ''), email), email
			from public.users
			where tenant_id = $1 and status = 'active'
			  and ($2 = '' or full_name ilike $3 or email ilike $3)
			order by full_name nulls last, email
			limit 20`, tu.TenantID, q, like)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list users.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []ChatUser{}
		for rows.Next() {
			var u ChatUser
			if err := rows.Scan(&u.ID, &u.FullName, &u.Email); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read users.", "ERR_INTERNAL")
				return
			}
			out = append(out, u)
		}
		response.OK(w, out, "OK")
	}
}

func docSearch(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		et := strings.TrimSpace(r.URL.Query().Get("entity_type"))
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		if !IsAllowedEntityType(et) {
			response.Validation(w, map[string]string{"entity_type": "Unsupported document type."})
			return
		}
		if IsReportEntityType(et) {
			label, _ := resolveEntityLabel(r.Context(), pool, tu.TenantID, et, 0)
			id := int64(0)
			response.OK(w, []DocSearchHit{{
				EntityType: et, EntityID: id, Label: label, Href: EntityHref(et, nil),
			}}, "OK")
			return
		}
		hits, err := searchEntities(r.Context(), pool, tu.TenantID, et, q, 20)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to search documents.", "ERR_INTERNAL")
			return
		}
		if hits == nil {
			hits = []DocSearchHit{}
		}
		response.OK(w, hits, "OK")
	}
}
