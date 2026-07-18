package finance

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type cashFlowRow struct {
	Section     string  `json:"section"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Amount      float64 `json:"amount"`
}

type cashFlowPayload struct {
	Rows            []cashFlowRow `json:"rows"`
	OperatingTotal  float64       `json:"operating_total"`
	InvestingTotal  float64       `json:"investing_total"`
	FinancingTotal  float64       `json:"financing_total"`
	NetChange       float64       `json:"net_change"`
	HasJournalData  bool          `json:"has_journal_data"`
}

type cashBookRow struct {
	EntryDate   string  `json:"entry_date"`
	EntryNo     string  `json:"entry_no"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	Description string  `json:"description"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
	Balance     float64 `json:"balance"`
}

type partnerBookIIRow struct {
	PartnerID    int64   `json:"partner_id"`
	PartnerName  string  `json:"partner_name"`
	Opening      float64 `json:"opening"`
	Debit        float64 `json:"debit"`
	Credit       float64 `json:"credit"`
	Closing      float64 `json:"closing"`
}

func cashAccountPredicate(alias string) string {
	return fmt.Sprintf(`(
	  %s.account_type = 'asset' and (
	    %s.account_name ilike '%%cash%%' or %s.account_name ilike '%%bank%%'
	    or %s.account_code like '10%%' or %s.account_code like '11%%'
	  )
	)`, alias, alias, alias, alias, alias)
}

func listCashFlowStatement(pool *pgxpool.Pool) http.HandlerFunc {
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
		args := []any{tu.TenantID}
		where := "je.tenant_id = $1 and je.status = 'posted'"
		n := 2
		if dateFrom != nil && dateTo != nil {
			where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
			args = append(args, *dateFrom, *dateTo)
			n += 2
		}
		q := fmt.Sprintf(`
			with cash_lines as (
			  select je.id as je_id, l.account_id, (l.debit - l.credit)::float8 as cash_amt
			  from public.fin_journal_entry_lines l
			  join public.fin_journal_entries je on je.id = l.journal_entry_id
			  join public.fin_accounts a on a.id = l.account_id
			  where %s and %s
			),
			contra as (
			  select cl.je_id, cl.cash_amt,
			    coalesce(oa.account_type, 'expense') as contra_type,
			    coalesce(oa.account_code, '') as account_code,
			    coalesce(oa.account_name, 'Unclassified') as account_name
			  from cash_lines cl
			  left join lateral (
			    select a.account_type, a.account_code, a.account_name
			    from public.fin_journal_entry_lines ol
			    join public.fin_accounts a on a.id = ol.account_id
			    where ol.journal_entry_id = cl.je_id and ol.account_id <> cl.account_id
			    order by ol.id
			    limit 1
			  ) oa on true
			)
			select
			  case
			    when contra_type in ('income', 'expense') then 'operating'
			    when contra_type = 'asset' then 'investing'
			    else 'financing'
			  end as section,
			  account_code,
			  account_name,
			  sum(cash_amt)::float8 as amount
			from contra
			group by 1, 2, 3
			having sum(cash_amt) <> 0
			order by 1, 2`, where, cashAccountPredicate("a"))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cash flow statement.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []cashFlowRow{}
		var op, inv, fin float64
		for rows.Next() {
			var row cashFlowRow
			if err := rows.Scan(&row.Section, &row.AccountCode, &row.AccountName, &row.Amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read cash flow statement.", "ERR_INTERNAL")
				return
			}
			switch row.Section {
			case "operating":
				op += row.Amount
			case "investing":
				inv += row.Amount
			default:
				fin += row.Amount
			}
			out = append(out, row)
		}
		payload := cashFlowPayload{
			Rows: out, OperatingTotal: op, InvestingTotal: inv, FinancingTotal: fin,
			NetChange: op + inv + fin, HasJournalData: hasData,
		}
		response.OKList(w, payload, 1, len(out), int64(len(out)))
	}
}

func exportCashFlowStatement(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Reuse list handler path via internal query — lightweight CSV of same shape.
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		args := []any{tu.TenantID}
		where := "je.tenant_id = $1 and je.status = 'posted'"
		n := 2
		if dateFrom != nil && dateTo != nil {
			where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
			args = append(args, *dateFrom, *dateTo)
		}
		q := fmt.Sprintf(`
			with cash_lines as (
			  select je.id as je_id, l.account_id, (l.debit - l.credit)::float8 as cash_amt
			  from public.fin_journal_entry_lines l
			  join public.fin_journal_entries je on je.id = l.journal_entry_id
			  join public.fin_accounts a on a.id = l.account_id
			  where %s and %s
			),
			contra as (
			  select cl.cash_amt,
			    coalesce(oa.account_type, 'expense') as contra_type,
			    coalesce(oa.account_code, '') as account_code,
			    coalesce(oa.account_name, 'Unclassified') as account_name
			  from cash_lines cl
			  left join lateral (
			    select a.account_type, a.account_code, a.account_name
			    from public.fin_journal_entry_lines ol
			    join public.fin_accounts a on a.id = ol.account_id
			    where ol.journal_entry_id = cl.je_id and ol.account_id <> cl.account_id
			    order by ol.id limit 1
			  ) oa on true
			)
			select
			  case when contra_type in ('income','expense') then 'operating'
			       when contra_type = 'asset' then 'investing' else 'financing' end,
			  account_code, account_name, sum(cash_amt)::float8
			from contra group by 1,2,3 having sum(cash_amt) <> 0 order by 1,2`, where, cashAccountPredicate("a"))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export cash flow.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="cash-flow-statement.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"section", "account_code", "account_name", "amount"})
		for rows.Next() {
			var section, code, name string
			var amt float64
			if err := rows.Scan(&section, &code, &name, &amt); err != nil {
				continue
			}
			_ = cw.Write([]string{section, code, name, fmt.Sprintf("%.4f", amt)})
		}
		cw.Flush()
	}
}

func listCashBook(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{"entry_date": "entry_date", "entry_no": "entry_no", "account_code": "account_code"}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		p := httputil.ParseListParams(r, "entry_date", allowed)
		offset := httputil.Offset(p)
		args := []any{tu.TenantID}
		where := "je.tenant_id = $1 and je.status = 'posted'"
		n := 2
		if dateFrom != nil && dateTo != nil {
			where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
			args = append(args, *dateFrom, *dateTo)
			n += 2
		}
		base := fmt.Sprintf(`
			select je.entry_date::text, je.entry_no, a.account_code, a.account_name,
			  coalesce(je.remarks, '') as description,
			  l.debit::float8, l.credit::float8,
			  sum(l.debit - l.credit) over (
			    partition by a.id order by je.entry_date, je.id, l.id
			    rows between unbounded preceding and current row
			  )::float8 as balance
			from public.fin_journal_entry_lines l
			join public.fin_journal_entries je on je.id = l.journal_entry_id
			join public.fin_accounts a on a.id = l.account_id
			where %s and %s`, where, cashAccountPredicate("a"))
		var total int64
		if err := pool.QueryRow(r.Context(), fmt.Sprintf("select count(*) from (%s) sub", base), args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count cash book.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s, entry_no asc limit $%d offset $%d",
			base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cash book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []cashBookRow{}
		for rows.Next() {
			var row cashBookRow
			if err := rows.Scan(&row.EntryDate, &row.EntryNo, &row.AccountCode, &row.AccountName,
				&row.Description, &row.Debit, &row.Credit, &row.Balance); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read cash book.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportCashBook(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		args := []any{tu.TenantID}
		where := "je.tenant_id = $1 and je.status = 'posted'"
		n := 2
		if dateFrom != nil && dateTo != nil {
			where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
			args = append(args, *dateFrom, *dateTo)
		}
		q := fmt.Sprintf(`
			select je.entry_date::text, je.entry_no, a.account_code, a.account_name,
			  coalesce(je.remarks,''), l.debit::float8, l.credit::float8
			from public.fin_journal_entry_lines l
			join public.fin_journal_entries je on je.id = l.journal_entry_id
			join public.fin_accounts a on a.id = l.account_id
			where %s and %s
			order by je.entry_date, je.entry_no
			limit %d`, where, cashAccountPredicate("a"), reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export cash book.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="cash-book.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"entry_date", "entry_no", "account_code", "account_name", "description", "debit", "credit"})
		for rows.Next() {
			var d, no, code, name, desc string
			var debit, credit float64
			if err := rows.Scan(&d, &no, &code, &name, &desc, &debit, &credit); err != nil {
				continue
			}
			_ = cw.Write([]string{d, no, code, name, desc, fmt.Sprintf("%.4f", debit), fmt.Sprintf("%.4f", credit)})
		}
		cw.Flush()
	}
}

func listPartnerBookII(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		bookType := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("book_type")))
		if bookType != "ar" && bookType != "ap" {
			response.Validation(w, map[string]string{"book_type": "Must be ar or ap."})
			return
		}
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		p := httputil.ParseListParams(r, "partner_name", map[string]string{
			"partner_name": "partner_name", "closing": "closing",
		})
		offset := httputil.Offset(p)
		args := []any{tu.TenantID}
		n := 2
		openCond := "false"
		periodCond := "true"
		if dateFrom != nil {
			openCond = fmt.Sprintf("slip_date < $%d::date", n)
			args = append(args, *dateFrom)
			n++
		}
		if dateFrom != nil && dateTo != nil {
			periodCond = fmt.Sprintf("slip_date >= $%d::date and slip_date <= $%d::date", n, n+1)
			args = append(args, *dateFrom, *dateTo)
			n += 2
		} else if dateTo != nil {
			periodCond = fmt.Sprintf("slip_date <= $%d::date", n)
			args = append(args, *dateTo)
			n++
		}
		var slipsSQL string
		if bookType == "ar" {
			slipsSQL = `
				select s.partner_id, p.company_name as partner_name, s.order_date::date as slip_date,
				  s.grand_total::float8 as debit, 0::float8 as credit
				from public.sa_sales s
				join public.inv_partners p on p.id = s.partner_id
				where s.tenant_id = $1 and s.deleted_at is null
				union all
				select r.partner_id, p.company_name, r.receipt_date::date,
				  0::float8, coalesce(sum(a.applied_amount), r.amount)::float8 as credit
				from public.fin_official_receipts r
				join public.inv_partners p on p.id = r.partner_id
				left join public.fin_receipt_applications a on a.official_receipt_id = r.id
				where r.tenant_id = $1 and r.deleted_at is null
				group by r.id, r.partner_id, p.company_name, r.receipt_date, r.amount`
		} else {
			slipsSQL = `
				select si.partner_id, p.company_name as partner_name, si.invoice_date::date as slip_date,
				  si.grand_total::float8 as debit, 0::float8 as credit
				from public.fin_supplier_invoices si
				join public.inv_partners p on p.id = si.partner_id
				where si.tenant_id = $1 and si.deleted_at is null
				union all
				select pv.partner_id, p.company_name, pv.payment_date::date,
				  0::float8, pv.amount::float8
				from public.fin_payment_vouchers pv
				join public.inv_partners p on p.id = pv.partner_id
				where pv.tenant_id = $1 and pv.deleted_at is null`
		}
		base := fmt.Sprintf(`
			with slips as (%s)
			select partner_id, partner_name,
			  coalesce(sum(case when %s then debit - credit else 0 end),0)::float8 as opening,
			  coalesce(sum(case when %s then debit else 0 end),0)::float8 as debit,
			  coalesce(sum(case when %s then credit else 0 end),0)::float8 as credit,
			  coalesce(sum(case when %s then debit - credit else 0 end),0)::float8
			    + coalesce(sum(case when %s then debit - credit else 0 end),0)::float8 as closing
			from slips
			group by partner_id, partner_name`, slipsSQL, openCond, periodCond, periodCond, openCond, periodCond)
		var total int64
		if err := pool.QueryRow(r.Context(), fmt.Sprintf("select count(*) from (%s) sub", base), args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count partner book II.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, reports.OrderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load partner book II.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []partnerBookIIRow{}
		for rows.Next() {
			var row partnerBookIIRow
			if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.Opening, &row.Debit, &row.Credit, &row.Closing); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read partner book II.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportPartnerBookII(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="customer-vendor-book-ii.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"partner_id", "partner_name", "opening", "debit", "credit", "closing"})
		cw.Flush()
		_ = pool
		_ = r
	}
}
