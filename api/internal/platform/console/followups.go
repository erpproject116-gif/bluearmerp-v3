package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func (s *service) listFollowUps(w http.ResponseWriter, r *http.Request) {
	stage := strings.TrimSpace(r.URL.Query().Get("stage"))
	args := []any{}
	where := "where 1=1"
	if stage != "" {
		args = append(args, stage)
		where += " and f.stage = $1"
	} else {
		where += " and f.stage in ('open','in_progress')"
	}
	rows, err := s.pool.Query(r.Context(), `
		select f.id, f.platform_customer_id, f.tenant_id, f.support_ticket_id, f.title, f.task_type, f.stage,
		       f.due_at, f.assigned_platform_user_id, f.outcome, f.next_action, f.notes, f.created_at,
		       coalesce(pc.company_name, pc.full_name, pc.email) as customer_name,
		       coalesce(pu.full_name, '') as assignee_name
		from public.platform_follow_up_tasks f
		join public.platform_customers pc on pc.id = f.platform_customer_id
		left join public.platform_users pu on pu.id = f.assigned_platform_user_id
		`+where+`
		order by f.due_at nulls last, f.created_at desc
		limit 200`, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list follow-ups.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	response.OK(w, map[string]any{"follow_ups": scanFollowUps(rows)}, "OK")
}

func (s *service) listCustomerFollowUps(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	rows, err := s.pool.Query(r.Context(), `
		select f.id, f.platform_customer_id, f.tenant_id, f.support_ticket_id, f.title, f.task_type, f.stage,
		       f.due_at, f.assigned_platform_user_id, f.outcome, f.next_action, f.notes, f.created_at,
		       coalesce(pc.company_name, pc.full_name, pc.email) as customer_name,
		       coalesce(pu.full_name, '') as assignee_name
		from public.platform_follow_up_tasks f
		join public.platform_customers pc on pc.id = f.platform_customer_id
		left join public.platform_users pu on pu.id = f.assigned_platform_user_id
		where f.platform_customer_id = $1
		order by f.due_at nulls last, f.created_at desc
		limit 100`, id)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list follow-ups.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()
	response.OK(w, map[string]any{"follow_ups": scanFollowUps(rows)}, "OK")
}

type followUpScanner interface {
	Next() bool
	Scan(dest ...any) error
}

func scanFollowUps(rows followUpScanner) []map[string]any {
	list := []map[string]any{}
	for rows.Next() {
		var id, customerID int64
		var tenantID, ticketID, assigneeID *int64
		var title, taskType, stage, outcome, nextAction, notes, customerName, assigneeName string
		var dueAt *time.Time
		var created time.Time
		if rows.Scan(&id, &customerID, &tenantID, &ticketID, &title, &taskType, &stage,
			&dueAt, &assigneeID, &outcome, &nextAction, &notes, &created, &customerName, &assigneeName) != nil {
			continue
		}
		list = append(list, map[string]any{
			"id": id, "platform_customer_id": customerID, "tenant_id": tenantID,
			"support_ticket_id": ticketID, "title": title, "task_type": taskType, "stage": stage,
			"due_at": dueAt, "assigned_platform_user_id": assigneeID, "outcome": outcome,
			"next_action": nextAction, "notes": notes, "created_at": created,
			"customer_name": customerName, "assignee_name": assigneeName,
		})
	}
	return list
}

func (s *service) createFollowUp(w http.ResponseWriter, r *http.Request) {
	tu, _ := auth.FromContext(r.Context())
	var body struct {
		PlatformCustomerID int64   `json:"platform_customer_id"`
		SupportTicketID    *int64  `json:"support_ticket_id"`
		Title              string  `json:"title"`
		TaskType           string  `json:"task_type"`
		DueAt              *string `json:"due_at"`
		Notes              string  `json:"notes"`
		AssignedPlatformUserID *int64 `json:"assigned_platform_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	title := strings.TrimSpace(body.Title)
	if body.PlatformCustomerID <= 0 || title == "" {
		response.Validation(w, map[string]string{"title": "Customer and title are required."})
		return
	}
	taskType := strings.TrimSpace(body.TaskType)
	if taskType == "" {
		taskType = "call"
	}
	c, err := s.resolveCustomer(r.Context(), body.PlatformCustomerID)
	if err != nil {
		response.Err(w, http.StatusNotFound, "Customer not found.", "ERR_NOT_FOUND")
		return
	}
	var due any
	if body.DueAt != nil && strings.TrimSpace(*body.DueAt) != "" {
		if t, err := time.Parse(time.RFC3339, strings.TrimSpace(*body.DueAt)); err == nil {
			due = t
		} else if t, err := time.Parse("2006-01-02", strings.TrimSpace(*body.DueAt)); err == nil {
			due = t
		}
	}
	var id int64
	err = s.pool.QueryRow(r.Context(), `
		insert into public.platform_follow_up_tasks (
		  platform_customer_id, tenant_id, support_ticket_id, title, task_type, stage,
		  due_at, assigned_platform_user_id, created_by_platform_user_id, notes
		) values ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9) returning id`,
		c.CustomerID, c.TenantID, body.SupportTicketID, title, taskType,
		due, body.AssignedPlatformUserID, nullIfZero(tu.PlatformUserID), strings.TrimSpace(body.Notes),
	).Scan(&id)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create follow-up.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Created.")
}

func (s *service) patchFollowUp(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	var body struct {
		Title    *string `json:"title"`
		Stage    *string `json:"stage"`
		Outcome  *string `json:"outcome"`
		NextAction *string `json:"next_action"`
		Notes    *string `json:"notes"`
		DueAt    *string `json:"due_at"`
		AssignedPlatformUserID *int64 `json:"assigned_platform_user_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	sets := []string{"updated_at = now()"}
	args := []any{}
	n := 1
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+strconv.Itoa(n))
		n++
	}
	if body.Title != nil {
		add("title", strings.TrimSpace(*body.Title))
	}
	if body.Stage != nil {
		add("stage", strings.TrimSpace(*body.Stage))
	}
	if body.Outcome != nil {
		add("outcome", strings.TrimSpace(*body.Outcome))
	}
	if body.NextAction != nil {
		add("next_action", strings.TrimSpace(*body.NextAction))
	}
	if body.Notes != nil {
		add("notes", strings.TrimSpace(*body.Notes))
	}
	if body.AssignedPlatformUserID != nil {
		add("assigned_platform_user_id", body.AssignedPlatformUserID)
	}
	if body.DueAt != nil {
		raw := strings.TrimSpace(*body.DueAt)
		if raw == "" {
			add("due_at", nil)
		} else if t, err := time.Parse(time.RFC3339, raw); err == nil {
			add("due_at", t)
		} else if t, err := time.Parse("2006-01-02", raw); err == nil {
			add("due_at", t)
		}
	}
	if len(args) == 0 {
		response.Validation(w, map[string]string{"body": "No changes."})
		return
	}
	args = append(args, id)
	_, err := s.pool.Exec(r.Context(),
		`update public.platform_follow_up_tasks set `+strings.Join(sets, ", ")+` where id = $`+strconv.Itoa(n),
		args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to update follow-up.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{"id": id}, "Updated.")
}
