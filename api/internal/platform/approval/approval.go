package approval

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type Request struct {
	ID           int64  `json:"id"`
	EntityType   string `json:"entity_type"`
	EntityID     int64  `json:"entity_id"`
	Status       string `json:"status"`
	SubmittedAt  string `json:"submitted_at"`
	SubmittedBy  string `json:"submitted_by,omitempty"`
	EntityLabel  string `json:"entity_label,omitempty"`
}

// Submit creates or resets an approval request to e_approval.
func Submit(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, entityType string, entityID int64, remarks *string) error {
	entityType = strings.TrimSpace(entityType)
	var reqID int64
	err := tx.QueryRow(ctx, `
		insert into public.approval_requests (tenant_id, entity_type, entity_id, status, submitted_by_user_id)
		values ($1, $2, $3, 'e_approval', $4)
		on conflict (tenant_id, entity_type, entity_id) do update
		  set status = 'e_approval', submitted_at = now(), submitted_by_user_id = $4, decided_at = null, decided_by_user_id = null
		returning id`, tu.TenantID, entityType, entityID, tu.AppUserID).Scan(&reqID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into public.approval_actions (request_id, action, actor_user_id, remarks, from_status, to_status)
		values ($1, 'submit', $2, $3, 'unconfirmed', 'e_approval')`, reqID, tu.AppUserID, remarks)
	return err
}

// Decide approves or rejects a pending request.
func Decide(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, entityType string, entityID int64, approve bool, remarks *string) error {
	toStatus := "confirmed"
	action := "approve"
	if !approve {
		toStatus = "unconfirmed"
		action = "reject"
	}
	var reqID int64
	var fromStatus string
	err := tx.QueryRow(ctx, `
		select id, status from public.approval_requests
		where tenant_id = $1 and entity_type = $2 and entity_id = $3 for update`,
		tu.TenantID, entityType, entityID).Scan(&reqID, &fromStatus)
	if err != nil {
		return fmt.Errorf("approval request not found")
	}
	if fromStatus != "e_approval" {
		return fmt.Errorf("not pending approval")
	}
	now := time.Now()
	_, err = tx.Exec(ctx, `
		update public.approval_requests
		set status = $1, decided_at = $2, decided_by_user_id = $3
		where id = $4`, toStatus, now, tu.AppUserID, reqID)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		insert into public.approval_actions (request_id, action, actor_user_id, remarks, from_status, to_status)
		values ($1, $2, $3, $4, $5, $6)`, reqID, action, tu.AppUserID, remarks, fromStatus, toStatus)
	return err
}

// rowQuerier is satisfied by *pgxpool.Pool and pgx.Tx.
type rowQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Status returns the approval request status for an entity. found is false when
// no approval request exists, which policy checks must treat as not approved
// (unlike IsApproved, which treats a missing request as approved).
func Status(ctx context.Context, q rowQuerier, tenantID int64, entityType string, entityID int64) (status string, found bool, err error) {
	err = q.QueryRow(ctx, `
		select status from public.approval_requests
		where tenant_id = $1 and entity_type = $2 and entity_id = $3`,
		tenantID, strings.TrimSpace(entityType), entityID).Scan(&status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, err
	}
	return status, true, nil
}

// IsApproved returns true when no approval is required or entity is confirmed.
func IsApproved(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64) (bool, error) {
	var status string
	err := pool.QueryRow(ctx, `
		select coalesce(status, 'confirmed') from public.approval_requests
		where tenant_id = $1 and entity_type = $2 and entity_id = $3`,
		tenantID, entityType, entityID).Scan(&status)
	if err != nil {
		return true, nil
	}
	return status == "confirmed", nil
}

// ListPending returns pending approval queue for tenant.
func ListPending(ctx context.Context, pool *pgxpool.Pool, tenantID int64, limit int) ([]Request, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
		select ar.id, ar.entity_type, ar.entity_id, ar.status, ar.submitted_at,
		  coalesce(u.full_name, '')
		from public.approval_requests ar
		left join public.users u on u.id = ar.submitted_by_user_id
		where ar.tenant_id = $1 and ar.status = 'e_approval'
		order by ar.submitted_at desc
		limit $2`, tenantID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Request
	for rows.Next() {
		var r Request
		var submittedAt time.Time
		if err := rows.Scan(&r.ID, &r.EntityType, &r.EntityID, &r.Status, &submittedAt, &r.SubmittedBy); err != nil {
			return nil, err
		}
		r.SubmittedAt = submittedAt.Format(time.RFC3339)
		r.EntityLabel = fmt.Sprintf("%s #%d", r.EntityType, r.EntityID)
		out = append(out, r)
	}
	return out, nil
}

// SyncEntityProgress updates progress_status on supported entity tables.
func SyncEntityProgress(ctx context.Context, tx pgx.Tx, tenantID int64, entityType string, entityID int64, progressStatus string) error {
	switch entityType {
	case "sales_order":
		_, err := tx.Exec(ctx, `
			update public.so_sales_orders set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, progressStatus, entityID, tenantID)
		return err
	case "purchase_order":
		_, err := tx.Exec(ctx, `
			update public.po_purchase_orders set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, progressStatus, entityID, tenantID)
		return err
	case "collective_invoice":
		_, err := tx.Exec(ctx, `
			update public.sa_collective_invoices set status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, progressStatus, entityID, tenantID)
		return err
	case "sa_sales":
		ps := progressStatus
		if ps == "confirmed" {
			ps = "completed"
		}
		_, err := tx.Exec(ctx, `
			update public.sa_sales set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`, ps, entityID, tenantID)
		return err
	case "fin_supplier_invoice":
		ps := progressStatus
		if ps == "confirmed" {
			ps = "completed"
		}
		_, err := tx.Exec(ctx, `
			update public.fin_supplier_invoices set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`, ps, entityID, tenantID)
		return err
	default:
		return nil
	}
}
