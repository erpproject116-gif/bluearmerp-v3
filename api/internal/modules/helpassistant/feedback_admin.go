package helpassistant

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type feedbackRow struct {
	ID        int64     `json:"id"`
	Query     string    `json:"query"`
	Pathname  string    `json:"pathname"`
	ArticleID string    `json:"article_id"`
	Vote      string    `json:"vote"`
	UserID    *int64    `json:"user_id,omitempty"`
	UserName  string    `json:"user_name,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type feedbackSummaryRow struct {
	Query      string `json:"query"`
	ArticleID  string `json:"article_id"`
	DownVotes  int64  `json:"down_votes"`
	UpVotes    int64  `json:"up_votes"`
	LastAt     string `json:"last_at"`
	SamplePath string `json:"sample_pathname,omitempty"`
}

func listFeedback(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		vote := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("vote")))
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 200 {
				limit = n
			}
		}
		args := []any{tu.TenantID}
		where := "f.tenant_id = $1"
		if vote == "up" || vote == "down" {
			args = append(args, vote)
			where += " and f.vote = $2"
		}
		args = append(args, limit)
		limArg := len(args)

		q := `
			select f.id, f.query, f.pathname, f.article_id, f.vote, f.user_id,
			  coalesce(u.full_name, ''), f.created_at
			from public.help_feedback_events f
			left join public.users u on u.id = f.user_id
			where ` + where + `
			order by f.created_at desc
			limit $` + strconv.Itoa(limArg)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list feedback.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []feedbackRow{}
		for rows.Next() {
			var row feedbackRow
			if err := rows.Scan(&row.ID, &row.Query, &row.Pathname, &row.ArticleID, &row.Vote, &row.UserID, &row.UserName, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read feedback.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func summarizeFeedback(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		days := 30
		if raw := r.URL.Query().Get("days"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 365 {
				days = n
			}
		}
		rows, err := pool.Query(r.Context(), `
			select query, article_id,
			  count(*) filter (where vote = 'down') as down_votes,
			  count(*) filter (where vote = 'up') as up_votes,
			  max(created_at)::text as last_at,
			  (array_agg(pathname order by created_at desc))[1] as sample_path
			from public.help_feedback_events
			where tenant_id = $1
			  and created_at >= now() - ($2::text || ' days')::interval
			group by query, article_id
			having count(*) filter (where vote = 'down') > 0
			order by down_votes desc, last_at desc
			limit 100`, tu.TenantID, strconv.Itoa(days))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to summarize feedback.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []feedbackSummaryRow{}
		for rows.Next() {
			var row feedbackSummaryRow
			if err := rows.Scan(&row.Query, &row.ArticleID, &row.DownVotes, &row.UpVotes, &row.LastAt, &row.SamplePath); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read summary.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}
