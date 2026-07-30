package approval

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AmountPolicy holds an active threshold for entity approval gating.
type AmountPolicy struct {
	EntityType       string  `json:"entity_type"`
	ThresholdAmount  float64 `json:"threshold_amount"`
	IsActive         bool    `json:"is_active"`
}

// LoadAmountPolicy returns the tenant threshold for an entity type when configured and active.
func LoadAmountPolicy(ctx context.Context, q rowQuerier, tenantID int64, entityType string) (AmountPolicy, bool, error) {
	var p AmountPolicy
	err := q.QueryRow(ctx, `
		select entity_type, threshold_amount::float8, is_active
		from public.fin_approval_amount_policies
		where tenant_id = $1 and entity_type = $2 and is_active = true`,
		tenantID, entityType).Scan(&p.EntityType, &p.ThresholdAmount, &p.IsActive)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AmountPolicy{}, false, nil
		}
		return AmountPolicy{}, false, err
	}
	return p, true, nil
}

// RequiresAmountApproval reports whether amount meets or exceeds the configured threshold.
func RequiresAmountApproval(ctx context.Context, q rowQuerier, tenantID int64, entityType string, amount float64) (bool, float64, error) {
	p, ok, err := LoadAmountPolicy(ctx, q, tenantID, entityType)
	if err != nil || !ok {
		return false, 0, err
	}
	return amount >= p.ThresholdAmount, p.ThresholdAmount, nil
}

// ListAmountPolicies returns all tenant amount-threshold policies.
func ListAmountPolicies(ctx context.Context, pool *pgxpool.Pool, tenantID int64) ([]AmountPolicy, error) {
	rows, err := pool.Query(ctx, `
		select entity_type, threshold_amount::float8, is_active
		from public.fin_approval_amount_policies
		where tenant_id = $1
		order by entity_type`, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AmountPolicy
	for rows.Next() {
		var p AmountPolicy
		if err := rows.Scan(&p.EntityType, &p.ThresholdAmount, &p.IsActive); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	if out == nil {
		out = []AmountPolicy{}
	}
	return out, nil
}

// UpsertAmountPolicy saves a tenant amount-threshold policy.
func UpsertAmountPolicy(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, threshold float64, active bool) error {
	_, err := pool.Exec(ctx, `
		insert into public.fin_approval_amount_policies (tenant_id, entity_type, threshold_amount, is_active)
		values ($1, $2, $3, $4)
		on conflict (tenant_id, entity_type) do update set
		  threshold_amount = excluded.threshold_amount,
		  is_active = excluded.is_active,
		  updated_at = now()`, tenantID, entityType, threshold, active)
	return err
}
