package finance

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type billMilestonesResult struct {
	TenantsProcessed int `json:"tenants_processed"`
	MilestonesBilled int `json:"milestones_billed"`
	StatusSynced     int `json:"status_synced"`
}

// RegisterJobRoutes mounts secret-protected contract billing cron endpoints.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/finance/jobs/bill-contract-milestones", billContractMilestonesJob(pool))
}

func billContractMilestonesJob(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("FINANCE_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(os.Getenv("CRM_JOB_SECRET"))
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Finance job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		hdr := strings.TrimSpace(r.Header.Get("X-Finance-Job-Secret"))
		if hdr == "" {
			hdr = strings.TrimSpace(r.Header.Get("X-CRM-Job-Secret"))
		}
		if hdr != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		tenantFilter := int64(0)
		if v := strings.TrimSpace(r.URL.Query().Get("tenant_id")); v != "" {
			var id int64
			if _, err := fmt.Sscan(v, &id); err == nil && id > 0 {
				tenantFilter = id
			}
		}

		result, err := runContractBillingJob(r.Context(), pool, tenantFilter)
		if err != nil {
			log.Printf("finance contract billing: %v", err)
			response.Err(w, http.StatusInternalServerError, "Contract billing job failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, result, "Billed.")
	}
}

func runContractBillingJob(ctx context.Context, pool *pgxpool.Pool, tenantFilter int64) (billMilestonesResult, error) {
	var result billMilestonesResult
	today := time.Now().Format("2006-01-02")

	tenantQ := `select id from public.tenants where status = 'active'`
	args := []any{}
	if tenantFilter > 0 {
		tenantQ += ` and id = $1`
		args = append(args, tenantFilter)
	}
	rows, err := pool.Query(ctx, tenantQ, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var tenantID int64
		if err := rows.Scan(&tenantID); err != nil {
			return result, err
		}
		result.TenantsProcessed++

		synced, err := syncMilestoneCollectionStatus(ctx, pool, tenantID)
		if err != nil {
			return result, err
		}
		result.StatusSynced += synced

		billed, err := billDueMilestonesForTenant(ctx, pool, tenantID, today)
		if err != nil {
			return result, err
		}
		result.MilestonesBilled += billed
	}
	return result, rows.Err()
}

func billDueMilestonesForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today string) (int, error) {
	var autoPost bool
	_ = pool.QueryRow(ctx, `
		select coalesce(contract_billing_auto_post, false)
		from public.tenant_process_policies where tenant_id = $1`, tenantID).Scan(&autoPost)

	mRows, err := pool.Query(ctx, `
		select m.id
		from public.fin_contract_milestones m
		join public.fin_contracts c on c.id = m.contract_id
		where c.tenant_id = $1
		  and c.status = 'active'
		  and m.status = 'pending'
		  and m.billed_sale_id is null
		  and m.due_date is not null
		  and m.due_date <= $2::date
		  and m.amount > 0
		order by m.due_date, m.id`, tenantID, today)
	if err != nil {
		return 0, err
	}
	defer mRows.Close()

	billed := 0
	for mRows.Next() {
		var milestoneID int64
		if err := mRows.Scan(&milestoneID); err != nil {
			return billed, err
		}
		saleID, err := sales.CreateFromContractMilestone(ctx, pool, tenantID, milestoneID, nil, autoPost)
		if err != nil {
			if err == sales.ErrContractMilestoneAlreadyBilled {
				continue
			}
			log.Printf("finance contract billing tenant=%d milestone=%d: %v", tenantID, milestoneID, err)
			continue
		}
		tag, err := pool.Exec(ctx, `
			update public.fin_contract_milestones
			set billed_sale_id = $2, status = 'billed', updated_at = now()
			where id = $1 and billed_sale_id is null`, milestoneID, saleID)
		if err != nil {
			return billed, err
		}
		if tag.RowsAffected() > 0 {
			billed++
		}
	}
	return billed, mRows.Err()
}

func syncMilestoneCollectionStatus(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int, error) {
	tag, err := pool.Exec(ctx, `
		update public.fin_contract_milestones m
		set status = 'collected', updated_at = now()
		from public.sa_sales s
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		join public.fin_contracts c on c.id = m.contract_id
		where m.billed_sale_id = s.id
		  and c.tenant_id = $1
		  and m.status = 'billed'
		  and s.deleted_at is null
		  and coalesce(recv.received, 0) >= s.grand_total - 0.0001`, tenantID)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// CountUnbilledDueMilestones returns milestones past due that have not been invoiced.
func CountUnbilledDueMilestones(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var count int64
	today := time.Now().Format("2006-01-02")
	err := pool.QueryRow(ctx, `
		select count(*)
		from public.fin_contract_milestones m
		join public.fin_contracts c on c.id = m.contract_id
		where c.tenant_id = $1
		  and c.status = 'active'
		  and m.status = 'pending'
		  and m.billed_sale_id is null
		  and m.due_date is not null
		  and m.due_date <= $2::date`, tenantID, today).Scan(&count)
	return count, err
}
