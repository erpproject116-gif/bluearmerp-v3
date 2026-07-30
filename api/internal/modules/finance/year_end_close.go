package finance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type yearEndCloseBody struct {
	FiscalYearID              int64   `json:"fiscal_year_id"`
	RetainedEarningsAccountCode *string `json:"retained_earnings_account_code"`
	LockPeriods               bool    `json:"lock_periods"`
}

func registerYearEndCloseRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.fiscal_years", auth.AccessWrite)).Post("/year-end-close", runYearEndClose(pool))
	r.With(auth.RequirePermission("finance.fiscal_years", auth.AccessRead)).Get("/year-end-closings", listYearEndClosings(pool))
}

func listYearEndClosings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select c.id, c.fiscal_year_id, fy.year_code, c.journal_entry_id, c.net_income::float8,
			  c.periods_locked, c.created_at::text
			from public.fin_year_end_closings c
			join public.fin_fiscal_years fy on fy.id = c.fiscal_year_id
			where c.tenant_id = $1
			order by c.created_at desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list year-end closings.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []map[string]any
		for rows.Next() {
			var id, fyID, jeID int64
			var yearCode string
			var netIncome float64
			var periodsLocked bool
			var createdAt string
			_ = rows.Scan(&id, &fyID, &yearCode, &jeID, &netIncome, &periodsLocked, &createdAt)
			out = append(out, map[string]any{
				"id": id, "fiscal_year_id": fyID, "year_code": yearCode,
				"journal_entry_id": jeID, "net_income": netIncome,
				"periods_locked": periodsLocked, "created_at": createdAt,
			})
		}
		if out == nil {
			out = []map[string]any{}
		}
		response.OK(w, out, "OK")
	}
}

func runYearEndClose(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body yearEndCloseBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.FiscalYearID <= 0 {
			response.Validation(w, map[string]string{"fiscal_year_id": "Fiscal year is required."})
			return
		}
		var startDate, endDate time.Time
		var yearCode string
		var isClosed bool
		err := pool.QueryRow(r.Context(), `
			select start_date, end_date, year_code, is_closed
			from public.fin_fiscal_years
			where id = $1 and tenant_id = $2`, body.FiscalYearID, tu.TenantID).
			Scan(&startDate, &endDate, &yearCode, &isClosed)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Fiscal year not found.", "ERR_NOT_FOUND")
			return
		}
		var exists bool
		_ = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.fin_year_end_closings where tenant_id=$1 and fiscal_year_id=$2)`,
			tu.TenantID, body.FiscalYearID).Scan(&exists)
		if exists {
			response.Validation(w, map[string]string{"fiscal_year_id": "Year-end closing already recorded for this fiscal year."})
			return
		}

		reCode := "3090"
		if body.RetainedEarningsAccountCode != nil && strings.TrimSpace(*body.RetainedEarningsAccountCode) != "" {
			reCode = strings.TrimSpace(*body.RetainedEarningsAccountCode)
		}
		var reAccountID int64
		if err := pool.QueryRow(r.Context(), `
			select id from public.fin_accounts where tenant_id=$1 and account_code=$2 and deleted_at is null`,
			tu.TenantID, reCode).Scan(&reAccountID); err != nil {
			response.Validation(w, map[string]string{"retained_earnings_account_code": fmt.Sprintf("Retained earnings account %s not found.", reCode)})
			return
		}

		type acctBal struct {
			accountID int64
			code      string
			name      string
			acctType  string
			balance   float64
		}
		rows, err := pool.Query(r.Context(), `
			select a.id, a.account_code, a.account_name, a.account_type,
			  case when a.account_type = 'income'
			    then sum(jel.credit - jel.debit)::float8
			    else sum(jel.debit - jel.credit)::float8
			  end
			from public.fin_journal_entry_lines jel
			join public.fin_journal_entries je on je.id = jel.journal_entry_id
			join public.fin_accounts a on a.id = jel.account_id
			where je.tenant_id = $1 and je.status = 'posted'
			  and je.entry_date >= $2 and je.entry_date <= $3
			  and a.account_type in ('income', 'expense')
			  and coalesce(a.is_group, false) = false
			group by a.id, a.account_code, a.account_name, a.account_type
			having abs(sum(jel.credit - jel.debit)) > 0.0001`, tu.TenantID, startDate, endDate)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to compute balances.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var balances []acctBal
		var totalIncome, totalExpense float64
		for rows.Next() {
			var b acctBal
			_ = rows.Scan(&b.accountID, &b.code, &b.name, &b.acctType, &b.balance)
			balances = append(balances, b)
			if b.acctType == "income" {
				totalIncome += b.balance
			} else {
				totalExpense += -b.balance
			}
		}
		netIncome := totalIncome - totalExpense

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start closing entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq),0)+1 from public.fin_journal_entries
			where tenant_id=$1 and entry_date=$2::date`, tu.TenantID, endDate.Format("2006-01-02")).Scan(&dateSeq)
		entryNo := fmt.Sprintf("YE-%s", yearCode)
		remarks := fmt.Sprintf("Year-end closing entry for %s", yearCode)
		var jeID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_journal_entries (tenant_id, entry_date, date_seq, entry_no, status, remarks, posted_at, created_by_user_id)
			values ($1, $2::date, $3, $4, 'posted', $5, now(), $6)
			returning id`, tu.TenantID, endDate.Format("2006-01-02"), dateSeq, entryNo, remarks, tu.AppUserID).Scan(&jeID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create closing journal entry.", "ERR_INTERNAL")
			return
		}

		lineNo := 1
		for _, b := range balances {
			var debit, credit float64
			if b.acctType == "income" {
				debit, credit = b.balance, 0
			} else {
				debit, credit = 0, b.balance
			}
			if b.balance <= 0 {
				continue
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, remarks)
				values ($1,$2,$3,$4,$5,$6)`, jeID, lineNo, b.accountID, debit, credit, "Year-end close")
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create closing lines.", "ERR_INTERNAL")
				return
			}
			lineNo++
		}
		if netIncome >= 0 {
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, remarks)
				values ($1,$2,$3,$4,$5,$6)`, jeID, lineNo, reAccountID, 0, netIncome, "Retained earnings")
		} else {
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_journal_entry_lines (journal_entry_id, line_no, account_id, debit, credit, remarks)
				values ($1,$2,$3,$4,$5,$6)`, jeID, lineNo, reAccountID, -netIncome, 0, "Retained earnings")
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create retained earnings line.", "ERR_INTERNAL")
			return
		}

		var closingID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_year_end_closings (
			  tenant_id, fiscal_year_id, journal_entry_id, retained_earnings_account_id,
			  total_income, total_expense, net_income, periods_locked, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id`,
			tu.TenantID, body.FiscalYearID, jeID, reAccountID, totalIncome, totalExpense, netIncome, body.LockPeriods, tu.AppUserID,
		).Scan(&closingID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record closing.", "ERR_INTERNAL")
			return
		}

		if body.LockPeriods {
			_, err = tx.Exec(r.Context(), `
				update public.fin_fiscal_periods set is_closed = true, updated_at = now()
				where tenant_id = $1 and fiscal_year_id = $2 and is_closed = false`,
				tu.TenantID, body.FiscalYearID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to lock periods.", "ERR_INTERNAL")
				return
			}
		}
		if !isClosed {
			_, err = tx.Exec(r.Context(), `
				update public.fin_fiscal_years set is_closed = true, updated_at = now()
				where id = $1 and tenant_id = $2`, body.FiscalYearID, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to close fiscal year.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save year-end close.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.year_end_close", "fin_year_end_closing", &closingID, nil, body)
		response.OK(w, map[string]any{
			"closing_id": closingID, "journal_entry_id": jeID, "entry_no": entryNo,
			"net_income": netIncome, "periods_locked": body.LockPeriods,
		}, "Year-end closing entry posted.")
	}
}
