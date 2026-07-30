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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type recurringExpensesJobResult struct {
	TenantsProcessed int `json:"tenants_processed"`
	ExpensesCreated  int `json:"expenses_created"`
}

func registerRecurringExpenseJobRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/finance/jobs/run-recurring-expenses", runRecurringExpensesJob(pool))
}

func runRecurringExpensesJob(pool *pgxpool.Pool) http.HandlerFunc {
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

		result, err := runRecurringExpensesForAllTenants(r.Context(), pool, tenantFilter)
		if err != nil {
			log.Printf("finance recurring expenses job: %v", err)
			response.Err(w, http.StatusInternalServerError, "Recurring expenses job failed.", "ERR_INTERNAL")
			return
		}
		response.OK(w, result, "Generated.")
	}
}

func runRecurringExpensesForAllTenants(ctx context.Context, pool *pgxpool.Pool, tenantFilter int64) (recurringExpensesJobResult, error) {
	var result recurringExpensesJobResult
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
		created, err := runDueRecurringExpensesForTenant(ctx, pool, tenantID, today)
		if err != nil {
			return result, err
		}
		result.ExpensesCreated += created
	}
	return result, rows.Err()
}

func runDueRecurringExpensesForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, today string) (int, error) {
	rRows, err := pool.Query(ctx, `
		select id
		from public.fin_recurring_expenses
		where tenant_id = $1
		  and deleted_at is null
		  and is_active = true
		  and next_due_date is not null
		  and next_due_date <= $2::date
		order by next_due_date, id`, tenantID, today)
	if err != nil {
		return 0, err
	}
	defer rRows.Close()

	created := 0
	for rRows.Next() {
		var recurringID int64
		if err := rRows.Scan(&recurringID); err != nil {
			return created, err
		}
		tx, err := pool.Begin(ctx)
		if err != nil {
			return created, err
		}
		_, _, _, _, genErr := generateRecurringExpenseInTx(ctx, tx, tenantID, 0, recurringID)
		if genErr != nil {
			tx.Rollback(ctx)
			log.Printf("recurring expense tenant=%d schedule=%d: %v", tenantID, recurringID, genErr)
			continue
		}
		if err := tx.Commit(ctx); err != nil {
			return created, err
		}
		created++
	}
	return created, rRows.Err()
}
