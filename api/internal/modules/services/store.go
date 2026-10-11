package services

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
)

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func ensureFoundation(ctx context.Context, q querier, tenantID int64) error {
	_, err := q.Exec(ctx, `
		insert into public.svc_settings (tenant_id) values ($1)
		on conflict (tenant_id) do nothing`, tenantID)
	if err != nil {
		return err
	}
	var seeded bool
	if err := q.QueryRow(ctx, `select seeded from public.svc_settings where tenant_id = $1`, tenantID).Scan(&seeded); err != nil {
		return err
	}
	if seeded {
		return nil
	}
	defaults := []struct {
		code string
		name string
		cfg  TypeConfig
	}{
		{"consulting", "Consulting", TypeConfig{}},
		{"computer_repair", "Computer Repair", TypeConfig{EquipmentTracking: true, TechnicianRequired: true, QualityCheckRequired: true, LoadSlipRequired: true}},
		{"internal_maintenance", "Internal Maintenance", TypeConfig{Internal: true, TechnicianRequired: true}},
	}
	for _, d := range defaults {
		raw, err := json.Marshal(d.cfg)
		if err != nil {
			return err
		}
		if _, err := q.Exec(ctx, `
			insert into public.svc_service_types (tenant_id, code, name, config)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, code) do nothing`, tenantID, d.code, d.name, raw); err != nil {
			return err
		}
	}
	transitions := [][2]string{
		{"draft", "open"}, {"draft", "cancelled"},
		{"open", "scheduled"}, {"open", "in_progress"}, {"open", "cancelled"},
		{"scheduled", "in_progress"}, {"scheduled", "on_hold"}, {"scheduled", "cancelled"},
		{"in_progress", "on_hold"}, {"in_progress", "pending_qc"}, {"in_progress", "completed"}, {"in_progress", "cancelled"},
		{"on_hold", "in_progress"}, {"on_hold", "cancelled"},
		{"pending_qc", "in_progress"}, {"pending_qc", "completed"},
		{"completed", "closed"},
		{"new", "under_review"}, {"under_review", "accepted"}, {"under_review", "rejected"},
		{"under_review", "waiting_for_customer"}, {"accepted", "converted"},
		{"new", "cancelled"}, {"new", "duplicate"},
	}
	for _, tr := range transitions {
		if _, err := q.Exec(ctx, `
			insert into public.svc_status_transitions (tenant_id, from_status, to_status)
			values ($1, $2, $3)
			on conflict (tenant_id, from_status, to_status) do nothing`, tenantID, tr[0], tr[1]); err != nil {
			return err
		}
	}
	_, err = q.Exec(ctx, `update public.svc_settings set seeded = true, updated_at = now() where tenant_id = $1`, tenantID)
	return err
}

func allocate(ctx context.Context, q querier, fn string, tenantID int64, orderDate time.Time) (int, string, error) {
	var dateSeq int
	var docNo string
	err := q.QueryRow(ctx, `select date_seq, doc_no from `+fn+`($1, $2)`, tenantID, orderDate).Scan(&dateSeq, &docNo)
	return dateSeq, docNo, err
}

func loadTypeConfig(ctx context.Context, q querier, tenantID, typeID int64) (TypeConfig, error) {
	var raw []byte
	err := q.QueryRow(ctx, `
		select config from public.svc_service_types
		where id = $1 and tenant_id = $2 and is_active = true`, typeID, tenantID).Scan(&raw)
	if err != nil {
		return TypeConfig{}, err
	}
	var cfg TypeConfig
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &cfg); err != nil {
			return TypeConfig{}, err
		}
	}
	return cfg, nil
}

func transitionAllowed(ctx context.Context, q querier, tenantID int64, from, to string) (bool, error) {
	if from == to {
		return true, nil
	}
	var ok bool
	err := q.QueryRow(ctx, `
		select exists (
		  select 1 from public.svc_status_transitions
		  where tenant_id = $1 and from_status = $2 and to_status = $3
		)`, tenantID, from, to).Scan(&ok)
	return ok, err
}

func insertEvent(ctx context.Context, q querier, tenantID int64, entityType string, entityID int64, action, from, to string, actor int64, reason string) error {
	_, err := q.Exec(ctx, `
		insert into public.svc_status_events
		  (tenant_id, entity_type, entity_id, action, from_status, to_status, actor_user_id, reason)
		values ($1, $2, $3, $4, $5, $6, $7, $8)`,
		tenantID, entityType, entityID, action, from, to, actor, reason)
	return err
}

func auditSync(ctx context.Context, pool *pgxpool.Pool, tenantID, actor int64, action, target string, id int64, oldValues, newValues any) error {
	targetID := id
	return audit.LogSync(ctx, pool, tenantID, actor, action, target, &targetID, oldValues, newValues)
}

func employeeInTenant(ctx context.Context, q querier, tenantID, employeeID int64) error {
	if employeeID <= 0 {
		return nil
	}
	var id int64
	return q.QueryRow(ctx, `
		select id from public.hr_employees where id = $1 and tenant_id = $2`, employeeID, tenantID).Scan(&id)
}
