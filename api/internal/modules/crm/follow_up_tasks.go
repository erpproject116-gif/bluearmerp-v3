package crm

import (
	"context"
	"encoding/json"
	"errors"
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
	ID                 int64   `json:"id"`
	TaskType           string  `json:"task_type"`
	Stage              string  `json:"stage"`
	DueDate            string  `json:"due_date"`
	PartnerID          *int64  `json:"partner_id,omitempty"`
	PartnerName        string  `json:"partner_name,omitempty"`
	PicUserID          *int64  `json:"pic_user_id,omitempty"`
	PicName            string  `json:"pic_name"`
	WarrantyAssetID    *int64  `json:"warranty_asset_id,omitempty"`
	WarrantySerial     string  `json:"warranty_serial,omitempty"`
	QuotationID        *int64  `json:"quotation_id,omitempty"`
	QuotationReference string  `json:"quotation_reference,omitempty"`
	SalesID            *int64  `json:"sales_id,omitempty"`
	SalesNo            string  `json:"sales_no,omitempty"`
	Title              string  `json:"title"`
	Notes              *string `json:"notes,omitempty"`
	CompletedAt        *string `json:"completed_at,omitempty"`
}

const followUpTaskFrom = `
  from public.crm_follow_up_tasks t
  left join public.inv_partners p on p.id = t.partner_id
  left join public.crm_warranty_assets wa on wa.id = t.warranty_asset_id
  left join public.quo_quotations q on q.id = t.quotation_id
  left join public.sa_sales s on s.id = t.sales_id`

const followUpTaskSelect = `
  select t.id, t.task_type, t.stage, t.due_date,
    t.partner_id, coalesce(p.company_name, ''),
    t.pic_user_id, t.pic_name,
    t.warranty_asset_id, coalesce(wa.serial_no, ''),
    t.quotation_id, coalesce(q.reference_no, ''),
    t.sales_id, coalesce(s.sales_no, ''),
    t.title, t.notes, t.completed_at`

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
		&row.PartnerID, &row.PartnerName,
		&row.PicUserID, &row.PicName,
		&row.WarrantyAssetID, &row.WarrantySerial,
		&row.QuotationID, &row.QuotationReference,
		&row.SalesID, &row.SalesNo,
		&row.Title, &row.Notes, &completedAt,
	)
	if err != nil {
		return FollowUpTask{}, err
	}
	row.DueDate = dateToStr(due)
	row.CompletedAt = datePtrToStr(completedAt)
	return row, nil
}

func scanFollowUpTaskList(scanner interface{ Scan(dest ...any) error }) (FollowUpTask, int64, error) {
	var row FollowUpTask
	var due time.Time
	var completedAt *time.Time
	var total int64
	err := scanner.Scan(
		&row.ID, &row.TaskType, &row.Stage, &due,
		&row.PartnerID, &row.PartnerName,
		&row.PicUserID, &row.PicName,
		&row.WarrantyAssetID, &row.WarrantySerial,
		&row.QuotationID, &row.QuotationReference,
		&row.SalesID, &row.SalesNo,
		&row.Title, &row.Notes, &completedAt, &total,
	)
	if err != nil {
		return FollowUpTask{}, 0, err
	}
	row.DueDate = dateToStr(due)
	row.CompletedAt = datePtrToStr(completedAt)
	return row, total, nil
}

func followUpTaskByIDQuery() string {
	return followUpTaskSelect + followUpTaskFrom + " where t.id = $1"
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
		scope, n := tu.PicOrCreatedScopeSQL("t", n, &args)
		where += scope
		base := fmt.Sprintf(`%s, count(*) over() %s where %s`, followUpTaskSelect, followUpTaskFrom, where)
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
			row, rowTotal, err := scanFollowUpTaskList(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read tasks.", "ERR_INTERNAL")
				return
			}
			total = rowTotal
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
		picUserID, picName, picErr := resolveTaskAssignee(r.Context(), pool, tu, body.PicUserID, body.PicName)
		if picErr != nil {
			response.Err(w, http.StatusForbidden, picErr.Error(), "ERR_FORBIDDEN")
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
			body.PartnerID, picUserID, picName,
			body.WarrantyAssetID, body.QuotationID, body.SalesID,
			strings.TrimSpace(body.Title), body.Notes, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create task.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.task.create", "crm_follow_up_task", &id, nil, body)
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), followUpTaskByIDQuery(), id))
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
		if !tu.CanViewAllCRM() {
			var picID, createdBy *int64
			_ = pool.QueryRow(r.Context(), `
				select pic_user_id, created_by_user_id from public.crm_follow_up_tasks
				where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&picID, &createdBy)
			if !tu.CanAccessPicRecord(picID, createdBy) {
				response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
				return
			}
		}
		picUserID, picName, picErr := resolveTaskAssignee(r.Context(), pool, tu, body.PicUserID, body.PicName)
		if picErr != nil {
			response.Err(w, http.StatusForbidden, picErr.Error(), "ERR_FORBIDDEN")
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
			body.PartnerID, picUserID, picName,
			body.WarrantyAssetID, body.QuotationID, body.SalesID,
			strings.TrimSpace(body.Title), body.Notes, id, tu.TenantID)
		_ = completedAt
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.task.update", "crm_follow_up_task", &id, nil, body)
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), followUpTaskByIDQuery(), id))
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
		if !tu.CanViewAllCRM() {
			var picID, createdBy *int64
			_ = pool.QueryRow(r.Context(), `
				select pic_user_id, created_by_user_id from public.crm_follow_up_tasks
				where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&picID, &createdBy)
			if !tu.CanAccessPicRecord(picID, createdBy) {
				response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
				return
			}
		}
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
		row, _ := scanFollowUpTask(pool.QueryRow(r.Context(), followUpTaskByIDQuery(), id))
		response.OK(w, row, "Updated.")
	}
}

func resolveTaskAssignee(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, picUserID *int64, picName string) (*int64, string, error) {
	if tu.CanManageSalesTeam() {
		if picUserID != nil && *picUserID > 0 {
			var name string
			err := pool.QueryRow(ctx, `
				select u.full_name from public.users u
				join public.tenant_roles tr
				  on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role and tr.is_active = true
				where u.id = $1 and u.tenant_id = $2 and u.status = 'active'
				  and tr.can_view_crm = true and not tr.can_view_all_crm`,
				*picUserID, tu.TenantID).Scan(&name)
			if err != nil {
				return nil, "", errors.New("Assignee must be an active sales team member.")
			}
			if strings.TrimSpace(picName) != "" {
				return picUserID, strings.TrimSpace(picName), nil
			}
			return picUserID, name, nil
		}
		if strings.TrimSpace(picName) != "" {
			return &tu.AppUserID, strings.TrimSpace(picName), nil
		}
		return &tu.AppUserID, tu.FullName, nil
	}
	if picUserID != nil && *picUserID != tu.AppUserID {
		return nil, "", errors.New("You can only assign tasks to yourself.")
	}
	name := strings.TrimSpace(picName)
	if name == "" {
		name = tu.FullName
	}
	return &tu.AppUserID, name, nil
}
