package operations

import (
	"context"
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

type WorkItem struct {
	ID               int64   `json:"id"`
	WorkspaceID      int64   `json:"workspace_id"`
	ColumnID         int64   `json:"column_id"`
	ColumnKey        string  `json:"column_key,omitempty"`
	ColumnName       string  `json:"column_name,omitempty"`
	ItemCode         *string `json:"item_code,omitempty"`
	Title            string  `json:"title"`
	Description      *string `json:"description,omitempty"`
	Status           string  `json:"status"`
	Priority         string  `json:"priority"`
	AssigneeUserID   *int64  `json:"assignee_user_id,omitempty"`
	AssigneeName     string  `json:"assignee_name,omitempty"`
	PartnerID        *int64  `json:"partner_id,omitempty"`
	PartnerName      string  `json:"partner_name,omitempty"`
	StartDate        *string `json:"start_date,omitempty"`
	EndDate          *string `json:"end_date,omitempty"`
	BlockedByItemID  *int64  `json:"blocked_by_item_id,omitempty"`
	BlockedByTitle   string  `json:"blocked_by_title,omitempty"`
	QuotationID      *int64  `json:"quotation_id,omitempty"`
	QuotationRef     string  `json:"quotation_reference,omitempty"`
	SortOrder        int     `json:"sort_order"`
}

type workItemBody struct {
	WorkspaceID     int64   `json:"workspace_id"`
	ColumnID        int64   `json:"column_id"`
	Title           string  `json:"title"`
	Description     *string `json:"description"`
	Status          string  `json:"status"`
	Priority        string  `json:"priority"`
	AssigneeUserID  *int64  `json:"assignee_user_id"`
	PartnerID       *int64  `json:"partner_id"`
	StartDate       *string `json:"start_date"`
	EndDate         *string `json:"end_date"`
	BlockedByItemID *int64  `json:"blocked_by_item_id"`
}

type workItemPatchBody struct {
	ColumnID        *int64  `json:"column_id"`
	Title           *string `json:"title"`
	Description     *string `json:"description"`
	Status          *string `json:"status"`
	Priority        *string `json:"priority"`
	AssigneeUserID  *int64  `json:"assignee_user_id"`
	PartnerID       *int64  `json:"partner_id"`
	StartDate       *string `json:"start_date"`
	EndDate         *string `json:"end_date"`
	BlockedByItemID *int64  `json:"blocked_by_item_id"`
}

func registerWorkItemRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("operations.work_items", auth.AccessRead)).Get("/work-items", listWorkItems(pool))
	r.With(auth.RequirePermission("operations.work_items_new", auth.AccessWrite)).Post("/work-items", createWorkItem(pool))
	r.With(auth.RequirePermission("operations.work_items", auth.AccessRead)).Get("/work-items/{id}", getWorkItem(pool))
	r.With(auth.RequirePermission("operations.work_items", auth.AccessWrite)).Patch("/work-items/{id}", patchWorkItem(pool))
	r.With(auth.RequirePermission("operations.create_quotation", auth.AccessWrite)).Post("/work-items/{id}/create-quotation", createQuotationFromWorkItem(pool))
}

func listWorkItems(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"title": "wi.title", "status": "wi.status", "priority": "wi.priority",
		"start_date": "wi.start_date", "end_date": "wi.end_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "title", allowed)
		if p.Order == "" {
			p.Order = "asc"
		}
		board := r.URL.Query().Get("board") == "1" || r.URL.Query().Get("board") == "true"
		calendar := r.URL.Query().Get("view") == "calendar"
		timeline := r.URL.Query().Get("view") == "timeline"
		boardView := board || calendar || timeline
		if boardView {
			wsID, err := strconv.ParseInt(r.URL.Query().Get("workspace_id"), 10, 64)
			if err != nil || wsID <= 0 {
				response.Validation(w, map[string]string{"workspace_id": "Workspace is required for board, calendar, and timeline views."})
				return
			}
			p.Page = 1
			if p.PageSize <= 0 || p.PageSize > 200 {
				p.PageSize = 200
			}
		}
		offset := httputil.Offset(p)
		where := "wi.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if wsID, err := strconv.ParseInt(r.URL.Query().Get("workspace_id"), 10, 64); err == nil && wsID > 0 {
			where += fmt.Sprintf(" and wi.workspace_id = $%d", n)
			args = append(args, wsID)
			n++
		}
		if colID, err := strconv.ParseInt(r.URL.Query().Get("column_id"), 10, 64); err == nil && colID > 0 {
			where += fmt.Sprintf(" and wi.column_id = $%d", n)
			args = append(args, colID)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and wi.title ilike $%d", n)
			args = append(args, "%"+q+"%")
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			if calendar || timeline {
				sortCol = "wi.start_date"
			} else {
				sortCol = "wi.sort_order"
			}
		}
		baseSelect := `
			select wi.id, wi.workspace_id, wi.column_id, c.column_key, c.column_name,
			  wi.item_code, wi.title, wi.description, wi.status, wi.priority,
			  wi.assignee_user_id, coalesce(u.display_name, ''),
			  wi.partner_id, coalesce(pt.company_name, ''),
			  wi.start_date::text, wi.end_date::text,
			  wi.blocked_by_item_id, coalesce(blocker.title, ''),
			  wi.quotation_id, coalesce(q.reference_no, ''),
			  wi.sort_order`
		if boardView {
			q := fmt.Sprintf(`%s
			from public.wm_work_items wi
			join public.wm_columns c on c.id = wi.column_id
			left join public.users u on u.id = wi.assignee_user_id
			left join public.inv_partners pt on pt.id = wi.partner_id
			left join public.wm_work_items blocker on blocker.id = wi.blocked_by_item_id
			left join public.quo_quotations q on q.id = wi.quotation_id
			where %s
			order by %s %s, wi.id
			limit $%d offset $%d`, baseSelect, where, sortCol, orderSQL(p.Order), n, n+1)
			args = append(args, p.PageSize, offset)

			rows, err := pool.Query(r.Context(), q, args...)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list work items.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []WorkItem
			for rows.Next() {
				var row WorkItem
				if err := rows.Scan(
					&row.ID, &row.WorkspaceID, &row.ColumnID, &row.ColumnKey, &row.ColumnName,
					&row.ItemCode, &row.Title, &row.Description, &row.Status, &row.Priority,
					&row.AssigneeUserID, &row.AssigneeName,
					&row.PartnerID, &row.PartnerName,
					&row.StartDate, &row.EndDate,
					&row.BlockedByItemID, &row.BlockedByTitle,
					&row.QuotationID, &row.QuotationRef,
					&row.SortOrder,
				); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read work items.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []WorkItem{}
			}
			response.OKList(w, out, p.Page, p.PageSize, int64(len(out)))
			return
		}

		q := fmt.Sprintf(`%s, count(*) over()
			from public.wm_work_items wi
			join public.wm_columns c on c.id = wi.column_id
			left join public.users u on u.id = wi.assignee_user_id
			left join public.inv_partners pt on pt.id = wi.partner_id
			left join public.wm_work_items blocker on blocker.id = wi.blocked_by_item_id
			left join public.quo_quotations q on q.id = wi.quotation_id
			where %s
			order by %s %s, wi.id
			limit $%d offset $%d`, baseSelect, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list work items.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []WorkItem
		var total int64
		for rows.Next() {
			var row WorkItem
			if err := rows.Scan(
				&row.ID, &row.WorkspaceID, &row.ColumnID, &row.ColumnKey, &row.ColumnName,
				&row.ItemCode, &row.Title, &row.Description, &row.Status, &row.Priority,
				&row.AssigneeUserID, &row.AssigneeName,
				&row.PartnerID, &row.PartnerName,
				&row.StartDate, &row.EndDate,
				&row.BlockedByItemID, &row.BlockedByTitle,
				&row.QuotationID, &row.QuotationRef,
				&row.SortOrder, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read work items.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []WorkItem{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getWorkItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createWorkItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body workItemBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateWorkItemBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		if !workspaceBelongsToTenant(r.Context(), pool, tu.TenantID, body.WorkspaceID) {
			response.Validation(w, map[string]string{"workspace_id": "Workspace not found."})
			return
		}
		startDate, endDate, errs := parseOptionalDates(body.StartDate, body.EndDate)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		status := defaultItemStatus(body.Status)
		priority := defaultPriority(body.Priority)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.wm_work_items (
			  tenant_id, workspace_id, column_id, title, description, status, priority,
			  assignee_user_id, partner_id, start_date, end_date, blocked_by_item_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			returning id`,
			tu.TenantID, body.WorkspaceID, body.ColumnID, strings.TrimSpace(body.Title),
			body.Description, status, priority,
			body.AssigneeUserID, body.PartnerID, startDate, endDate, body.BlockedByItemID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create work item.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.create", "wm_work_item", &id, nil, body)
		EmitERPEvent(r.Context(), tu.TenantID, "operations.work_item.created", map[string]any{
			"work_item_id": id, "workspace_id": body.WorkspaceID,
		})
		response.OK(w, row, "Created.")
	}
}

func patchWorkItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		before, err := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		var body workItemPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.ColumnID != nil {
			sets = append(sets, fmt.Sprintf("column_id = $%d", n))
			args = append(args, *body.ColumnID)
			n++
		}
		if body.Title != nil {
			sets = append(sets, fmt.Sprintf("title = $%d", n))
			args = append(args, strings.TrimSpace(*body.Title))
			n++
		}
		if body.Description != nil {
			sets = append(sets, fmt.Sprintf("description = $%d", n))
			args = append(args, body.Description)
			n++
		}
		if body.Status != nil {
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, defaultItemStatus(*body.Status))
			n++
		}
		if body.Priority != nil {
			sets = append(sets, fmt.Sprintf("priority = $%d", n))
			args = append(args, defaultPriority(*body.Priority))
			n++
		}
		if body.AssigneeUserID != nil {
			sets = append(sets, fmt.Sprintf("assignee_user_id = $%d", n))
			args = append(args, body.AssigneeUserID)
			n++
		}
		if body.PartnerID != nil {
			sets = append(sets, fmt.Sprintf("partner_id = $%d", n))
			args = append(args, body.PartnerID)
			n++
		}
		if body.StartDate != nil {
			sd, ed, errs := parseOptionalDates(body.StartDate, nil)
			if errs != nil {
				response.Validation(w, errs)
				return
			}
			sets = append(sets, fmt.Sprintf("start_date = $%d", n))
			args = append(args, sd)
			n++
			_ = ed
		}
		if body.EndDate != nil {
			_, ed, errs := parseOptionalDates(nil, body.EndDate)
			if errs != nil {
				response.Validation(w, errs)
				return
			}
			sets = append(sets, fmt.Sprintf("end_date = $%d", n))
			args = append(args, ed)
			n++
		}
		if body.BlockedByItemID != nil {
			sets = append(sets, fmt.Sprintf("blocked_by_item_id = $%d", n))
			args = append(args, body.BlockedByItemID)
			n++
		}
		q := fmt.Sprintf(`update public.wm_work_items set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.update", "wm_work_item", &id, before, row)
		if body.ColumnID != nil {
			EmitERPEvent(r.Context(), tu.TenantID, "operations.work_item.column_changed", map[string]any{
				"work_item_id": id, "column_id": *body.ColumnID,
			})
		}
		response.OK(w, row, "Updated.")
	}
}

func loadWorkItem(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (WorkItem, error) {
	var row WorkItem
	err := pool.QueryRow(ctx, `
		select wi.id, wi.workspace_id, wi.column_id, c.column_key, c.column_name,
		  wi.item_code, wi.title, wi.description, wi.status, wi.priority,
		  wi.assignee_user_id, coalesce(u.display_name, ''),
		  wi.partner_id, coalesce(pt.company_name, ''),
		  wi.start_date::text, wi.end_date::text,
		  wi.blocked_by_item_id, coalesce(blocker.title, ''),
		  wi.quotation_id, coalesce(q.reference_no, ''),
		  wi.sort_order
		from public.wm_work_items wi
		join public.wm_columns c on c.id = wi.column_id
		left join public.users u on u.id = wi.assignee_user_id
		left join public.inv_partners pt on pt.id = wi.partner_id
		left join public.wm_work_items blocker on blocker.id = wi.blocked_by_item_id
		left join public.quo_quotations q on q.id = wi.quotation_id
		where wi.id = $1 and wi.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.WorkspaceID, &row.ColumnID, &row.ColumnKey, &row.ColumnName,
		&row.ItemCode, &row.Title, &row.Description, &row.Status, &row.Priority,
		&row.AssigneeUserID, &row.AssigneeName,
		&row.PartnerID, &row.PartnerName,
		&row.StartDate, &row.EndDate,
		&row.BlockedByItemID, &row.BlockedByTitle,
		&row.QuotationID, &row.QuotationRef,
		&row.SortOrder,
	)
	return row, err
}

func validateWorkItemBody(body workItemBody) map[string]string {
	errs := map[string]string{}
	if body.WorkspaceID <= 0 {
		errs["workspace_id"] = "Workspace is required."
	}
	if body.ColumnID <= 0 {
		errs["column_id"] = "Column is required."
	}
	if strings.TrimSpace(body.Title) == "" {
		errs["title"] = "Title is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultItemStatus(s string) string {
	s = strings.TrimSpace(s)
	switch s {
	case "in_progress", "done", "blocked":
		return s
	default:
		return "open"
	}
}

func defaultPriority(s string) string {
	s = strings.TrimSpace(s)
	switch s {
	case "low", "high", "urgent":
		return s
	default:
		return "normal"
	}
}

func parseOptionalDates(start, end *string) (*time.Time, *time.Time, map[string]string) {
	var sd, ed *time.Time
	if start != nil && strings.TrimSpace(*start) != "" {
		d, err := time.Parse("2006-01-02", strings.TrimSpace(*start))
		if err != nil {
			return nil, nil, map[string]string{"start_date": "Invalid date."}
		}
		sd = &d
	}
	if end != nil && strings.TrimSpace(*end) != "" {
		d, err := time.Parse("2006-01-02", strings.TrimSpace(*end))
		if err != nil {
			return nil, nil, map[string]string{"end_date": "Invalid date."}
		}
		ed = &d
	}
	return sd, ed, nil
}
