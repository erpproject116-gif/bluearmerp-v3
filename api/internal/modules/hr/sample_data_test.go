package hr

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

func TestThirteenthSampleAmount(t *testing.T) {
	if roundMoney(12000/12) != 1000 {
		t.Fatalf("13th month amount = %v", roundMoney(12000/12))
	}
	basics := []float64{20000, 22000, 18000, 25000, 21000}
	var total float64
	for _, basic := range basics {
		total += roundMoney(basic / 12)
	}
	if total <= 0 {
		t.Fatal("sample 13th month total is empty")
	}
}

func TestSampleEmployeeExcludeSQL(t *testing.T) {
	sql := sampleEmployeeExcludeSQL("e")
	if !strings.Contains(sql, "hr_sample_rows") || !strings.Contains(sql, "e.id") || !strings.Contains(sql, "retracted_at is null") {
		t.Fatalf("exclusion SQL = %s", sql)
	}
}

func TestSampleSeedRetract(t *testing.T) {
	cfg := config.Load()
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		t.Skip("database not configured")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	var tenantID int64
	if err := pool.QueryRow(ctx, `select id from public.tenants where status = 'active' order by id limit 1`).Scan(&tenantID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			t.Skip("no active tenant")
		}
		t.Skipf("database unavailable: %v", err)
	}
	var reg *string
	if err := pool.QueryRow(ctx, `select to_regclass('public.hr_sample_batches')::text`).Scan(&reg); err != nil || reg == nil {
		t.Skip("migration 339 is not applied")
	}
	var templateID int64
	err = pool.QueryRow(ctx, `select id from public.hr_review_templates where tenant_id = $1 and code = 'LMSI_5'`, tenantID).Scan(&templateID)
	if errors.Is(err, pgx.ErrNoRows) {
		t.Skip("LMSI_5 template is missing")
	}
	if err != nil {
		t.Fatal(err)
	}
	var openBatch int64
	err = pool.QueryRow(ctx, `select id from public.hr_sample_batches where tenant_id = $1 and retracted_at is null`, tenantID).Scan(&openBatch)
	if err == nil {
		t.Skip("an HR sample batch is already open")
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal(err)
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	var journalsBefore int
	if err := tx.QueryRow(ctx, `select count(*) from public.fin_journal_entries`).Scan(&journalsBefore); err != nil {
		t.Fatal(err)
	}
	batchID, err := seedHRSample(ctx, tx, tenantID)
	if err != nil {
		t.Fatal(err)
	}
	var journalsAfter int
	if err := tx.QueryRow(ctx, `select count(*) from public.fin_journal_entries`).Scan(&journalsAfter); err != nil {
		t.Fatal(err)
	}
	if journalsAfter != journalsBefore {
		t.Fatalf("seed created %d journal rows", journalsAfter-journalsBefore)
	}
	var hiredEmployees int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_employees
		where tenant_id = $1 and full_name = 'Sample Applicant Hired'`, tenantID).Scan(&hiredEmployees); err != nil {
		t.Fatal(err)
	}
	if hiredEmployees != 0 {
		t.Fatal("hired application created an employee")
	}
	var thirteenth float64
	var basic float64
	if err := tx.QueryRow(ctx, `
		select coalesce(sum(pl.amount),0)::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'thirteenth' and pl.line_code = 'THIRTEENTH'`, batchID).Scan(&thirteenth); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `
		select coalesce(sum(pl.amount),0)::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'regular' and pl.line_code = 'BASIC'`, batchID).Scan(&basic); err != nil {
		t.Fatal(err)
	}
	if roundMoney(thirteenth) != roundMoney(basic/12) && !thirteenthClose(thirteenth, basic) {
		t.Fatalf("13th month %v is not basic %v / 12", thirteenth, basic)
	}

	keeperNo := fmt.Sprintf("KEEP-%d", time.Now().UnixNano())
	var keeperID int64
	if err := tx.QueryRow(ctx, `
		insert into public.hr_employees (tenant_id, employee_no, full_name, department, job_title, hire_date, status, base_salary)
		values ($1,$2,'Sample Keeper','','Keeper',current_date,'active',1) returning id`, tenantID, keeperNo).Scan(&keeperID); err != nil {
		t.Fatal(err)
	}
	if err := retractHRSample(ctx, tx, tenantID); err != nil {
		t.Fatal(err)
	}
	var keeperLeft int
	if err := tx.QueryRow(ctx, `select count(*) from public.hr_employees where id = $1`, keeperID).Scan(&keeperLeft); err != nil {
		t.Fatal(err)
	}
	if keeperLeft != 1 {
		t.Fatal("retract deleted an employee outside the sample batch")
	}
	var sampleLeft int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_employees
		where tenant_id = $1 and employee_no like $2`, tenantID, fmt.Sprintf("SEEDHR-%d-%%", batchID)).Scan(&sampleLeft); err != nil {
		t.Fatal(err)
	}
	if sampleLeft != 0 {
		t.Fatal("sample employees remain after retract")
	}
}

func thirteenthClose(thirteenth, basic float64) bool {
	perEmployee := roundMoney(20000/12) + roundMoney(22000/12) + roundMoney(18000/12) + roundMoney(25000/12) + roundMoney(21000/12)
	return roundMoney(thirteenth) == roundMoney(perEmployee) && roundMoney(basic) == 106000
}
