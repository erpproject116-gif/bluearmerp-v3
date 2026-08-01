package plans

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Plan is a configurable subscription tier/package in the platform catalog.
type Plan struct {
	ID                   int64           `json:"id"`
	PlanCode             string          `json:"plan_code"`
	DisplayName          string          `json:"display_name"`
	Description          string          `json:"description"`
	LockInMonths         int             `json:"lock_in_months"`
	RegularMonthlyAmount float64         `json:"regular_monthly_amount"`
	RegularTotalAmount   *float64        `json:"regular_total_amount,omitempty"`
	PromoMonthlyAmount   *float64        `json:"promo_monthly_amount,omitempty"`
	PromoTotalAmount     *float64        `json:"promo_total_amount,omitempty"`
	PromoLabel           string          `json:"promo_label"`
	PromoStartsAt        *time.Time      `json:"promo_starts_at,omitempty"`
	PromoEndsAt          *time.Time      `json:"promo_ends_at,omitempty"`
	Inclusions           json.RawMessage `json:"inclusions"`
	IsTrial              bool            `json:"is_trial"`
	IsDemo               bool            `json:"is_demo"`
	IsActive             bool            `json:"is_active"`
	IsPublic             bool            `json:"is_public"`
	SortOrder            int             `json:"sort_order"`
	TrialDays            int             `json:"trial_days"`
	// Computed on read:
	EffectiveMonthlyAmount float64  `json:"effective_monthly_amount"`
	EffectiveTotalAmount   *float64 `json:"effective_total_amount,omitempty"`
	PromoActive            bool     `json:"promo_active"`
}

type EffectivePrice struct {
	Monthly    float64
	Total      *float64
	PromoActive bool
	PromoLabel string
}

func EffectivePricing(p Plan, at time.Time) EffectivePrice {
	out := EffectivePrice{
		Monthly:    p.RegularMonthlyAmount,
		Total:      p.RegularTotalAmount,
		PromoLabel: p.PromoLabel,
	}
	if p.PromoMonthlyAmount == nil {
		return out
	}
	if !promoWindowOpen(p.PromoStartsAt, p.PromoEndsAt, at) {
		return out
	}
	out.PromoActive = true
	out.Monthly = *p.PromoMonthlyAmount
	if p.PromoTotalAmount != nil {
		t := *p.PromoTotalAmount
		out.Total = &t
	}
	return out
}

func promoWindowOpen(start, end *time.Time, at time.Time) bool {
	if start != nil && at.Before(*start) {
		return false
	}
	if end != nil && at.After(*end) {
		return false
	}
	return true
}

func enrichPlan(p *Plan, at time.Time) {
	ep := EffectivePricing(*p, at)
	p.EffectiveMonthlyAmount = ep.Monthly
	p.EffectiveTotalAmount = ep.Total
	p.PromoActive = ep.PromoActive
}

const planSelect = `
	select id, plan_code, display_name, description, lock_in_months,
	       regular_monthly_amount, regular_total_amount,
	       promo_monthly_amount, promo_total_amount, promo_label,
	       promo_starts_at, promo_ends_at, inclusions,
	       is_trial, is_demo, is_active, is_public, sort_order,
	       coalesce(trial_days, 0)
	from public.platform_plans`

func scanPlan(row pgx.Row) (Plan, error) {
	var p Plan
	var inclusions []byte
	err := row.Scan(
		&p.ID, &p.PlanCode, &p.DisplayName, &p.Description, &p.LockInMonths,
		&p.RegularMonthlyAmount, &p.RegularTotalAmount,
		&p.PromoMonthlyAmount, &p.PromoTotalAmount, &p.PromoLabel,
		&p.PromoStartsAt, &p.PromoEndsAt, &inclusions,
		&p.IsTrial, &p.IsDemo, &p.IsActive, &p.IsPublic, &p.SortOrder,
		&p.TrialDays,
	)
	if err != nil {
		return Plan{}, err
	}
	if len(inclusions) > 0 {
		p.Inclusions = json.RawMessage(inclusions)
	} else {
		p.Inclusions = json.RawMessage("[]")
	}
	return p, nil
}

func List(ctx context.Context, pool *pgxpool.Pool, activeOnly, publicOnly bool) ([]Plan, error) {
	q := planSelect + ` where 1=1`
	if activeOnly {
		q += ` and is_active = true`
	}
	if publicOnly {
		q += ` and is_public = true and is_trial = false and is_demo = false`
	}
	q += ` order by sort_order, id`
	rows, err := pool.Query(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := time.Now()
	out := make([]Plan, 0)
	for rows.Next() {
		p, err := scanPlan(rows)
		if err != nil {
			return nil, err
		}
		enrichPlan(&p, now)
		out = append(out, p)
	}
	return out, rows.Err()
}

func GetByID(ctx context.Context, pool *pgxpool.Pool, id int64) (Plan, error) {
	row := pool.QueryRow(ctx, planSelect+` where id = $1`, id)
	p, err := scanPlan(row)
	if err != nil {
		return Plan{}, err
	}
	enrichPlan(&p, time.Now())
	return p, nil
}

func GetByCode(ctx context.Context, pool *pgxpool.Pool, code string) (Plan, error) {
	row := pool.QueryRow(ctx, planSelect+` where plan_code = $1`, code)
	p, err := scanPlan(row)
	if err != nil {
		return Plan{}, err
	}
	enrichPlan(&p, time.Now())
	return p, nil
}

// ResolvePaidPlan loads an active paid plan by code or id for subscription activation.
func ResolvePaidPlan(ctx context.Context, pool *pgxpool.Pool, planCode string, planID int64) (Plan, EffectivePrice, error) {
	var p Plan
	var err error
	if planID > 0 {
		p, err = GetByID(ctx, pool, planID)
	} else if planCode != "" {
		p, err = GetByCode(ctx, pool, planCode)
	} else {
		return Plan{}, EffectivePrice{}, fmt.Errorf("plan_code or plan_id required")
	}
	if err != nil {
		return Plan{}, EffectivePrice{}, err
	}
	if !p.IsActive {
		return Plan{}, EffectivePrice{}, fmt.Errorf("plan is not active")
	}
	if p.IsTrial || p.IsDemo {
		return Plan{}, EffectivePrice{}, fmt.Errorf("use trial or demo provisioning for this plan")
	}
	ep := EffectivePricing(p, time.Now())
	return p, ep, nil
}

type UpsertInput struct {
	PlanCode             string
	DisplayName          string
	Description          string
	LockInMonths         int
	RegularMonthlyAmount float64
	RegularTotalAmount   *float64
	PromoMonthlyAmount   *float64
	PromoTotalAmount     *float64
	PromoLabel           string
	PromoStartsAt        *time.Time
	PromoEndsAt          *time.Time
	Inclusions           json.RawMessage
	IsTrial              bool
	IsDemo               bool
	IsActive             bool
	IsPublic             bool
	SortOrder            int
	TrialDays            int
}

func Create(ctx context.Context, pool *pgxpool.Pool, in UpsertInput) (int64, error) {
	incl := in.Inclusions
	if len(incl) == 0 {
		incl = json.RawMessage("[]")
	}
	var id int64
	err := pool.QueryRow(ctx, `
		insert into public.platform_plans (
		  plan_code, display_name, description, lock_in_months,
		  regular_monthly_amount, regular_total_amount,
		  promo_monthly_amount, promo_total_amount, promo_label,
		  promo_starts_at, promo_ends_at, inclusions,
		  is_trial, is_demo, is_active, is_public, sort_order, trial_days
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
		returning id`,
		in.PlanCode, in.DisplayName, in.Description, in.LockInMonths,
		in.RegularMonthlyAmount, in.RegularTotalAmount,
		in.PromoMonthlyAmount, in.PromoTotalAmount, in.PromoLabel,
		in.PromoStartsAt, in.PromoEndsAt, incl,
		in.IsTrial, in.IsDemo, in.IsActive, in.IsPublic, in.SortOrder, in.TrialDays,
	).Scan(&id)
	return id, err
}

func Update(ctx context.Context, pool *pgxpool.Pool, id int64, in UpsertInput) error {
	incl := in.Inclusions
	if len(incl) == 0 {
		incl = json.RawMessage("[]")
	}
	tag, err := pool.Exec(ctx, `
		update public.platform_plans set
		  display_name = $2, description = $3, lock_in_months = $4,
		  regular_monthly_amount = $5, regular_total_amount = $6,
		  promo_monthly_amount = $7, promo_total_amount = $8, promo_label = $9,
		  promo_starts_at = $10, promo_ends_at = $11, inclusions = $12,
		  is_trial = $13, is_demo = $14, is_active = $15, is_public = $16,
		  sort_order = $17, trial_days = $18, updated_at = now()
		where id = $1`,
		id, in.DisplayName, in.Description, in.LockInMonths,
		in.RegularMonthlyAmount, in.RegularTotalAmount,
		in.PromoMonthlyAmount, in.PromoTotalAmount, in.PromoLabel,
		in.PromoStartsAt, in.PromoEndsAt, incl,
		in.IsTrial, in.IsDemo, in.IsActive, in.IsPublic, in.SortOrder, in.TrialDays,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}
