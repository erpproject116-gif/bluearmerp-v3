package dashboard

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// Known Home widgets. finance is always shown even if omitted from storage.
var homeWidgetAllowlist = map[string]struct{}{
	"finance":         {},
	"day_jobs":        {},
	"getting_started": {},
	"shortcuts":       {},
	"sales_trend":     {},
	"inventory_trend": {},
	"top_customers":   {},
	"top_items":       {},
	"cash_in_out":     {},
	"overdue":         {},
	"recent_activity": {},
}

var defaultHomeWidgets = []string{"finance", "day_jobs"}

const maxHomeWidgets = 12

type homeLayoutBody struct {
	WidgetIDs []string `json:"widget_ids"`
}

type homeLayoutResponse struct {
	WidgetIDs []string `json:"widget_ids"`
}

func sanitizeHomeWidgetIDs(ids []string) []string {
	out := make([]string, 0, len(ids))
	seen := map[string]struct{}{}
	hasFinance := false
	for _, raw := range ids {
		id := raw
		if id == "" {
			continue
		}
		if _, ok := homeWidgetAllowlist[id]; !ok {
			continue
		}
		if _, dup := seen[id]; dup {
			continue
		}
		seen[id] = struct{}{}
		if id == "finance" {
			hasFinance = true
		}
		out = append(out, id)
		if len(out) >= maxHomeWidgets {
			break
		}
	}
	if !hasFinance {
		out = append([]string{"finance"}, out...)
		if len(out) > maxHomeWidgets {
			out = out[:maxHomeWidgets]
			// Keep finance first if we had to trim.
			if out[0] != "finance" {
				out[0] = "finance"
			}
		}
	}
	return out
}

func getHomeLayout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var raw []byte
		err := pool.QueryRow(r.Context(), `
			select widget_ids from public.usr_home_layouts
			where tenant_id = $1 and user_id = $2`, tu.TenantID, tu.AppUserID).Scan(&raw)
		if err == pgx.ErrNoRows {
			response.OK(w, homeLayoutResponse{WidgetIDs: append([]string{}, defaultHomeWidgets...)}, "OK")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load Home layout.", "ERR_INTERNAL")
			return
		}
		var ids []string
		if len(raw) > 0 {
			_ = json.Unmarshal(raw, &ids)
		}
		response.OK(w, homeLayoutResponse{WidgetIDs: sanitizeHomeWidgetIDs(ids)}, "OK")
	}
}

func putHomeLayout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body homeLayoutBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		ids := sanitizeHomeWidgetIDs(body.WidgetIDs)
		payload, err := json.Marshal(ids)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save Home layout.", "ERR_INTERNAL")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			insert into public.usr_home_layouts (tenant_id, user_id, widget_ids, updated_at)
			select $1, $2, $3::jsonb, now()
			where exists (
			  select 1 from public.users u where u.id = $2 and u.tenant_id = $1
			)
			on conflict (tenant_id, user_id) do update
			  set widget_ids = excluded.widget_ids, updated_at = now()`,
			tu.TenantID, tu.AppUserID, string(payload))
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save Home layout.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusForbidden, "Cannot save Home layout for this user.", "ERR_FORBIDDEN")
			return
		}
		response.OK(w, homeLayoutResponse{WidgetIDs: ids}, "Home layout saved.")
	}
}
