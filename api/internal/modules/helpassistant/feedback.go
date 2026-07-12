package helpassistant

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type feedbackBody struct {
	Query     string `json:"query"`
	Pathname  string `json:"pathname"`
	ArticleID string `json:"article_id"`
	Vote      string `json:"vote"`
}

func postFeedback(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body feedbackBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		query := strings.TrimSpace(body.Query)
		articleID := strings.TrimSpace(body.ArticleID)
		vote := strings.ToLower(strings.TrimSpace(body.Vote))
		pathname := strings.TrimSpace(body.Pathname)
		if query == "" {
			response.Validation(w, map[string]string{"query": "Query is required."})
			return
		}
		if articleID == "" {
			response.Validation(w, map[string]string{"article_id": "Article is required."})
			return
		}
		if vote != "up" && vote != "down" {
			response.Validation(w, map[string]string{"vote": "Vote must be up or down."})
			return
		}
		if len(query) > 500 {
			query = query[:500]
		}
		if len(pathname) > 300 {
			pathname = pathname[:300]
		}
		if len(articleID) > 120 {
			articleID = articleID[:120]
		}

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.help_feedback_events (tenant_id, user_id, query, pathname, article_id, vote)
			values ($1, $2, $3, $4, $5, $6)
			returning id`,
			tu.TenantID, tu.AppUserID, query, pathname, articleID, vote,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save feedback.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Feedback saved.")
	}
}

func writeOK(w http.ResponseWriter, data any, message string) {
	response.OK(w, data, message)
}
