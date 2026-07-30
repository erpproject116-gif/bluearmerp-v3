package finance

import (
	"context"
	"encoding/csv"
	"fmt"
	"html"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bookRow struct {
	EntryDate   string  `json:"entry_date"`
	EntryNo     string  `json:"entry_no"`
	AccountCode string  `json:"account_code"`
	AccountName string  `json:"account_name"`
	PartnerName string  `json:"partner_name,omitempty"`
	Description string  `json:"description,omitempty"`
	Debit       float64 `json:"debit"`
	Credit      float64 `json:"credit"`
}

var validBooks = map[string]string{
	"sales-journal":       "Sales Journal",
	"purchase-journal":    "Purchase Journal",
	"cash-receipts":       "Cash Receipts",
	"cash-disbursements":  "Cash Disbursements",
	"general-journal":     "General Journal",
	"general-ledger":      "General Ledger",
}

func registerBooksOfAccountsRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/books/{bookType}", getBookOfAccounts(pool))
}

func getBookOfAccounts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		bookType := strings.TrimSpace(chi.URLParam(r, "bookType"))
		title, ok := validBooks[bookType]
		if !ok {
			response.Validation(w, map[string]string{"book_type": "Unknown book type."})
			return
		}
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		rows, err := queryBookRows(r.Context(), pool, tu.TenantID, bookType, dateFrom, dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load book.", "ERR_INTERNAL")
			return
		}
		format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
		if format == "csv" {
			exportBookCSV(w, title, dateFrom, dateTo, rows)
			return
		}
		if format == "html" {
			renderBookHTML(w, title, dateFrom, dateTo, rows)
			return
		}
		payload := map[string]any{
			"book_type": bookType,
			"title":     title,
			"row_count": len(rows),
			"rows":      rows,
		}
		if dateFrom != nil && dateTo != nil {
			payload["date_from"] = dateFrom.Format("2006-01-02")
			payload["date_to"] = dateTo.Format("2006-01-02")
		}
		response.OK(w, payload, "OK")
	}
}

func bookEntryFilter(bookType string) (whereExtra string, argsOffset int) {
	switch bookType {
	case "sales-journal":
		return ` and (je.entry_no like 'sa_sales-%' or je.entry_no like 'collective_invoice-%' or exists (
		  select 1 from public.fin_journal_entry_lines jl2
		  join public.fin_accounts a2 on a2.id = jl2.account_id
		  where jl2.journal_entry_id = je.id and a2.account_type = 'income'
		))`, 0
	case "purchase-journal":
		return ` and (je.entry_no like 'supplier_invoice-%' or je.entry_no like 'fin_supplier_invoice-%' or exists (
		  select 1 from public.fin_journal_entry_lines jl2
		  join public.fin_accounts a2 on a2.id = jl2.account_id
		  where jl2.journal_entry_id = je.id and a2.account_type = 'expense'
		))`, 0
	case "cash-receipts":
		return ` and je.entry_no like 'official_receipt-%'`, 0
	case "cash-disbursements":
		return ` and (je.entry_no like 'payment_voucher-%' or je.entry_no like 'expense-%')`, 0
	case "general-journal":
		return ` and je.entry_no like 'JE-%'`, 0
	default: // general-ledger
		return "", 0
	}
}

func queryBookRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, bookType string, dateFrom, dateTo *time.Time) ([]bookRow, error) {
	where := "je.tenant_id = $1 and je.status = 'posted'"
	args := []any{tenantID}
	n := 2
	if dateFrom != nil && dateTo != nil {
		where += fmt.Sprintf(" and je.entry_date >= $%d::date and je.entry_date <= $%d::date", n, n+1)
		args = append(args, dateFrom.Format("2006-01-02"), dateTo.Format("2006-01-02"))
		n += 2
	}
	extra, _ := bookEntryFilter(bookType)
	where += extra
	q := fmt.Sprintf(`
		select je.entry_date::text, je.entry_no,
		  a.account_code, a.account_name,
		  coalesce(p.company_name, ''),
		  coalesce(jel.remarks, je.remarks, ''),
		  jel.debit::float8, jel.credit::float8
		from public.fin_journal_entry_lines jel
		join public.fin_journal_entries je on je.id = jel.journal_entry_id
		join public.fin_accounts a on a.id = jel.account_id
		left join public.inv_partners p on p.id = jel.party_id
		where %s
		order by je.entry_date, je.entry_no, jel.line_no`, where)
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []bookRow
	for rows.Next() {
		var row bookRow
		var entryDate any
		if err := rows.Scan(&entryDate, &row.EntryNo, &row.AccountCode, &row.AccountName,
			&row.PartnerName, &row.Description, &row.Debit, &row.Credit); err != nil {
			return nil, err
		}
		row.EntryDate = fmt.Sprint(entryDate)
		if len(row.EntryDate) >= 10 {
			row.EntryDate = row.EntryDate[:10]
		}
		out = append(out, row)
	}
	if out == nil {
		out = []bookRow{}
	}
	return out, nil
}

func exportBookCSV(w http.ResponseWriter, title string, dateFrom, dateTo *time.Time, rows []bookRow) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	slug := strings.ToLower(strings.ReplaceAll(title, " ", "-"))
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.csv"`, slug))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"book", title})
	if dateFrom != nil && dateTo != nil {
		_ = cw.Write([]string{"period_from", dateFrom.Format("2006-01-02")})
		_ = cw.Write([]string{"period_to", dateTo.Format("2006-01-02")})
	}
	_ = cw.Write([]string{"entry_date", "entry_no", "account_code", "account_name", "partner", "description", "debit", "credit"})
	var totalDebit, totalCredit float64
	for _, row := range rows {
		_ = cw.Write([]string{
			row.EntryDate, row.EntryNo, row.AccountCode, row.AccountName, row.PartnerName, row.Description,
			fmt.Sprintf("%.2f", row.Debit), fmt.Sprintf("%.2f", row.Credit),
		})
		totalDebit += row.Debit
		totalCredit += row.Credit
	}
	_ = cw.Write([]string{"TOTALS", "", "", "", "", "", fmt.Sprintf("%.2f", totalDebit), fmt.Sprintf("%.2f", totalCredit)})
	cw.Flush()
}

func renderBookHTML(w http.ResponseWriter, title string, dateFrom, dateTo *time.Time, rows []bookRow) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	period := ""
	if dateFrom != nil && dateTo != nil {
		period = fmt.Sprintf("<p>Period: %s to %s</p>", html.EscapeString(dateFrom.Format("2006-01-02")), html.EscapeString(dateTo.Format("2006-01-02")))
	}
	var b strings.Builder
	b.WriteString("<!DOCTYPE html><html><head><title>")
	b.WriteString(html.EscapeString(title))
	b.WriteString("</title><style>body{font-family:system-ui,sans-serif;padding:1rem}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#f4f4f5;text-align:left}.num{text-align:right}</style></head><body>")
	b.WriteString("<h1>")
	b.WriteString(html.EscapeString(title))
	b.WriteString("</h1>")
	b.WriteString(period)
	b.WriteString("<table><thead><tr><th>Date</th><th>Entry No</th><th>Account</th><th>Partner</th><th>Description</th><th class=\"num\">Debit</th><th class=\"num\">Credit</th></tr></thead><tbody>")
	var totalDebit, totalCredit float64
	for _, row := range rows {
		totalDebit += row.Debit
		totalCredit += row.Credit
		b.WriteString(fmt.Sprintf("<tr><td>%s</td><td>%s</td><td>%s %s</td><td>%s</td><td>%s</td><td class=\"num\">%.2f</td><td class=\"num\">%.2f</td></tr>",
			html.EscapeString(row.EntryDate), html.EscapeString(row.EntryNo),
			html.EscapeString(row.AccountCode), html.EscapeString(row.AccountName),
			html.EscapeString(row.PartnerName), html.EscapeString(row.Description),
			row.Debit, row.Credit))
	}
	b.WriteString(fmt.Sprintf("<tr><td colspan=\"5\"><strong>Totals</strong></td><td class=\"num\"><strong>%.2f</strong></td><td class=\"num\"><strong>%.2f</strong></td></tr>",
		totalDebit, totalCredit))
	b.WriteString("</tbody></table></body></html>")
	_, _ = w.Write([]byte(b.String()))
}
