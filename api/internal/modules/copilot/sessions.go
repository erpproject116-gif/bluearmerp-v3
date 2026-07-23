package copilot

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type sessionRow struct {
	ID        int64  `json:"id"`
	Title     string `json:"title"`
	Pathname  string `json:"pathname"`
	UpdatedAt string `json:"updated_at"`
	CreatedAt string `json:"created_at"`
}

type messageRow struct {
	ID          int64           `json:"id"`
	Role        string          `json:"role"`
	Content     string          `json:"content"`
	ArticleIDs  json.RawMessage `json:"article_ids"`
	Attachments json.RawMessage `json:"attachments"`
	Model       string          `json:"model,omitempty"`
	CreatedAt   string          `json:"created_at"`
}

func registerSessionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/sessions", listSessions(pool))
	r.Get("/sessions/{id}", getSession(pool))
	r.Delete("/sessions/{id}", deleteSession(pool))
	r.Patch("/sessions/{id}", patchSession(pool))
}

func listSessions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		limit := 40
		rows, err := pool.Query(r.Context(), `
			select id,
			  coalesce(nullif(title, ''), left(coalesce((
			    select m.content from public.copilot_messages m
			    where m.session_id = s.id and m.role = 'user' order by m.id asc limit 1
			  ), 'New chat'), 80), 'New chat') as title,
			  pathname, updated_at::text, created_at::text
			from public.copilot_sessions s
			where tenant_id = $1 and user_id = $2
			order by updated_at desc
			limit $3`, tu.TenantID, tu.AppUserID, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sessions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []sessionRow{}
		for rows.Next() {
			var row sessionRow
			if err := rows.Scan(&row.ID, &row.Title, &row.Pathname, &row.UpdatedAt, &row.CreatedAt); err != nil {
				continue
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func getSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid session id."})
			return
		}
		var title, pathname string
		err = pool.QueryRow(r.Context(), `
			select coalesce(title, ''), pathname from public.copilot_sessions
			where id = $1 and tenant_id = $2 and user_id = $3`, id, tu.TenantID, tu.AppUserID,
		).Scan(&title, &pathname)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, role, content, coalesce(article_ids, '[]'::jsonb),
			  coalesce(attachments, '[]'::jsonb), coalesce(model, ''), created_at::text
			from public.copilot_messages
			where session_id = $1 and tenant_id = $2
			order by id asc`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load messages.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		msgs := []messageRow{}
		for rows.Next() {
			var m messageRow
			if err := rows.Scan(&m.ID, &m.Role, &m.Content, &m.ArticleIDs, &m.Attachments, &m.Model, &m.CreatedAt); err != nil {
				continue
			}
			msgs = append(msgs, m)
		}
		response.OK(w, map[string]any{
			"id":       id,
			"title":    title,
			"pathname": pathname,
			"messages": msgs,
		}, "OK")
	}
}

func deleteSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid session id."})
			return
		}
		ct, err := pool.Exec(r.Context(), `
			delete from public.copilot_sessions
			where id = $1 and tenant_id = $2 and user_id = $3`, id, tu.TenantID, tu.AppUserID)
		if err != nil || ct.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted")
	}
}

func patchSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid session id."})
			return
		}
		var body struct {
			Title string `json:"title"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if len(title) > 200 {
			title = title[:200]
		}
		ct, err := pool.Exec(r.Context(), `
			update public.copilot_sessions set title = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and user_id = $4`, title, id, tu.TenantID, tu.AppUserID)
		if err != nil || ct.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id, "title": title}, "OK")
	}
}
