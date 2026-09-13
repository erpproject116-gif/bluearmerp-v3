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
	ID                    int64          `json:"id"`
	WorkspaceID           int64          `json:"workspace_id"`
	ColumnID              int64          `json:"column_id"`
	ColumnKey             string         `json:"column_key,omitempty"`
	ColumnName            string         `json:"column_name,omitempty"`
	ItemCode              *string        `json:"item_code,omitempty"`
	Title                 string         `json:"title"`
	Description           *string        `json:"description,omitempty"`
	Status                string         `json:"status"`
	Priority              string         `json:"priority"`
	AssigneeUserID        *int64         `json:"assignee_user_id,omitempty"`
	AssigneeName          string         `json:"assignee_name,omitempty"`
	PartnerID             *int64         `json:"partner_id,omitempty"`
	PartnerName           string         `json:"partner_name,omitempty"`
	StartDate             *string        `json:"start_date,omitempty"`
	EndDate               *string        `json:"end_date,omitempty"`
	StartTime             *string        `json:"start_time,omitempty"`
	EndTime               *string        `json:"end_time,omitempty"`
	AllDay                bool           `json:"all_day"`
	ReminderOffsetMinutes *int           `json:"reminder_offset_minutes,omitempty"`
	ReminderAt            *string        `json:"reminder_at,omitempty"`
	ReminderSentAt        *string        `json:"reminder_sent_at,omitempty"`
	ItemKind              string         `json:"item_kind"`
	AllHands              bool           `json:"all_hands"`
	MeetingPlace          *string        `json:"meeting_place,omitempty"`
	BlockedByItemID       *int64         `json:"blocked_by_item_id,omitempty"`
	BlockedByTitle        string         `json:"blocked_by_title,omitempty"`
	QuotationID           *int64         `json:"quotation_id,omitempty"`
	QuotationRef          string         `json:"quotation_reference,omitempty"`
	SortOrder             int            `json:"sort_order"`
	CustomValues          map[string]any `json:"custom_values,omitempty"`
}

type workItemBody struct {
	WorkspaceID           int64          `json:"workspace_id"`
	ColumnID              int64          `json:"column_id"`
	Title                 string         `json:"title"`
	Description           *string        `json:"description"`
	Status                string         `json:"status"`
	Priority              string         `json:"priority"`
	AssigneeUserID        *int64         `json:"assignee_user_id"`
	PartnerID             *int64         `json:"partner_id"`
	StartDate             *string        `json:"start_date"`
	EndDate               *string        `json:"end_date"`
	StartTime             *string        `json:"start_time"`
	EndTime               *string        `json:"end_time"`
	AllDay                *bool          `json:"all_day"`
	ReminderOffsetMinutes *int           `json:"reminder_offset_minutes"`
	BlockedByItemID       *int64         `json:"blocked_by_item_id"`
	CustomValues          map[string]any `json:"custom_values"`
}

type workItemPatchBody struct {
	ColumnID              *int64         `json:"column_id"`
	Title                 *string        `json:"title"`
	Description           *string        `json:"description"`
	Status                *string        `json:"status"`
	Priority              *string        `json:"priority"`
	AssigneeUserID        *int64         `json:"assignee_user_id"`
	PartnerID             *int64         `json:"partner_id"`
	StartDate             *string        `json:"start_date"`
	EndDate               *string        `json:"end_date"`
	StartTime             *string        `json:"start_time"`
	EndTime               *string        `json:"end_time"`
	AllDay                *bool          `json:"all_day"`
	ReminderOffsetMinutes *int           `json:"reminder_offset_minutes"`
	ReminderSentAt        *string        `json:"reminder_sent_at"`
	BlockedByItemID       *int64         `json:"blocked_by_item_id"`
	CustomValues          map[string]any `json:"custom_values"`
}

func registerWorkItemRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("operations.work_items", auth.AccessRead)).Get("/work-items", listWorkItems(pool))
	r.With(auth.RequirePermission("operations.work_items_new", auth.AccessWrite)).Post("/work-items", createWorkItem(pool))
	r.With(auth.RequirePermission("operations.work_items_new", auth.AccessWrite)).Post("/meetings", createAllHandsMeeting(pool))
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
			  wi.assignee_user_id, coalesce(u.full_name, ''),
			  wi.partner_id, coalesce(pt.company_name, ''),
			  wi.start_date::text, wi.end_date::text,
			  to_char(wi.start_time, 'HH24:MI'), to_char(wi.end_time, 'HH24:MI'),
			  wi.all_day,
			  wi.reminder_offset_minutes, wi.reminder_at::text, wi.reminder_sent_at::text,
			  wi.item_kind, wi.all_hands, wi.meeting_place,
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
					&row.StartTime, &row.EndTime, &row.AllDay,
					&row.ReminderOffsetMinutes, &row.ReminderAt, &row.ReminderSentAt,
					&row.ItemKind, &row.AllHands, &row.MeetingPlace,
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
			attachListCustom(r.Context(), pool, tu.TenantID, out)
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
				&row.StartTime, &row.EndTime, &row.AllDay,
				&row.ReminderOffsetMinutes, &row.ReminderAt, &row.ReminderSentAt,
				&row.ItemKind, &row.AllHands, &row.MeetingPlace,
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
		attachListCustom(r.Context(), pool, tu.TenantID, out)
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
		startTime, endTime, errs := parseOptionalTimes(body.StartTime, body.EndTime)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		allDay := true
		if body.AllDay != nil {
			allDay = *body.AllDay
		} else if startTime != nil {
			allDay = false
		}
		remOffset, remAt, remErrs := resolveReminder(body.ReminderOffsetMinutes, body.StartDate, startTime, allDay)
		if remErrs != nil {
			response.Validation(w, remErrs)
			return
		}
		status := defaultItemStatus(body.Status)
		priority := defaultPriority(body.Priority)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.wm_work_items (
			  tenant_id, workspace_id, column_id, title, description, status, priority,
			  assignee_user_id, partner_id, start_date, end_date, start_time, end_time, all_day,
			  reminder_offset_minutes, reminder_at, blocked_by_item_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
			returning id`,
			tu.TenantID, body.WorkspaceID, body.ColumnID, strings.TrimSpace(body.Title),
			body.Description, status, priority,
			body.AssigneeUserID, body.PartnerID, startDate, endDate, startTime, endTime, allDay,
			remOffset, remAt, body.BlockedByItemID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create work item.", "ERR_INTERNAL")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create work item.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.create", "wm_work_item", &id, nil, body)
		EmitERPEvent(r.Context(), pool, tu.TenantID, "work_item.created", map[string]any{
			"work_item_id": id, "workspace_id": body.WorkspaceID, "column_id": body.ColumnID,
			"status": status, "priority": priority, "actor_user_id": tu.AppUserID,
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
		if body.StartTime != nil {
			st, _, errs := parseOptionalTimes(body.StartTime, nil)
			if errs != nil {
				response.Validation(w, errs)
				return
			}
			sets = append(sets, fmt.Sprintf("start_time = $%d", n))
			args = append(args, st)
			n++
			if body.AllDay == nil && st != nil {
				sets = append(sets, "all_day = false")
			}
		}
		if body.EndTime != nil {
			_, et, errs := parseOptionalTimes(nil, body.EndTime)
			if errs != nil {
				response.Validation(w, errs)
				return
			}
			sets = append(sets, fmt.Sprintf("end_time = $%d", n))
			args = append(args, et)
			n++
		}
		if body.AllDay != nil {
			sets = append(sets, fmt.Sprintf("all_day = $%d", n))
			args = append(args, *body.AllDay)
			n++
		}
		if body.ReminderSentAt != nil {
			sets = append(sets, "reminder_sent_at = now()")
		}
		scheduleTouched := body.StartDate != nil || body.StartTime != nil || body.AllDay != nil || body.ReminderOffsetMinutes != nil
		if scheduleTouched {
			mergedDate := before.StartDate
			if body.StartDate != nil {
				mergedDate = body.StartDate
			}
			mergedTime := before.StartTime
			if body.StartTime != nil {
				st, _, errs := parseOptionalTimes(body.StartTime, nil)
				if errs != nil {
					response.Validation(w, errs)
					return
				}
				mergedTime = st
			}
			mergedAllDay := before.AllDay
			if body.AllDay != nil {
				mergedAllDay = *body.AllDay
			} else if body.StartTime != nil && mergedTime != nil {
				mergedAllDay = false
			}
			offset := before.ReminderOffsetMinutes
			if body.ReminderOffsetMinutes != nil {
				offset = body.ReminderOffsetMinutes
			}
			remOffset, remAt, remErrs := resolveReminder(offset, mergedDate, mergedTime, mergedAllDay)
			if remErrs != nil {
				response.Validation(w, remErrs)
				return
			}
			sets = append(sets, fmt.Sprintf("reminder_offset_minutes = $%d", n))
			args = append(args, remOffset)
			n++
			sets = append(sets, fmt.Sprintf("reminder_at = $%d", n))
			args = append(args, remAt)
			n++
			if body.ReminderOffsetMinutes != nil || body.StartDate != nil || body.StartTime != nil || body.AllDay != nil {
				sets = append(sets, "reminder_sent_at = null")
			}
		}
		if body.BlockedByItemID != nil {
			sets = append(sets, fmt.Sprintf("blocked_by_item_id = $%d", n))
			args = append(args, body.BlockedByItemID)
			n++
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		q := fmt.Sprintf(`update public.wm_work_items set %s where id = $1 and tenant_id = $2`, strings.Join(sets, ", "))
		tag, err := tx.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		if body.CustomValues != nil {
			if errs := saveCustom(r.Context(), tx, tu.TenantID, id, body.CustomValues); errs != nil {
				response.Validation(w, errs)
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update work item.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkItem(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.update", "wm_work_item", &id, before, row)
		basePayload := map[string]any{
			"work_item_id": id, "workspace_id": row.WorkspaceID,
			"column_id": row.ColumnID, "column_key": row.ColumnKey,
			"status": row.Status, "priority": row.Priority,
			"actor_user_id": tu.AppUserID,
		}
		if body.ColumnID != nil && *body.ColumnID != before.ColumnID {
			EmitERPEvent(r.Context(), pool, tu.TenantID, "work_item.column_changed", basePayload)
		}
		if body.Status != nil && defaultItemStatus(*body.Status) != before.Status {
			EmitERPEvent(r.Context(), pool, tu.TenantID, "work_item.status_changed", basePayload)
		}
		response.OK(w, row, "Updated.")
	}
}

func loadWorkItem(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (WorkItem, error) {
	var row WorkItem
	err := pool.QueryRow(ctx, `
		select wi.id, wi.workspace_id, wi.column_id, c.column_key, c.column_name,
		  wi.item_code, wi.title, wi.description, wi.status, wi.priority,
		  wi.assignee_user_id, coalesce(u.full_name, ''),
		  wi.partner_id, coalesce(pt.company_name, ''),
		  wi.start_date::text, wi.end_date::text,
		  to_char(wi.start_time, 'HH24:MI'), to_char(wi.end_time, 'HH24:MI'),
		  wi.all_day,
		  wi.reminder_offset_minutes, wi.reminder_at::text, wi.reminder_sent_at::text,
		  wi.item_kind, wi.all_hands, wi.meeting_place,
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
		&row.StartTime, &row.EndTime, &row.AllDay,
		&row.ReminderOffsetMinutes, &row.ReminderAt, &row.ReminderSentAt,
		&row.ItemKind, &row.AllHands, &row.MeetingPlace,
		&row.BlockedByItemID, &row.BlockedByTitle,
		&row.QuotationID, &row.QuotationRef,
		&row.SortOrder,
	)
	if err != nil {
		return row, err
	}
	row.CustomValues = attachCustom(ctx, pool, tenantID, id)
	return row, nil
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

// parseOptionalTimes accepts HH:MM or HH:MM:SS and returns HH:MM:SS strings for TIME columns.
// Empty string clears (nil).
func parseOptionalTimes(start, end *string) (*string, *string, map[string]string) {
	parseOne := func(raw *string, field string) (*string, map[string]string) {
		if raw == nil {
			return nil, nil
		}
		s := strings.TrimSpace(*raw)
		if s == "" {
			return nil, nil
		}
		for _, layout := range []string{"15:04", "15:04:05"} {
			if t, err := time.Parse(layout, s); err == nil {
				out := t.Format("15:04:05")
				return &out, nil
			}
		}
		return nil, map[string]string{field: "Invalid time (use HH:MM)."}
	}
	st, errs := parseOne(start, "start_time")
	if errs != nil {
		return nil, nil, errs
	}
	et, errs := parseOne(end, "end_time")
	if errs != nil {
		return nil, nil, errs
	}
	return st, et, nil
}

// resolveReminder returns offset + fire time. offset <= 0 or nil clears reminder.
func resolveReminder(offset *int, startDate *string, startTime *string, allDay bool) (*int, *time.Time, map[string]string) {
	if offset == nil || *offset <= 0 {
		return nil, nil, nil
	}
	allowed := map[int]bool{10: true, 30: true, 60: true, 1440: true}
	if !allowed[*offset] {
		return nil, nil, map[string]string{"reminder_offset_minutes": "Use 10, 30, 60, or 1440 minutes."}
	}
	if startDate == nil || strings.TrimSpace(*startDate) == "" {
		return nil, nil, map[string]string{"reminder_offset_minutes": "Start date is required for reminders."}
	}
	d, err := time.Parse("2006-01-02", strings.TrimSpace(*startDate))
	if err != nil {
		return nil, nil, map[string]string{"start_date": "Invalid date."}
	}
	start := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.Local)
	if !allDay && startTime != nil && strings.TrimSpace(*startTime) != "" {
		tStr := strings.TrimSpace(*startTime)
		for _, layout := range []string{"15:04:05", "15:04"} {
			if t, err := time.Parse(layout, tStr); err == nil {
				start = time.Date(d.Year(), d.Month(), d.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local)
				break
			}
		}
	}
	fire := start.Add(-time.Duration(*offset) * time.Minute)
	off := *offset
	return &off, &fire, nil
}
