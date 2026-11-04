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

func TestSampleSalesNo(t *testing.T) {
	no, err := sampleSalesNo(1)
	if err != nil || no != "SH1" {
		t.Fatalf("sales no = %s err=%v", no, err)
	}
	if _, err := sampleSalesNo(1e14); err != errSampleSalesNo {
		t.Fatalf("long sales no err = %v", err)
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
	var activeCount, regularSlips, missingStatutory, shareTokens int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_employees e
		join public.hr_sample_rows r on r.row_id = e.id and r.table_name = 'hr_employees' and r.batch_id = $1
		where e.status = 'active'`, batchID).Scan(&activeCount); err != nil {
		t.Fatal(err)
	}
	if activeCount != 20 {
		t.Fatalf("active employees = %d", activeCount)
	}
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_payslips ps
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'regular'`, batchID).Scan(&regularSlips); err != nil {
		t.Fatal(err)
	}
	if regularSlips != 60 {
		t.Fatalf("regular payslips = %d", regularSlips)
	}
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_payslips ps
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'regular'
		  and (
		    not exists (select 1 from public.hr_payslip_lines pl where pl.payslip_id = ps.id and pl.line_code = 'SSS_EE')
		    or not exists (select 1 from public.hr_payslip_lines pl where pl.payslip_id = ps.id and pl.line_code = 'PHIC_EE')
		    or not exists (select 1 from public.hr_payslip_lines pl where pl.payslip_id = ps.id and pl.line_code = 'HDMF_EE')
		    or not exists (select 1 from public.hr_payslip_lines pl where pl.payslip_id = ps.id and pl.line_code = 'WHT')
		  )`, batchID).Scan(&missingStatutory); err != nil {
		t.Fatal(err)
	}
	if missingStatutory != 0 {
		t.Fatalf("regular payslips missing statutory lines = %d", missingStatutory)
	}
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_payslip_share_tokens t
		join public.hr_payslips ps on ps.id = t.payslip_id
		join public.hr_sample_rows r on r.row_id = ps.id and r.table_name = 'hr_payslips' and r.batch_id = $1`,
		batchID).Scan(&shareTokens); err != nil {
		t.Fatal(err)
	}
	if shareTokens != 0 {
		t.Fatalf("share tokens = %d", shareTokens)
	}
	var empID int64
	var empNo, empName string
	var salary float64
	if err := tx.QueryRow(ctx, `
		select id, employee_no, full_name, base_salary::float8
		from public.hr_employees
		where tenant_id = $1 and employee_no = $2`, tenantID, fmt.Sprintf("SEEDHR-%d-01", batchID)).Scan(&empID, &empNo, &empName, &salary); err != nil {
		t.Fatal(err)
	}
	draft, err := buildEmployeePayslipDraft(ctx, tx, tenantID, empID, empNo, empName, salary,
		time.Date(2099, 1, 1, 0, 0, 0, 0, time.UTC), time.Date(2099, 1, 31, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	hasAbsence := false
	for _, ln := range draft.Lines {
		if ln.LineCode == "ABSENCE" {
			hasAbsence = true
		}
	}
	if !hasAbsence {
		t.Fatal("January draft for employee 01 has no ABSENCE line")
	}
	lineRows, err := tx.Query(ctx, `
		select pl.line_no, pl.line_code, pl.amount::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		where ps.employee_id = $1 and pp.run_type = 'regular'
		  and pp.period_start = '2099-01-01' and pp.period_end = '2099-01-31'
		order by pl.line_no`, empID)
	if err != nil {
		t.Fatal(err)
	}
	var stored []draftPayslipLine
	for lineRows.Next() {
		var ln draftPayslipLine
		if err := lineRows.Scan(&ln.LineNo, &ln.LineCode, &ln.Amount); err != nil {
			lineRows.Close()
			t.Fatal(err)
		}
		stored = append(stored, ln)
	}
	lineRows.Close()
	if len(stored) != len(draft.Lines) {
		t.Fatalf("stored lines %d != draft lines %d", len(stored), len(draft.Lines))
	}
	for i := range draft.Lines {
		if stored[i].LineCode != draft.Lines[i].LineCode || stored[i].Amount != draft.Lines[i].Amount {
			t.Fatalf("line %d stored %s %v draft %s %v", i, stored[i].LineCode, stored[i].Amount, draft.Lines[i].LineCode, draft.Lines[i].Amount)
		}
	}
	var thirteenth float64
	if err := tx.QueryRow(ctx, `
		select coalesce(sum(pl.amount),0)::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'thirteenth' and pl.line_code = 'THIRTEENTH'`, batchID).Scan(&thirteenth); err != nil {
		t.Fatal(err)
	}
	if roundMoney(thirteenth) != expectedSampleThirteenth() {
		t.Fatalf("13th month %v != %v", thirteenth, expectedSampleThirteenth())
	}
	salesNo, err := sampleSalesNo(batchID)
	if err != nil {
		t.Fatal(err)
	}
	var invoiceCount int
	var invoiceTotal float64
	var invoiceStatus string
	if err := tx.QueryRow(ctx, `
		select count(*), coalesce(max(s.grand_total),0)::float8, coalesce(max(s.progress_status),'')
		from public.sa_sales s
		join public.hr_sample_rows r on r.row_id = s.id and r.table_name = 'sa_sales' and r.batch_id = $1`,
		batchID).Scan(&invoiceCount, &invoiceTotal, &invoiceStatus); err != nil {
		t.Fatal(err)
	}
	if invoiceCount != 1 || invoiceTotal != 10000 || invoiceStatus != "unconfirmed" {
		t.Fatalf("invoice count=%d total=%v status=%s", invoiceCount, invoiceTotal, invoiceStatus)
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
	var invoiceLeft int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.sa_sales where tenant_id = $1 and sales_no = $2`, tenantID, salesNo).Scan(&invoiceLeft); err != nil {
		t.Fatal(err)
	}
	if invoiceLeft != 0 {
		t.Fatal("sample invoice remains after retract")
	}
}

func expectedSampleThirteenth() float64 {
	salaries := []float64{20000, 22000, 18000, 25000, 21000}
	var total float64
	for i := 0; i < 20; i++ {
		total += roundMoney(salaries[i%5] / 12)
	}
	return roundMoney(total)
}
