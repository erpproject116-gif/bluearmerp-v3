package manufacturing

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// booksStatusSQL matches the register: a reversal wins, otherwise the journal
// status when it is posted or draft, otherwise the cost never reached the books.
const booksStatusSQL = `case
			when rev.id is not null then 'reversed'
			when je.status in ('posted', 'draft') then je.status
			else 'not_posted'
		end`

type productionCostRow struct {
	WorkOrderID            int64   `json:"work_order_id"`
	WorkOrderNo            string  `json:"work_order_no"`
	OrderDate              string  `json:"order_date"`
	BomType                string  `json:"bom_type"`
	MaterialCost           float64 `json:"material_cost"`
	LaborCost              float64 `json:"labor_cost"`
	OverheadCost           float64 `json:"overhead_cost"`
	OtherCost              float64 `json:"other_cost"`
	TotalCost              float64 `json:"total_cost"`
	JournalEntryID         *int64  `json:"journal_entry_id"`
	JournalStatus          *string `json:"journal_status"`
	ReversalJournalEntryID *int64  `json:"reversal_journal_entry_id"`
	BooksStatus            string  `json:"books_status"`
}

func parseBooksStatusFilter(raw string) string {
	switch strings.TrimSpace(strings.ToLower(raw)) {
	case "posted", "draft", "not_posted", "reversed":
		return strings.TrimSpace(strings.ToLower(raw))
	default:
		return ""
	}
}

func listProductionCosts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		filters, errs := parseWoReportDateRange(r)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date": "wo.order_date",
		})
		offset := httputil.Offset(p)

		where := `p.tenant_id = $1
			and wo.order_date >= $2::date and wo.order_date <= $3::date
			and (p.total_cost > 0 or p.journal_entry_id is not null)`
		args := []any{tu.TenantID, filters.DateFrom.Format("2006-01-02"), filters.DateTo.Format("2006-01-02")}
		argN := 4
		if bt := parseBomTypeListFilter(r.URL.Query().Get("bom_type")); bt != "" {
			where += fmt.Sprintf(" and coalesce(b.bom_type, 'assembly') = $%d", argN)
			args = append(args, bt)
			argN++
		}
		if bs := parseBooksStatusFilter(r.URL.Query().Get("books_status")); bs != "" {
			where += fmt.Sprintf(" and (%s) = $%d", booksStatusSQL, argN)
			args = append(args, bs)
			argN++
		}

		q := fmt.Sprintf(`
			select wo.id, wo.work_order_no, wo.order_date::text, coalesce(b.bom_type, 'assembly'),
			  p.material_cost::float8, p.labor_cost::float8, p.overhead_cost::float8,
			  p.other_cost::float8, p.total_cost::float8,
			  p.journal_entry_id, je.status, rev.journal_entry_id,
			  %s,
			  count(*) over()
			from public.mfg_work_order_cost_postings p
			join public.mfg_work_orders wo on wo.id = p.work_order_id and wo.tenant_id = p.tenant_id
			join public.mfg_boms b on b.id = wo.bom_id
			left join public.fin_journal_entries je on je.id = p.journal_entry_id and je.tenant_id = p.tenant_id
			left join public.mfg_work_order_reversals rev on rev.tenant_id = p.tenant_id and rev.work_order_id = p.work_order_id
			where %s
			order by wo.order_date desc, wo.id desc
			limit $%d offset $%d`, booksStatusSQL, where, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list production costs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []productionCostRow{}
		var total int64
		for rows.Next() {
			var row productionCostRow
			if err := rows.Scan(
				&row.WorkOrderID, &row.WorkOrderNo, &row.OrderDate, &row.BomType,
				&row.MaterialCost, &row.LaborCost, &row.OverheadCost, &row.OtherCost, &row.TotalCost,
				&row.JournalEntryID, &row.JournalStatus, &row.ReversalJournalEntryID,
				&row.BooksStatus, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read production costs.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list production costs.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}
