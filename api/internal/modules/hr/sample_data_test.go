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
	if regularSlips != 62 {
		t.Fatalf("regular payslips = %d", regularSlips)
	}
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_payslips ps
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pp.run_type = 'regular'
		  and pp.period_label <> 'Sample 1st quincena Apr 2099'
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
	var clientCount, siteCount, assignCount, bareSites, unlinked, terminatedAssigned int
	if err := tx.QueryRow(ctx, `
		select
		  (select count(*) from public.hr_clients c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_clients' and r.batch_id = $1),
		  (select count(*) from public.hr_client_sites s
		    join public.hr_sample_rows r on r.row_id = s.id and r.table_name = 'hr_client_sites' and r.batch_id = $1),
		  (select count(*) from public.hr_assignments a
		    join public.hr_sample_rows r on r.row_id = a.id and r.table_name = 'hr_assignments' and r.batch_id = $1),
		  (select count(*) from public.hr_client_sites s
		    join public.hr_sample_rows r on r.row_id = s.id and r.table_name = 'hr_client_sites' and r.batch_id = $1
		    where s.industry_id is null),
		  (select count(*) from public.hr_clients c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_clients' and r.batch_id = $1
		    where not exists (
		      select 1 from public.inv_partners p
		      where p.id = c.partner_id and p.tenant_id = c.tenant_id and p.partner_kind = 'customer'
		    )),
		  (select count(*) from public.hr_assignments a
		    join public.hr_employees e on e.id = a.employee_id
		    join public.hr_sample_rows r on r.row_id = e.id and r.table_name = 'hr_employees' and r.batch_id = $1
		    where e.status = 'terminated')`, batchID).Scan(
		&clientCount, &siteCount, &assignCount, &bareSites, &unlinked, &terminatedAssigned); err != nil {
		t.Fatal(err)
	}
	if clientCount != 5 || siteCount != 10 || assignCount != 20 || bareSites != 0 || unlinked != 0 || terminatedAssigned != 0 {
		t.Fatalf("clients=%d sites=%d assignments=%d bare=%d unlinked=%d terminated=%d",
			clientCount, siteCount, assignCount, bareSites, unlinked, terminatedAssigned)
	}
	var stillActive string
	if err := tx.QueryRow(ctx, `select status from public.hr_employees where id = $1`, empID).Scan(&stillActive); err != nil {
		t.Fatal(err)
	}
	if stillActive != "active" {
		t.Fatalf("assignment changed employee status to %s", stillActive)
	}
	var endedSeed int
	if err := tx.QueryRow(ctx, `
		select count(*) from public.hr_assignments a
		join public.hr_sample_rows r on r.row_id = a.id and r.table_name = 'hr_assignments' and r.batch_id = $1
		where a.end_date = '2024-06-30'`, batchID).Scan(&endedSeed); err != nil {
		t.Fatal(err)
	}
	if endedSeed != 1 {
		t.Fatalf("ended sample assignments = %d", endedSeed)
	}
	var firstBasic float64
	var firstStatutory int
	if err := tx.QueryRow(ctx, `
		select
		  coalesce(max(case when pl.line_code = 'BASIC' then pl.amount else null end), -1)::float8,
		  count(*) filter (where pl.line_code in ('SSS_EE','PHIC_EE','HDMF_EE','WHT'))
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		where pp.tenant_id = $1 and pp.period_label = 'Sample 1st quincena Apr 2099'`, tenantID).Scan(&firstBasic, &firstStatutory); err != nil {
		t.Fatal(err)
	}
	if firstBasic != 0 || firstStatutory != 0 {
		t.Fatalf("first quincena basic=%v statutory=%d", firstBasic, firstStatutory)
	}
	var secondBasic float64
	var secondStatutory int
	if err := tx.QueryRow(ctx, `
		select
		  coalesce(max(case when pl.line_code = 'BASIC' then pl.amount else null end), 0)::float8,
		  count(*) filter (where pl.line_code = 'SSS_EE')
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		where pp.tenant_id = $1 and pp.period_label = 'Sample 2nd quincena Apr 2099'`, tenantID).Scan(&secondBasic, &secondStatutory); err != nil {
		t.Fatal(err)
	}
	if secondBasic <= 0 || secondStatutory != 1 {
		t.Fatalf("second quincena basic=%v sss=%d", secondBasic, secondStatutory)
	}
	var fileCount int
	var hasSignature bool
	if err := tx.QueryRow(ctx, `
		select
		  (select count(*) from public.hr_application_files f
		    join public.hr_sample_rows r on r.row_id = f.id and r.table_name = 'hr_application_files' and r.batch_id = $1),
		  exists (
		    select 1 from public.hr_applications a
		    join public.hr_applicant_people p on p.id = a.person_id
		    where a.tenant_id = $2 and p.full_name = 'Sample Applicant pooling' and a.signature_data_url <> ''
		  )`, batchID, tenantID).Scan(&fileCount, &hasSignature); err != nil {
		t.Fatal(err)
	}
	if fileCount != 3 || !hasSignature {
		t.Fatalf("application files=%d signature=%v", fileCount, hasSignature)
	}
	var assignmentID int64
	if err := tx.QueryRow(ctx, `
		select id from public.hr_assignments
		where tenant_id = $1 and employee_id = $2 and end_date is null`, tenantID, empID).Scan(&assignmentID); err != nil {
		t.Fatal(err)
	}
	endedStatus, err := endAssignment(ctx, tx, tenantID, assignmentID, "2024-01-15")
	if err != nil {
		t.Fatal(err)
	}
	if endedStatus != "active" {
		t.Fatalf("ending an assignment set status to %s", endedStatus)
	}
	var endedOn string
	if err := tx.QueryRow(ctx, `select coalesce(end_date::text, '') from public.hr_assignments where id = $1`, assignmentID).Scan(&endedOn); err != nil {
		t.Fatal(err)
	}
	if endedOn != "2024-01-15" {
		t.Fatalf("assignment end date = %s", endedOn)
	}
	var jobOrders, requests, submitted, accepted, bills, portalUsers, magicLinks, clearances, cutoffs, holidays, dtrFromTime int
	var billTotal float64
	var clearanceStatus, docExpiry, employeeStatus string
	if err := tx.QueryRow(ctx, `
		select
		  (select count(*) from public.hr_job_orders j
		    join public.hr_sample_rows r on r.row_id = j.id and r.table_name = 'hr_job_orders' and r.batch_id = $1),
		  (select count(*) from public.hr_manpower_requests q
		    join public.hr_sample_rows r on r.row_id = q.id and r.table_name = 'hr_manpower_requests' and r.batch_id = $1),
		  (select count(*) from public.hr_client_time_submissions t
		    join public.hr_sample_rows r on r.row_id = t.id and r.table_name = 'hr_client_time_submissions' and r.batch_id = $1
		    where t.status = 'submitted' and t.accepted_hours is null and t.file_bytes is null),
		  (select count(*) from public.hr_client_time_submissions t
		    join public.hr_sample_rows r on r.row_id = t.id and r.table_name = 'hr_client_time_submissions' and r.batch_id = $1
		    where t.status = 'accepted' and t.accepted_hours = 8),
		  (select count(*) from public.hr_client_bills b
		    join public.hr_sample_rows r on r.row_id = b.id and r.table_name = 'hr_client_bills' and r.batch_id = $1),
		  (select coalesce(max(b.total),0)::float8 from public.hr_client_bills b
		    join public.hr_sample_rows r on r.row_id = b.id and r.table_name = 'hr_client_bills' and r.batch_id = $1),
		  (select count(*) from public.portal_users u
		    join public.hr_sample_rows r on r.row_id = u.id and r.table_name = 'portal_users' and r.batch_id = $1),
		  (select count(*) from public.portal_magic_links ml
		    join public.hr_sample_rows r on r.row_id = ml.portal_user_id and r.table_name = 'portal_users' and r.batch_id = $1),
		  (select count(*) from public.hr_clearances c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_clearances' and r.batch_id = $1
		    where c.status = 'pending' and c.pay_period_id is null and c.employee_id = $2),
		  (select count(*) from public.hr_pay_cutoffs c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_pay_cutoffs' and r.batch_id = $1),
		  (select count(*) from public.hr_holidays h
		    join public.hr_sample_rows r on r.row_id = h.id and r.table_name = 'hr_holidays' and r.batch_id = $1
		    where h.holiday_date = '2099-01-01' and h.name = 'Sample Holiday'),
		  (select count(*) from public.hr_dtr_entries d
		    where d.tenant_id = $3 and d.holiday_id in (
		      select row_id from public.hr_sample_rows where batch_id = $1 and table_name = 'hr_holidays'
		    ))`, batchID, empID, tenantID).Scan(
		&jobOrders, &requests, &submitted, &accepted, &bills, &billTotal, &portalUsers, &magicLinks,
		&clearances, &cutoffs, &holidays, &dtrFromTime); err != nil {
		t.Fatal(err)
	}
	if jobOrders != 10 || requests != 2 || submitted != 1 || accepted != 1 || bills != 1 || billTotal != 1200 ||
		portalUsers != 5 || magicLinks != 1 || clearances != 1 || cutoffs != 2 || holidays != 1 || dtrFromTime != 0 {
		t.Fatalf("orders=%d requests=%d submitted=%d accepted=%d bills=%d total=%v users=%d links=%d clearances=%d cutoffs=%d holidays=%d linkedDtr=%d",
			jobOrders, requests, submitted, accepted, bills, billTotal, portalUsers, magicLinks, clearances, cutoffs, holidays, dtrFromTime)
	}
	if err := tx.QueryRow(ctx, `
		select c.status, e.status
		from public.hr_clearances c
		join public.hr_employees e on e.id = c.employee_id
		join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_clearances' and r.batch_id = $1`,
		batchID).Scan(&clearanceStatus, &employeeStatus); err != nil {
		t.Fatal(err)
	}
	if clearanceStatus != "pending" || employeeStatus != "active" {
		t.Fatalf("clearance %s employee %s", clearanceStatus, employeeStatus)
	}
	if err := tx.QueryRow(ctx, `
		select coalesce(d.expires_on::text, '')
		from public.hr_employee_documents d
		join public.hr_sample_rows r on r.row_id = d.id and r.table_name = 'hr_employee_documents' and r.batch_id = $1
		where d.title = 'Sample 201 file'`, batchID).Scan(&docExpiry); err != nil {
		t.Fatal(err)
	}
	if docExpiry != "2020-01-01" {
		t.Fatalf("document expiry %s", docExpiry)
	}
	var withholding float64
	if err := tx.QueryRow(ctx, `
		select coalesce(sum(pl.amount),0)::float8
		from public.hr_payslip_lines pl
		join public.hr_payslips ps on ps.id = pl.payslip_id
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_sample_rows r on r.row_id = pp.id and r.table_name = 'hr_pay_periods' and r.batch_id = $1
		where pl.line_code = 'WHT'
		  and pp.period_start >= '2099-01-01' and pp.period_end <= '2099-12-31'`, batchID).Scan(&withholding); err != nil {
		t.Fatal(err)
	}
	if withholding <= 0 {
		t.Fatalf("2099 withholding %v", withholding)
	}
	var keeperPartner int64
	if err := tx.QueryRow(ctx, `
		select id from public.inv_partners
		where tenant_id = $1 and deleted_at is null and status = 'active'
		  and partner_kind in ('customer', 'both')
		  and company_name not like 'Sample Client %'
		order by id limit 1`, tenantID).Scan(&keeperPartner); err != nil {
		t.Fatal(err)
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
	var clientsLeft, partnersLeft, keeperPartnerLeft int
	if err := tx.QueryRow(ctx, `
		select
		  (select count(*) from public.hr_clients where tenant_id = $1 and name like 'Sample Client %'),
		  (select count(*) from public.inv_partners where tenant_id = $1 and company_name like 'Sample Client %'),
		  (select count(*) from public.inv_partners where id = $2)`, tenantID, keeperPartner).Scan(
		&clientsLeft, &partnersLeft, &keeperPartnerLeft); err != nil {
		t.Fatal(err)
	}
	if clientsLeft != 0 || partnersLeft != 0 || keeperPartnerLeft != 1 {
		t.Fatalf("after retract clients=%d partners=%d keeperPartner=%d", clientsLeft, partnersLeft, keeperPartnerLeft)
	}
	var agencyLeft int
	if err := tx.QueryRow(ctx, `
		select
		  (select count(*) from public.hr_job_orders j
		    join public.hr_sample_rows r on r.row_id = j.id and r.table_name = 'hr_job_orders' and r.batch_id = $1)
		  + (select count(*) from public.hr_client_bills b
		    join public.hr_sample_rows r on r.row_id = b.id and r.table_name = 'hr_client_bills' and r.batch_id = $1)
		  + (select count(*) from public.portal_users u
		    join public.hr_sample_rows r on r.row_id = u.id and r.table_name = 'portal_users' and r.batch_id = $1)
		  + (select count(*) from public.hr_clearances c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_clearances' and r.batch_id = $1)
		  + (select count(*) from public.hr_pay_cutoffs c
		    join public.hr_sample_rows r on r.row_id = c.id and r.table_name = 'hr_pay_cutoffs' and r.batch_id = $1)
		  + (select count(*) from public.hr_holidays h
		    join public.hr_sample_rows r on r.row_id = h.id and r.table_name = 'hr_holidays' and r.batch_id = $1)`,
		batchID).Scan(&agencyLeft); err != nil {
		t.Fatal(err)
	}
	if agencyLeft != 0 {
		t.Fatalf("sample agency rows remain: %d", agencyLeft)
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
