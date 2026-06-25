package activitylog

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ChangeLogRow struct {
	ID             int64     `json:"id"`
	ActorUserID    *int64    `json:"actor_user_id,omitempty"`
	ActorName      *string   `json:"actor_name,omitempty"`
	ActionCode     string    `json:"action_code"`
	TargetType     string    `json:"target_type"`
	TargetID       *int64    `json:"target_id,omitempty"`
	EntityLabel    string    `json:"entity_label"`
	ReferenceLabel string    `json:"reference_label"`
	ReferenceNo    string    `json:"reference_no"`
	Summary        string    `json:"summary"`
	Details        []string  `json:"details,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
}

func listChangeLogs(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"created_at":  "al.created_at",
		"action_code": "al.action_code",
		"target_type": "al.target_type",
		"actor_name":  "u.full_name",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		if p.Order != "asc" && p.Order != "desc" {
			p.Order = "desc"
		}
		if r.URL.Query().Get("order") == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		where := "al.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2

		q := r.URL.Query()
		if v := strings.TrimSpace(q.Get("date_from")); v != "" {
			t, err := time.Parse("2006-01-02", v)
			if err != nil {
				response.Validation(w, map[string]string{"date_from": "Use YYYY-MM-DD."})
				return
			}
			where += fmt.Sprintf(" and al.created_at >= $%d", n)
			args = append(args, t)
			n++
		}
		if v := strings.TrimSpace(q.Get("date_to")); v != "" {
			t, err := time.Parse("2006-01-02", v)
			if err != nil {
				response.Validation(w, map[string]string{"date_to": "Use YYYY-MM-DD."})
				return
			}
			where += fmt.Sprintf(" and al.created_at < $%d", n)
			args = append(args, t.Add(24*time.Hour))
			n++
		}
		if v := strings.TrimSpace(q.Get("actor_user_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"actor_user_id": "Invalid user id."})
				return
			}
			where += fmt.Sprintf(" and al.actor_user_id = $%d", n)
			args = append(args, id)
			n++
		}
		if v := strings.TrimSpace(q.Get("action_code")); v != "" {
			where += fmt.Sprintf(" and al.action_code = $%d", n)
			args = append(args, v)
			n++
		}
		if v := strings.TrimSpace(q.Get("target_type")); v != "" {
			where += fmt.Sprintf(" and al.target_type = $%d", n)
			args = append(args, v)
			n++
		}
		if v := strings.TrimSpace(q.Get("target_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"target_id": "Invalid target id."})
				return
			}
			where += fmt.Sprintf(" and al.target_id = $%d", n)
			args = append(args, id)
			n++
		}
		if v := strings.TrimSpace(q.Get("module")); v != "" {
			where += fmt.Sprintf(" and al.action_code like $%d", n)
			args = append(args, v+".%")
			n++
		}
		if v := strings.TrimSpace(q.Get("reference_no")); v != "" {
			where += fmt.Sprintf(` and coalesce(ref.reference_no, '') ilike $%d`, n)
			args = append(args, "%"+v+"%")
			n++
		}

		// Modifications only — exclude pure creates and system jobs
		where += ` and al.action_code not like '%.create' and al.action_code <> 'crm.job.evaluate'`
		where += ` and (
		  (al.old_values is not null and al.old_values::text not in ('null', '{}'))
		  or al.action_code ~ '\.(update|delete|progress_status|invoicing_status|stage|release|convert|adjustment|price_batch|import_batch|import|invite_revoke|attachment\.upload|members\.update|permissions\.update)$'
		  or al.action_code like '%.warranty.update'
		  or al.action_code like '%.rule.update'
		  or al.action_code like '%.task.update'
		  or al.action_code like '%.task.stage'
		  or al.action_code like 'settings.%'
		  or al.action_code ~ '^api\.(patch|put|delete)\.'
		)`

		sortCol := p.Sort
		if sortCol == "" {
			sortCol = "al.created_at"
		}
		order := "desc"
		if p.Order == "asc" {
			order = "asc"
		}

		sql := fmt.Sprintf(`
			select
			  al.id,
			  al.actor_user_id,
			  u.full_name,
			  al.action_code,
			  al.target_type,
			  al.target_id,
			  al.old_values,
			  al.new_values,
			  al.created_at,
			  coalesce(ref.reference_no, '') as reference_no,
			  count(*) over() as total_count
			from public.audit_logs al
			left join public.users u on u.id = al.actor_user_id
			` + auditLogReferenceLateralSQL + `
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, order, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), sql, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list change logs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []ChangeLogRow
		var total int64
		for rows.Next() {
			var row ChangeLogRow
			var actorName *string
			var oldJSON, newJSON []byte
			if err := rows.Scan(
				&row.ID,
				&row.ActorUserID,
				&actorName,
				&row.ActionCode,
				&row.TargetType,
				&row.TargetID,
				&oldJSON,
				&newJSON,
				&row.CreatedAt,
				&row.ReferenceNo,
				&total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list change logs.", "ERR_INTERNAL")
				return
			}
			if actorName != nil && strings.TrimSpace(*actorName) != "" {
				row.ActorName = actorName
			}
			row.EntityLabel = entityLabel(row.TargetType)
			row.ReferenceLabel = referenceLabel(row.TargetType)
			actor := ""
			if row.ActorName != nil {
				actor = *row.ActorName
			}
			row.Summary, row.Details = formatChangeSummary(actor, row.ActionCode, row.TargetType, row.ReferenceNo, oldJSON, newJSON)
			out = append(out, row)
		}
		if out == nil {
			out = []ChangeLogRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
