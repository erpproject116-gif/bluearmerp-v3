package finance

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type trialBalanceRow struct {
	AccountID   int64   `json:"account_id"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	AccountType string  `json:"account_type"`
	TotalDebit  float64 `json:"total_debit"`
	TotalCredit float64 `json:"total_credit"`
	Balance     float64 `json:"balance"`
}

type generalLedgerRow struct {
	EntryDate   string  `json:"entry_date"`
	EntryNo     string  `json:"entry_no"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	PartyName   string  `json:"party_name,omitempty"`
	Remarks     string  `json:"remarks,omitempty"`
}

type trialBalanceListPayload struct {
	Rows           []trialBalanceRow `json:"rows"`
	HasJournalData bool              `json:"has_journal_data"`
}

type generalLedgerListPayload struct {
	Rows           []generalLedgerRow `json:"rows"`
	HasJournalData bool               `json:"has_journal_data"`
}

type financialStatementRow struct {
	AccountID   int64   `json:"account_id"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	AccountType string  `json:"account_type"`
	Amount      float64 `json:"amount"`
}

type financialStatementPayload struct {
	Rows           []financialStatementRow `json:"rows"`
	TotalAmount    float64                 `json:"total_amount"`
	HasJournalData bool                    `json:"has_journal_data"`
}

func registerFinancialReportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/reports", func(rr chi.Router) {
		rr.Get("/trial-balance/export", exportTrialBalance(pool))
		rr.Get("/trial-balance", listTrialBalance(pool))
		rr.Get("/general-ledger/export", exportGeneralLedger(pool))
		rr.Get("/general-ledger", listGeneralLedger(pool))
		rr.Get("/profit-and-loss/export", exportProfitAndLoss(pool))
		rr.Get("/profit-and-loss", listProfitAndLoss(pool))
		rr.Get("/balance-sheet/export", exportBalanceSheet(pool))
		rr.Get("/balance-sheet", listBalanceSheet(pool))
	})
}

func journalDataExists(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `
		select exists(
		  select 1 from public.fin_journal_entries
		  where tenant_id = $1 and status = 'posted'
		)`, tenantID).Scan(&exists)
	return exists, err
}

func trialBalanceSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := "je.tenant_id = $1 and je.status = 'posted'"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select a.id, a.account_code, a.account_name, a.account_type,
		  coalesce(sum(l.debit), 0)::float8,
		  coalesce(sum(l.credit), 0)::float8,
		  coalesce(sum(l.debit - l.credit), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		where %s
		group by a.id, a.account_code, a.account_name, a.account_type`, where)
	return q, args
}

func listTrialBalance(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"account_code": "account_code", "balance": "balance",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		hasData, err := journalDataExists(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check journal data.", "ERR_INTERNAL")
			return
		}
		p := httputil.ParseListParams(r, "account_code", allowed)
		offset := httputil.Offset(p)
		base, args := trialBalanceSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []trialBalanceRow
		for rows.Next() {
			var row trialBalanceRow
			if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.AccountType,
				&row.TotalDebit, &row.TotalCredit, &row.Balance); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []trialBalanceRow{}
		}
		response.OKList(w, trialBalanceListPayload{Rows: out, HasJournalData: hasData}, p.Page, p.PageSize, total)
	}
}

func exportTrialBalance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := trialBalanceSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by account_code asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="trial-balance.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Account Code", "Account Name", "Type", "Debit", "Credit", "Balance"})
		for rows.Next() {
			var row trialBalanceRow
			if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.AccountType,
				&row.TotalDebit, &row.TotalCredit, &row.Balance); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.AccountCode, row.AccountName, row.AccountType,
				fmt.Sprintf("%.4f", row.TotalDebit), fmt.Sprintf("%.4f", row.TotalCredit), fmt.Sprintf("%.4f", row.Balance),
			})
		}
		cw.Flush()
	}
}

func generalLedgerSQL(tenantID int64, dateFrom, dateTo *time.Time) (string, []any) {
	args := []any{tenantID}
	where := "je.tenant_id = $1 and je.status = 'posted'"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	q := fmt.Sprintf(`
		select je.entry_date::text, je.entry_no,
		  a.account_code, a.account_name,
		  l.debit::float8, l.credit::float8,
		  coalesce(p.company_name, ''), coalesce(l.remarks, '')
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		left join public.inv_partners p on p.id = l.party_id
		where %s`, where)
	return q, args
}

func listGeneralLedger(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"entry_date": "entry_date", "entry_no": "entry_no", "account_code": "account_code",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		hasData, err := journalDataExists(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check journal data.", "ERR_INTERNAL")
			return
		}
		p := httputil.ParseListParams(r, "entry_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		base, args := generalLedgerSQL(tu.TenantID, dateFrom, dateTo)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []generalLedgerRow
		for rows.Next() {
			var row generalLedgerRow
			if err := rows.Scan(&row.EntryDate, &row.EntryNo, &row.AccountCode, &row.AccountName,
				&row.Debit, &row.Credit, &row.PartyName, &row.Remarks); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []generalLedgerRow{}
		}
		response.OKList(w, generalLedgerListPayload{Rows: out, HasJournalData: hasData}, p.Page, p.PageSize, total)
	}
}

func exportGeneralLedger(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := generalLedgerSQL(tu.TenantID, dateFrom, dateTo)
		q := fmt.Sprintf("select * from (%s) sub order by entry_date desc, entry_no asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="general-ledger.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Date", "Entry No", "Account", "Account Name", "Debit", "Credit", "Party", "Remarks"})
		for rows.Next() {
			var row generalLedgerRow
			if err := rows.Scan(&row.EntryDate, &row.EntryNo, &row.AccountCode, &row.AccountName,
				&row.Debit, &row.Credit, &row.PartyName, &row.Remarks); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.EntryDate, row.EntryNo, row.AccountCode, row.AccountName,
				fmt.Sprintf("%.4f", row.Debit), fmt.Sprintf("%.4f", row.Credit), row.PartyName, row.Remarks,
			})
		}
		cw.Flush()
	}
}

func statementSQL(tenantID int64, dateFrom, dateTo *time.Time, accountTypes []string) (string, []any) {
	args := []any{tenantID}
	where := "je.tenant_id = $1 and je.status = 'posted'"
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
		args = append(args, *dateFrom, *dateTo)
	}
	typeList := "'" + strings.Join(accountTypes, "','") + "'"
	q := fmt.Sprintf(`
		select a.id, a.account_code, a.account_name, a.account_type,
		  coalesce(sum(l.debit - l.credit), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		join public.fin_accounts a on a.id = l.account_id
		where %s and a.account_type in (%s)
		group by a.id, a.account_code, a.account_name, a.account_type
		having coalesce(sum(l.debit - l.credit), 0) <> 0`, where, typeList)
	return q, args
}

func listFinancialStatement(pool *pgxpool.Pool, accountTypes []string, invertSign bool) http.HandlerFunc {
	allowed := map[string]string{
		"account_code": "account_code", "amount": "amount",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		hasData, err := journalDataExists(r.Context(), pool, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check journal data.", "ERR_INTERNAL")
			return
		}
		p := httputil.ParseListParams(r, "account_code", allowed)
		offset := httputil.Offset(p)
		base, args := statementSQL(tu.TenantID, dateFrom, dateTo, accountTypes)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count report.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []financialStatementRow
		var totalAmount float64
		for rows.Next() {
			var row financialStatementRow
			if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.Amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			if invertSign {
				row.Amount = -row.Amount
			}
			totalAmount += row.Amount
			out = append(out, row)
		}
		if out == nil {
			out = []financialStatementRow{}
		}
		response.OKList(w, financialStatementPayload{Rows: out, TotalAmount: totalAmount, HasJournalData: hasData}, p.Page, p.PageSize, total)
	}
}

func listProfitAndLoss(pool *pgxpool.Pool) http.HandlerFunc {
	return listFinancialStatement(pool, []string{"income", "expense"}, true)
}

func listBalanceSheet(pool *pgxpool.Pool) http.HandlerFunc {
	return listFinancialStatement(pool, []string{"asset", "liability", "equity"}, false)
}

func exportFinancialStatement(pool *pgxpool.Pool, accountTypes []string, invertSign bool, filename string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		base, args := statementSQL(tu.TenantID, dateFrom, dateTo, accountTypes)
		q := fmt.Sprintf("select * from (%s) sub order by account_code asc limit %d", base, reports.ExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Account Code", "Account Name", "Type", "Amount"})
		for rows.Next() {
			var row financialStatementRow
			if err := rows.Scan(&row.AccountID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.Amount); err != nil {
				return
			}
			if invertSign {
				row.Amount = -row.Amount
			}
			_ = cw.Write([]string{
				row.AccountCode,
				row.AccountName,
				row.AccountType,
				fmt.Sprintf("%.4f", row.Amount),
			})
		}
		cw.Flush()
	}
}

func exportProfitAndLoss(pool *pgxpool.Pool) http.HandlerFunc {
	return exportFinancialStatement(pool, []string{"income", "expense"}, true, "profit-and-loss.csv")
}

func exportBalanceSheet(pool *pgxpool.Pool) http.HandlerFunc {
	return exportFinancialStatement(pool, []string{"asset", "liability", "equity"}, false, "balance-sheet.csv")
}
