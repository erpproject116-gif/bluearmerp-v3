package creditlimit

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
)

// ValidatePartnerCredit blocks new exposure when credit limit is enforced.
func ValidatePartnerCredit(ctx context.Context, db interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID, partnerID int64, additionalAmount float64) (map[string]string, error) {
	var enforce bool
	var creditLimit *float64
	var onHold bool
	err := db.QueryRow(ctx, `
		select coalesce(tp.sales_enforce_credit_limit, false),
		  p.credit_limit::float8, coalesce(p.credit_limit_on_hold, false)
		from public.inv_partners p
		left join public.tenant_process_policies tp on tp.tenant_id = p.tenant_id
		where p.tenant_id = $1 and p.id = $2`, tenantID, partnerID).Scan(&enforce, &creditLimit, &onHold)
	if err != nil {
		return nil, err
	}
	if !enforce {
		return nil, nil
	}
	if onHold {
		return map[string]string{"partner_id": "Customer is on credit hold."}, nil
	}
	if creditLimit == nil {
		return nil, nil
	}
	var openAR float64
	_ = db.QueryRow(ctx, `
		select coalesce(sum(s.grand_total - coalesce(recv.received, 0)), 0)::float8
		from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where s.tenant_id = $1 and s.partner_id = $2 and s.deleted_at is null`,
		tenantID, partnerID).Scan(&openAR)
	if openAR+additionalAmount > *creditLimit+0.0001 {
		return map[string]string{
			"partner_id": fmt.Sprintf("Credit limit exceeded (limit %.2f, open %.2f).", *creditLimit, openAR),
		}, nil
	}
	return nil, nil
}

// ValidateFromPolicy loads policy then validates.
func ValidateFromPolicy(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, additionalAmount float64) (map[string]string, error) {
	p, err := processpolicy.Load(ctx, pool, tenantID)
	if err != nil {
		return map[string]string{"body": "Failed to load policies."}, err
	}
	if !p.SalesEnforceCreditLimit {
		return nil, nil
	}
	return ValidatePartnerCredit(ctx, pool, tenantID, partnerID, additionalAmount)
}
