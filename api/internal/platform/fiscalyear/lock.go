package fiscalyear

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// Querier is satisfied by *pgxpool.Pool and pgx.Tx.
type Querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// ClosedYearCode returns the year_code of a closed fiscal year that contains
// entryDate, or "" when none exists.
func ClosedYearCode(ctx context.Context, q Querier, tenantID int64, entryDate time.Time) (string, error) {
	var code string
	err := q.QueryRow(ctx, `
		select year_code from public.fin_fiscal_years
		where tenant_id = $1 and is_closed = true
		  and start_date <= $2::date and end_date >= $2::date
		order by start_date desc limit 1`, tenantID, entryDate).Scan(&code)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return code, nil
}

// ClosedPeriodCode returns the period_code of a closed fiscal period that contains
// entryDate, or "" when none exists.
func ClosedPeriodCode(ctx context.Context, q Querier, tenantID int64, entryDate time.Time) (string, error) {
	var code string
	err := q.QueryRow(ctx, `
		select period_code from public.fin_fiscal_periods
		where tenant_id = $1 and is_closed = true
		  and start_date <= $2::date and end_date >= $2::date
		order by start_date desc limit 1`, tenantID, entryDate).Scan(&code)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", nil
		}
		return "", err
	}
	return code, nil
}

// ErrIfClosed returns a user-facing error when entryDate falls in a closed
// fiscal year or closed fiscal period.
func ErrIfClosed(ctx context.Context, q Querier, tenantID int64, entryDate time.Time) error {
	yearCode, err := ClosedYearCode(ctx, q, tenantID, entryDate)
	if err != nil {
		return err
	}
	if yearCode != "" {
		return fmt.Errorf("fiscal year %s is closed; reopen it under Fiscal years before posting to this date", yearCode)
	}
	periodCode, err := ClosedPeriodCode(ctx, q, tenantID, entryDate)
	if err != nil {
		return err
	}
	if periodCode != "" {
		return fmt.Errorf("fiscal period %s is closed; reopen it under Fiscal years before posting to this date", periodCode)
	}
	return nil
}
