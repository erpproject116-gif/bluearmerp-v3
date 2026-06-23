package crm

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FollowUpTask struct {
	ID               int64   `json:"id"`
	TaskType         string  `json:"task_type"`
	Stage            string  `json:"stage"`
	DueDate          string  `json:"due_date"`
	PartnerID        *int64  `json:"partner_id,omitempty"`
	PicUserID        *int64  `json:"pic_user_id,omitempty"`
	PicName          string  `json:"pic_name"`
	WarrantyAssetID  *int64  `json:"warranty_asset_id,omitempty"`
	QuotationID      *int64  `json:"quotation_id,omitempty"`
	SalesID          *int64  `json:"sales_id,omitempty"`
	Title            string  `json:"title"`
	Notes            *string `json:"notes,omitempty"`
	CompletedAt      *string `json:"completed_at,omitempty"`
}

type followUpTaskBody struct {
	TaskType        string  `json:"task_type"`
	Stage           string  `json:"stage"`
	DueDate         string  `json:"due_date"`
	PartnerID       *int64  `json:"partner_id"`
	PicUserID       *int64  `json:"pic_user_id"`
	PicName         string  `json:"pic_name"`
	WarrantyAssetID *int64  `json:"warranty_asset_id"`
	QuotationID     *int64  `json:"quotation_id"`
	SalesID         *int64  `json:"sales_id"`
	Title           string  `json:"title"`
	Notes           *string `json:"notes"`
}

type followUpStageBody struct {
	Stage string `json:"stage"`
}

func registerFollowUpTaskRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/follow-up-tasks", listFollowUpTasks(pool))
	r.Post("/follow-up-tasks", createFollowUpTask(pool))
	r.Patch("/follow-up-tasks/{id}", patchFollowUpTask(pool))
	r.Patch("/follow-up-tasks/{id}/stage", patchFollowUpTaskStage(pool))
}

func scanFollowUpTask(scanner interface{ Scan(dest ...any) error }) (FollowUpTask, error) {
	var row FollowUpTask
	var due time.Time
	var completedAt *time.Time
	err := scanner.Scan(
		&row.ID, &row.TaskType, &row.Stage, &due,
		&row.PartnerID, &row.PicUserID, &row.PicName,
		&row.WarrantyAssetID, &row.QuotationID, &row.SalesID,
		&row.Title, &row.Notes, &completedAt,
	)
	if err != nil {
		return FollowUpTask{}, err
	}
	row.DueDate = dateToStr(due)
	row.CompletedAt = datePtrToStr(completedAt)
	return row, nil
}

func listFollowUpTasks(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"due_date": "t.due_date", "stage": "t.stage", "title": "t.title",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "due_date", allowed)
		offset := httputil.Offset(p)
		where := "t.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		q := r.URL.Query()
		if v := strings.TrimSpace(q.Get("stage")); v != "" {
			where += fmt.Sprintf(" and t.stage = $%d", n)
			args = append(args, v)
			n++
		}
		if v := strings.TrimSpace(q.Get("task_type")); v != "" {
			where += fmt.Sprintf(" and t.task_type = $%d", n)
			args = append(args, v)
			n++
		}
		if v := strings.TrimSpace(q.Get("partner_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"partner_id": "Invalid partner id."})
				return
			}
			where += fmt.Sprintf(" and t.partner_id = $%d", n)
			args = append(args, id)
			n++
		}
		base := fmt.Sprintf(`select t.id, t.task_type, t.stage, t.due_date,
		  t.partner_id, t.pic_user_id, t.pic_name,
		  t.warranty_asset_id, t.quotation_id, t.sales_id,
		  t.title, t.notes, t.completed_at, count(*) over()
		  from public.crm_follow_up_tasks t where %s`, where)
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "t.due_date"
		}
		query := fmt.Sprintf("%s order by %s %s limit $%d offset $%d", base, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list tasks.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []FollowUpTask
		var total int64
		for rows.Next() {
			var row FollowUpTask
			var due time.Time
			var completedAt *time.Time
			if err := rows.Scan(
				&row.ID, &row.TaskType, &row.Stage, &due,
				&row.PartnerID, &row.PicUserID, &row.PicName,
				&row.WarrantyAssetID, &row.QuotationID, &row.SalesID,
				&row.Title, &row.Notes, &completedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read tasks.", "ERR_INTERNAL")
				return
			}
			row.DueDate = dateToStr(due)
			row.CompletedAt = datePtrToStr(completedAt)
			out = append(out, row)
		}
		if out == nil {
			out = []FollowUpTask{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func defaultTaskType(t string) string {
	t = strings.TrimSpace(t)
	if t == "warranty_follow_up" || t == "quote_follow_up" {
		return t
	}
	return "manual"
}

func defaultTaskStage(s string) string {
	s = strings.TrimSpace(s)
	switch s {
	case "scheduled", "due_soon", "overdue", "completed", "cancelled":
		return s
	default:
		return "scheduled"
	}
}

func createFollowUpTask(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body followUpTaskBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if strings.TrimSpace(body.Title) == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		due, err := parseDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Use YYYY-MM-DD."})
			return
		}
		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.crm_follow_up_tasks (
			  tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
			  warranty_asset_id, quotation_id, sales_id, title, notes, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			returning id`,
			tu.TenantID, defaultTaskType(body.TaskType), defaultTaskStage(body.Stage), due,
			body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.WarrantyAssetID, body.QuotationID, body.SalesID,
			strings.TrimSpace(body.Title), body.Notes, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create task.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.task.create", "crm_follow_up_task", &id, nil, body)
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), `
			select id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
			  warranty_asset_id, quotation_id, sales_id, title, notes, completed_at
			from public.crm_follow_up_tasks where id = $1`, id))
		response.OK(w, row, "Created.")
	}
}

func patchFollowUpTask(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body followUpTaskBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		due, err := parseDate(body.DueDate)
		if err != nil {
			response.Validation(w, map[string]string{"due_date": "Use YYYY-MM-DD."})
			return
		}
		stage := defaultTaskStage(body.Stage)
		completedAt := interface{}(nil)
		if stage == "completed" {
			completedAt = time.Now()
		}
		tag, err := pool.Exec(r.Context(), `
			update public.crm_follow_up_tasks set
			  task_type = $1, stage = $2, due_date = $3,
			  partner_id = $4, pic_user_id = $5, pic_name = $6,
			  warranty_asset_id = $7, quotation_id = $8, sales_id = $9,
			  title = $10, notes = $11,
			  completed_at = case when $2 = 'completed' then coalesce(completed_at, now()) else null end,
			  updated_at = now()
			where id = $12 and tenant_id = $13`,
			defaultTaskType(body.TaskType), stage, due,
			body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.WarrantyAssetID, body.QuotationID, body.SalesID,
			strings.TrimSpace(body.Title), body.Notes, id, tu.TenantID)
		_ = completedAt
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.task.update", "crm_follow_up_task", &id, nil, body)
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), `
			select id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
			  warranty_asset_id, quotation_id, sales_id, title, notes, completed_at
			from public.crm_follow_up_tasks where id = $1`, id))
		response.OK(w, row, "Updated.")
	}
}

func patchFollowUpTaskStage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body followUpStageBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		stage := defaultTaskStage(body.Stage)
		tag, err := pool.Exec(r.Context(), `
			update public.crm_follow_up_tasks set
			  stage = $1,
			  completed_at = case when $1 = 'completed' then coalesce(completed_at, now()) else null end,
			  updated_at = now()
			where id = $2 and tenant_id = $3`, stage, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.task.stage", "crm_follow_up_task", &id, nil, body)
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), `
			select id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
			  warranty_asset_id, quotation_id, sales_id, title, notes, completed_at
			from public.crm_follow_up_tasks where id = $1`, id))
		response.OK(w, row, "Updated.")
	}
}
