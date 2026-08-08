package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ReceiptJournalLine struct {
	ID                  int64    `json:"id,omitempty"`
	LineNo              int      `json:"line_no"`
	BankAccountID       *int64   `json:"bank_account_id,omitempty"`
	DepositAccountCode  string   `json:"deposit_account_code"`
	DepositAccountName  string   `json:"deposit_account_name"`
	GLAccountCode       string   `json:"gl_account_code"`
	GLAccountName       string   `json:"gl_account_name"`
	PartnerID           *int64   `json:"partner_id,omitempty"`
	PartnerCode         string   `json:"partner_code"`
	PartnerName         string   `json:"partner_name"`
	Amount              float64  `json:"amount"`
	Fees                float64  `json:"fees"`
	Remark              *string  `json:"remark,omitempty"`
}

type OpenReceivable struct {
	SalesID        int64   `json:"sales_id"`
	SalesNo        string  `json:"sales_no"`
	DateNoDisplay  string  `json:"date_no_display"`
	OccurrenceDate string  `json:"occurrence_date"`
	DueDate        *string `json:"due_date,omitempty"`
	Balance        float64 `json:"balance"`
	LocationName   string  `json:"location_name,omitempty"`
	ProjectName    *string `json:"project_name,omitempty"`
	DepartmentName *string `json:"department_name,omitempty"`
}

type OfficialReceiptJournal struct {
	OfficialReceipt
	AccountingSlipNo  string               `json:"accounting_slip_no"`
	CommentDetails    *string              `json:"comment_details,omitempty"`
	Remark            *string              `json:"remark,omitempty"`
	LocationID        *int64               `json:"location_id,omitempty"`
	LocationName      string               `json:"location_name,omitempty"`
	DepartmentID      *int64               `json:"department_id,omitempty"`
	DepartmentName    string               `json:"department_name,omitempty"`
	ProjectID         *int64               `json:"project_id,omitempty"`
	ProjectName       *string              `json:"project_name,omitempty"`
	PicUserID         *int64               `json:"pic_user_id,omitempty"`
	PicName           string               `json:"pic_name,omitempty"`
	UpdatedByUserID   *int64               `json:"updated_by_user_id,omitempty"`
	UpdatedByName     string               `json:"updated_by_name,omitempty"`
	JournalLines      []ReceiptJournalLine `json:"journal_lines,omitempty"`
}

type journalLineBody struct {
	LineNo             int     `json:"line_no"`
	BankAccountID      *int64  `json:"bank_account_id"`
	DepositAccountCode string  `json:"deposit_account_code"`
	DepositAccountName string  `json:"deposit_account_name"`
	GLAccountCode      string  `json:"gl_account_code"`
	GLAccountName      string  `json:"gl_account_name"`
	PartnerID          *int64  `json:"partner_id"`
	PartnerCode        string  `json:"partner_code"`
	PartnerName        string  `json:"partner_name"`
	Amount             float64 `json:"amount"`
	Fees               float64 `json:"fees"`
	Remark             *string `json:"remark"`
}

type applicationJournalBody struct {
	SalesID       int64   `json:"sales_id"`
	AppliedAmount float64 `json:"applied_amount"`
	Remark        *string `json:"remark"`
}

type receiptJournalBody struct {
	CommentDetails *string                  `json:"comment_details"`
	Notes          *string                  `json:"notes"`
	Remark         *string                  `json:"remark"`
	LocationID     *int64                   `json:"location_id"`
	DepartmentID   *int64                   `json:"department_id"`
	ProjectID      *int64                   `json:"project_id"`
	PicUserID      *int64                   `json:"pic_user_id"`
	JournalLines   []journalLineBody        `json:"journal_lines"`
	Applications   []applicationJournalBody `json:"applications"`
}

func registerReceiptJournalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/receivables/open", listOpenReceivables(pool))
	r.With(auth.RequirePermission("finance.official_receipts", auth.AccessWrite)).Patch("/official-receipts/{id}/journal", saveReceiptJournal(pool))
}

func loadReceiptJournal(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (OfficialReceiptJournal, error) {
	base, err := loadOfficialReceipt(ctx, pool, tenantID, id)
	if err != nil {
		return OfficialReceiptJournal{}, err
	}
	rec := OfficialReceiptJournal{OfficialReceipt: base}

	var receiptDate time.Time
	var locName, deptName, picName, updatedByName *string
	err = pool.QueryRow(ctx, `
		select r.accounting_slip_no, r.comment_details, r.remark,
		  r.location_id, loc.location_name, r.department_id, dept.department_name,
		  r.project_id, proj.project_name, r.pic_user_id, pic.full_name,
		  r.updated_by_user_id, upd.full_name, r.receipt_date
		from public.fin_official_receipts r
		left join public.inv_locations loc on loc.id = r.location_id
		left join public.inv_departments dept on dept.id = r.department_id
		left join public.inv_projects proj on proj.id = r.project_id
		left join public.users pic on pic.id = r.pic_user_id
		left join public.users upd on upd.id = r.updated_by_user_id
		where r.id = $1 and r.tenant_id = $2 and r.deleted_at is null`,
		id, tenantID).Scan(
		&rec.AccountingSlipNo, &rec.CommentDetails, &rec.Remark,
		&rec.LocationID, &locName, &rec.DepartmentID, &deptName,
		&rec.ProjectID, &rec.ProjectName, &rec.PicUserID, &picName,
		&rec.UpdatedByUserID, &updatedByName, &receiptDate,
	)
	if err != nil {
		return OfficialReceiptJournal{}, err
	}
	if locName != nil {
		rec.LocationName = *locName
	}
	if deptName != nil {
		rec.DepartmentName = *deptName
	}
	if picName != nil {
		rec.PicName = *picName
	}
	if updatedByName != nil {
		rec.UpdatedByName = *updatedByName
	}

	lines, err := loadJournalLines(ctx, pool, id)
	if err != nil {
		return OfficialReceiptJournal{}, err
	}
	rec.JournalLines = lines

	apps, err := loadReceiptApplicationsWithRemark(ctx, pool, tenantID, id)
	if err != nil {
		return OfficialReceiptJournal{}, err
	}
	rec.Applications = apps
	return rec, nil
}

func loadJournalLines(ctx context.Context, pool *pgxpool.Pool, receiptID int64) ([]ReceiptJournalLine, error) {
	rows, err := pool.Query(ctx, `
		select id, line_no, bank_account_id, deposit_account_code, deposit_account_name,
		  gl_account_code, gl_account_name, partner_id, partner_code, partner_name,
		  amount::float8, fees::float8, remark
		from public.fin_receipt_journal_lines
		where official_receipt_id = $1
		order by line_no`, receiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ReceiptJournalLine
	for rows.Next() {
		var ln ReceiptJournalLine
		if err := rows.Scan(
			&ln.ID, &ln.LineNo, &ln.BankAccountID, &ln.DepositAccountCode, &ln.DepositAccountName,
			&ln.GLAccountCode, &ln.GLAccountName, &ln.PartnerID, &ln.PartnerCode, &ln.PartnerName,
			&ln.Amount, &ln.Fees, &ln.Remark,
		); err != nil {
			return nil, err
		}
		out = append(out, ln)
	}
	if out == nil {
		out = []ReceiptJournalLine{}
	}
	return out, nil
}

func loadReceiptApplicationsWithRemark(ctx context.Context, pool *pgxpool.Pool, tenantID, receiptID int64) ([]ReceiptApplication, error) {
	rows, err := pool.Query(ctx, `
		select a.id, a.sales_id, s.sales_no, s.order_date, s.date_seq, s.grand_total::float8, a.applied_amount::float8
		from public.fin_receipt_applications a
		join public.sa_sales s on s.id = a.sales_id and s.tenant_id = $1 and s.deleted_at is null
		where a.official_receipt_id = $2
		order by a.id`, tenantID, receiptID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var apps []ReceiptApplication
	for rows.Next() {
		var app ReceiptApplication
		var orderDate time.Time
		var dateSeq int
		if err := rows.Scan(&app.ID, &app.SalesID, &app.SalesNo, &orderDate, &dateSeq, &app.GrandTotal, &app.AppliedAmount); err != nil {
			return nil, err
		}
		app.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
		outstanding, err := saleOutstandingAmount(ctx, pool, tenantID, app.SalesID, &receiptID)
		if err != nil {
			return nil, err
		}
		app.OutstandingAmt = outstanding + app.AppliedAmount
		apps = append(apps, app)
	}
	if apps == nil {
		apps = []ReceiptApplication{}
	}
	return apps, nil
}

func listOpenReceivables(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		partnerID, ok := optionalInt64Query(r, "partner_id")
		if !ok {
			response.Validation(w, map[string]string{"partner_id": "Customer is required."})
			return
		}
		excludeReceiptID, _ := optionalInt64Query(r, "exclude_receipt_id")

		q := `
			select s.id, s.sales_no, s.order_date, s.date_seq, s.due_date,
			  (s.grand_total - coalesce(applied.total, 0))::float8 as balance,
			  coalesce(loc.location_name, ''), coalesce(proj.project_name, ''), coalesce(dept.department_name, '')
			from public.sa_sales s
			left join public.inv_locations loc on loc.id = s.location_id
			left join public.inv_projects proj on proj.id = s.project_id
			left join public.inv_departments dept on dept.id = s.department_id
			left join lateral (
			  select coalesce(sum(a.applied_amount), 0) as total
			  from public.fin_receipt_applications a
			  join public.fin_official_receipts r on r.id = a.official_receipt_id
			  where a.sales_id = s.id and r.deleted_at is null`
		args := []any{tu.TenantID, *partnerID}
		if excludeReceiptID != nil {
			q += ` and r.id <> $3`
			args = append(args, *excludeReceiptID)
		}
		q += `
			) applied on true
			where s.tenant_id = $1 and s.partner_id = $2 and s.deleted_at is null
			  and (s.grand_total - coalesce(applied.total, 0)) > 0.0001
			order by s.order_date desc, s.id desc`

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load receivables.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []OpenReceivable
		for rows.Next() {
			var row OpenReceivable
			var orderDate time.Time
			var dateSeq int
			var dueDate *time.Time
			if err := rows.Scan(&row.SalesID, &row.SalesNo, &orderDate, &dateSeq, &dueDate, &row.Balance,
				&row.LocationName, &row.ProjectName, &row.DepartmentName); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read receivables.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			row.OccurrenceDate = dateToStr(orderDate)
			if dueDate != nil {
				d := dateToStr(*dueDate)
				row.DueDate = &d
			}
			out = append(out, row)
		}
		if out == nil {
			out = []OpenReceivable{}
		}
		response.OK(w, out, "OK")
	}
}

func saveReceiptJournal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if blockIfPosted(w, r, pool, tu.TenantID, "official_receipt", id, "Editing") {
			return
		}
		var body receiptJournalBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		before, _ := loadReceiptJournal(r.Context(), pool, tu.TenantID, id)

		var partnerID int64
		err = pool.QueryRow(r.Context(), `
			select partner_id from public.fin_official_receipts
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&partnerID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Official receipt not found.", "ERR_NOT_FOUND")
			return
		}

		lineTotal := sumJournalLineAmounts(body.JournalLines)
		appTotal := sumJournalApplicationAmounts(body.Applications)
		amountTotal := lineTotal
		if appTotal > amountTotal {
			amountTotal = appTotal
		}
		if len(body.JournalLines) > 0 && math.Abs(lineTotal-amountTotal) > 0.01 {
			response.Validation(w, map[string]string{"journal_lines": "Journal line amounts must equal receipt total."})
			return
		}
		if amountTotal <= 0 {
			response.Validation(w, map[string]string{"amount_total": "Receipt total must be greater than zero."})
			return
		}

		appBodies := make([]applicationBody, len(body.Applications))
		for i, a := range body.Applications {
			appBodies[i] = applicationBody{SalesID: a.SalesID, AppliedAmount: a.AppliedAmount}
		}
		if errs := validateApplications(r.Context(), pool, tu.TenantID, partnerID, appBodies, &id); errs != nil {
			response.Validation(w, errs)
			return
		}
		if appTotal > amountTotal+0.01 {
			response.Validation(w, map[string]string{"applications": "Total applied amount exceeds receipt total."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save journal.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.fin_official_receipts set
			  notes = $1, comment_details = $2, remark = $3,
			  location_id = $4, department_id = $5, project_id = $6, pic_user_id = $7,
			  amount_total = $8, updated_by_user_id = $9, updated_at = now()
			where id = $10 and tenant_id = $11 and deleted_at is null`,
			body.Notes, body.CommentDetails, body.Remark,
			body.LocationID, body.DepartmentID, body.ProjectID, body.PicUserID,
			amountTotal, tu.AppUserID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Official receipt not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := tx.Exec(r.Context(), `delete from public.fin_receipt_journal_lines where official_receipt_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update journal lines.", "ERR_INTERNAL")
			return
		}
		for _, ln := range body.JournalLines {
			if err := insertJournalLine(r.Context(), tx, id, ln); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save journal lines.", "ERR_INTERNAL")
				return
			}
		}

		if _, err := tx.Exec(r.Context(), `delete from public.fin_receipt_applications where official_receipt_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update applications.", "ERR_INTERNAL")
			return
		}
		if err := lockAndCheckReceiptApplications(r.Context(), tx, tu.TenantID, id, appBodies); err != nil {
			respondApplicationSaveError(w, err)
			return
		}
		for _, app := range body.Applications {
			if _, err := tx.Exec(r.Context(), `
				insert into public.fin_receipt_applications (official_receipt_id, sales_id, applied_amount, remark)
				values ($1, $2, $3, $4)`, id, app.SalesID, app.AppliedAmount, app.Remark); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save applications.", "ERR_INTERNAL")
				return
			}
		}

		glStatus := ""
		if len(body.JournalLines) > 0 {
			var receiptDate time.Time
			_ = tx.QueryRow(r.Context(), `
				select receipt_date from public.fin_official_receipts
				where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&receiptDate)
			ev := withEntryDate(buildORPostingEvent(tu.TenantID, id, body.JournalLines), receiptDate)
			var postErr error
			glStatus, postErr = postWithJournalPoster(r.Context(), tx, tu.TenantID, ev)
			if postErr != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post journal entry.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		rec, _ := loadReceiptJournal(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.receipt.journal.update", "fin_official_receipt", &id, before, rec)
		msg := "Updated."
		switch glStatus {
		case "audit_only":
			msg = "Updated. Not on Trial Balance yet — enable Official Receipt auto-post under Finance setup, or post the journal manually."
		case "draft":
			msg = "Updated. Journal entry created as draft — post it under Journal Entries for Trial Balance."
		case "posted":
			msg = "Updated. Journal posted to the general ledger."
		}
		response.OK(w, rec, msg)
	}
}

func insertJournalLine(ctx context.Context, tx pgx.Tx, receiptID int64, ln journalLineBody) error {
	lineNo := ln.LineNo
	if lineNo <= 0 {
		return fmt.Errorf("invalid line_no")
	}
	_, err := tx.Exec(ctx, `
		insert into public.fin_receipt_journal_lines (
		  official_receipt_id, line_no, bank_account_id,
		  deposit_account_code, deposit_account_name,
		  gl_account_code, gl_account_name,
		  partner_id, partner_code, partner_name,
		  amount, fees, remark
		) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
		receiptID, lineNo, ln.BankAccountID,
		strings.TrimSpace(ln.DepositAccountCode), strings.TrimSpace(ln.DepositAccountName),
		strings.TrimSpace(ln.GLAccountCode), strings.TrimSpace(ln.GLAccountName),
		ln.PartnerID, strings.TrimSpace(ln.PartnerCode), strings.TrimSpace(ln.PartnerName),
		ln.Amount, ln.Fees, ln.Remark)
	return err
}

func sumJournalLineAmounts(lines []journalLineBody) float64 {
	var t float64
	for _, ln := range lines {
		t += ln.Amount
	}
	return t
}

func sumJournalApplicationAmounts(apps []applicationJournalBody) float64 {
	var t float64
	for _, a := range apps {
		t += a.AppliedAmount
	}
	return t
}
