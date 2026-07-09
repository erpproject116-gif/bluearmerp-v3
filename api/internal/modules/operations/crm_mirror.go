package operations

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const crmFollowUpWorkspaceCode = "crm-follow-up"

var crmFollowUpColumns = []IndustryColumn{
	{Key: "scheduled", Name: "Scheduled", SortOrder: 0, Color: "#94a3b8"},
	{Key: "due_soon", Name: "Due soon", SortOrder: 10, Color: "#fbbf24"},
	{Key: "overdue", Name: "Overdue", SortOrder: 20, Color: "#ef4444"},
	{Key: "follow_up", Name: "Follow-up", SortOrder: 30, Color: "#3b82f6"},
	{Key: "forwarded_sales", Name: "Forwarded to sales", SortOrder: 40, Color: "#8b5cf6"},
	{Key: "completed", Name: "Completed", SortOrder: 50, Color: "#22c55e"},
	{Key: "cancelled", Name: "Cancelled", SortOrder: 60, Color: "#94a3b8"},
	{Key: "closed", Name: "Closed", SortOrder: 70, Color: "#64748b"},
}

type crmFollowUpTaskRow struct {
	ID                int64
	Stage             string
	DueDate           time.Time
	PartnerID         *int64
	PicUserID         *int64
	QuotationID       *int64
	SalesID           *int64
	PurchaseRequestID *int64
	Title             string
	Notes             *string
}

// MirrorCRMFollowUpTask upserts a wm_work_items row linked via legacy_crm_task_id.
func MirrorCRMFollowUpTask(ctx context.Context, pool *pgxpool.Pool, tenantID, taskID int64) error {
	task, err := loadCRMFollowUpTask(ctx, pool, tenantID, taskID)
	if err != nil {
		return err
	}
	workspaceID, columnIDs, err := ensureCRMFollowUpWorkspace(ctx, pool, tenantID)
	if err != nil {
		return err
	}
	stage := normalizeCRMStage(task.Stage)
	colID, ok := columnIDs[stage]
	if !ok {
		colID = columnIDs["scheduled"]
	}
	status := crmStageToWorkStatus(stage)

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var workItemID int64
	err = tx.QueryRow(ctx, `
		select id from public.wm_work_items
		where tenant_id = $1 and legacy_crm_task_id = $2`,
		tenantID, taskID,
	).Scan(&workItemID)
	if err != nil && err != pgx.ErrNoRows {
		return err
	}

	endDate := task.DueDate
	desc := task.Notes
	if err == pgx.ErrNoRows {
		err = tx.QueryRow(ctx, `
			insert into public.wm_work_items (
			  tenant_id, workspace_id, column_id, title, description, status, priority,
			  assignee_user_id, partner_id, start_date, end_date, quotation_id, legacy_crm_task_id
			) values ($1, $2, $3, $4, $5, $6, 'normal', $7, $8, null, $9, $10, $11)
			returning id`,
			tenantID, workspaceID, colID, strings.TrimSpace(task.Title), desc, status,
			task.PicUserID, task.PartnerID, endDate, task.QuotationID, taskID,
		).Scan(&workItemID)
	} else {
		_, err = tx.Exec(ctx, `
			update public.wm_work_items set
			  workspace_id = $1, column_id = $2, title = $3, description = $4, status = $5,
			  assignee_user_id = $6, partner_id = $7, end_date = $8, quotation_id = $9,
			  updated_at = now()
			where id = $10 and tenant_id = $11`,
			workspaceID, colID, strings.TrimSpace(task.Title), desc, status,
			task.PicUserID, task.PartnerID, endDate, task.QuotationID, workItemID, tenantID,
		)
	}
	if err != nil {
		return err
	}

	if _, err := tx.Exec(ctx, `delete from public.wm_links where work_item_id = $1`, workItemID); err != nil {
		return err
	}
	if err := insertWorkItemLink(ctx, tx, workItemID, "crm_follow_up_task", taskID); err != nil {
		return err
	}
	if task.SalesID != nil && *task.SalesID > 0 {
		if err := insertWorkItemLink(ctx, tx, workItemID, "sales", *task.SalesID); err != nil {
			return err
		}
	}
	if task.PurchaseRequestID != nil && *task.PurchaseRequestID > 0 {
		if err := insertWorkItemLink(ctx, tx, workItemID, "purchase_request", *task.PurchaseRequestID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func SyncAllCRMFollowUpTasks(ctx context.Context, pool *pgxpool.Pool) (int, error) {
	rows, err := pool.Query(ctx, `
		select tenant_id, id from public.crm_follow_up_tasks
		order by tenant_id, id`)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	synced := 0
	for rows.Next() {
		var tenantID, taskID int64
		if err := rows.Scan(&tenantID, &taskID); err != nil {
			return synced, err
		}
		if err := MirrorCRMFollowUpTask(ctx, pool, tenantID, taskID); err != nil {
			return synced, fmt.Errorf("mirror task %d: %w", taskID, err)
		}
		synced++
	}
	return synced, rows.Err()
}

func loadCRMFollowUpTask(ctx context.Context, pool *pgxpool.Pool, tenantID, taskID int64) (crmFollowUpTaskRow, error) {
	var row crmFollowUpTaskRow
	err := pool.QueryRow(ctx, `
		select id, stage, due_date, partner_id, pic_user_id,
		  quotation_id, sales_id, purchase_request_id, title, notes
		from public.crm_follow_up_tasks
		where id = $1 and tenant_id = $2`, taskID, tenantID,
	).Scan(
		&row.ID, &row.Stage, &row.DueDate, &row.PartnerID, &row.PicUserID,
		&row.QuotationID, &row.SalesID, &row.PurchaseRequestID, &row.Title, &row.Notes,
	)
	return row, err
}

func ensureCRMFollowUpWorkspace(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, map[string]int64, error) {
	var workspaceID int64
	err := pool.QueryRow(ctx, `
		select id from public.wm_workspaces
		where tenant_id = $1 and workspace_code = $2`,
		tenantID, crmFollowUpWorkspaceCode,
	).Scan(&workspaceID)
	if err == nil {
		cols, err := loadColumns(ctx, pool, workspaceID)
		if err != nil {
			return 0, nil, err
		}
		columnIDs := map[string]int64{}
		for _, c := range cols {
			columnIDs[c.ColumnKey] = c.ID
		}
		return workspaceID, columnIDs, nil
	}
	if err != pgx.ErrNoRows {
		return 0, nil, err
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, nil, err
	}
	defer tx.Rollback(ctx)

	var invProjectID int64
	invProjectID, _, err = allocateInventoryProject(ctx, tx, tenantID, "CRM Follow-up")
	if err != nil {
		return 0, nil, err
	}

	var jobCostProjectID int64
	jobCostProjectID, err = createJobCostProject(ctx, tx, tenantID, crmFollowUpWorkspaceCode, "CRM Follow-up", invProjectID)
	if err != nil {
		return 0, nil, err
	}

	if err := tx.QueryRow(ctx, `
		insert into public.wm_workspaces (
		  tenant_id, workspace_code, workspace_name, industry_pack,
		  inv_project_id, job_cost_project_id, status
		) values ($1, $2, 'CRM Follow-up', null, $3, $4, 'active')
		returning id`,
		tenantID, crmFollowUpWorkspaceCode, invProjectID, jobCostProjectID,
	).Scan(&workspaceID); err != nil {
		return 0, nil, err
	}

	columnIDs := map[string]int64{}
	for _, col := range crmFollowUpColumns {
		var colID int64
		if err := tx.QueryRow(ctx, `
			insert into public.wm_columns (workspace_id, column_key, column_name, sort_order, column_color)
			values ($1, $2, $3, $4, $5)
			returning id`,
			workspaceID, col.Key, col.Name, col.SortOrder, nullIfBlank(col.Color),
		).Scan(&colID); err != nil {
			return 0, nil, err
		}
		columnIDs[col.Key] = colID
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, nil, err
	}
	return workspaceID, columnIDs, nil
}

func insertWorkItemLink(ctx context.Context, tx pgx.Tx, workItemID int64, docType string, docID int64) error {
	_, err := tx.Exec(ctx, `
		insert into public.wm_links (work_item_id, link_type, doc_type, doc_id)
		values ($1, 'related', $2, $3)`,
		workItemID, docType, docID,
	)
	return err
}

func normalizeCRMStage(stage string) string {
	switch strings.TrimSpace(stage) {
	case "scheduled", "due_soon", "overdue", "follow_up", "forwarded_sales", "completed", "cancelled", "closed":
		return strings.TrimSpace(stage)
	default:
		return "scheduled"
	}
}

func crmStageToWorkStatus(stage string) string {
	switch stage {
	case "completed", "closed", "cancelled":
		return "done"
	case "follow_up", "forwarded_sales":
		return "in_progress"
	default:
		return "open"
	}
}
