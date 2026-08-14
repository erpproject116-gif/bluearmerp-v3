package finance

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type postingLogRow struct {
	ID          int64   `json:"id"`
	SourceType  string  `json:"source_type"`
	SourceID    int64   `json:"source_id"`
	DocumentNo  string  `json:"document_no,omitempty"`
	PartnerName string  `json:"partner_name,omitempty"`
	Amount      float64 `json:"amount,omitempty"`
	CreatedAt   string  `json:"created_at"`
	Href        string  `json:"href"`
}

func registerPostingLogRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).Get("/posting-log", listPostingLog(pool))
}

// listPostingLog returns audit-only OR/PV rows that still lack a posted journal entry.
func listPostingLog(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		glStatus := strings.TrimSpace(r.URL.Query().Get("gl_status"))
		if glStatus == "" {
			glStatus = "audit_only"
		}
		if glStatus != "audit_only" {
			response.Validation(w, map[string]string{"gl_status": "Only gl_status=audit_only is supported."})
			return
		}
		sourceType := strings.TrimSpace(r.URL.Query().Get("source_type"))
		page, _ := strconv.Atoi(r.URL.Query().Get("page"))
		pageSize, _ := strconv.Atoi(r.URL.Query().Get("pageSize"))
		if page < 1 {
			page = 1
		}
		if pageSize < 1 || pageSize > 200 {
			pageSize = 50
		}
		offset := (page - 1) * pageSize

		where := `
			pl.tenant_id = $1
			and pl.poster_kind = 'audit'
			and pl.source_type in ('official_receipt', 'payment_voucher')
			and not exists (
			  select 1 from public.fin_journal_entries je
			  where je.tenant_id = pl.tenant_id
			    and je.entry_no = pl.source_type || '-' || pl.source_id::text
			    and je.status = 'posted'
			)`
		args := []any{tu.TenantID}
		n := 2
		if sourceType != "" {
			where += fmt.Sprintf(" and pl.source_type = $%d", n)
			args = append(args, sourceType)
			n++
		}

		// Latest audit row per source (distinct on).
		q := fmt.Sprintf(`
			select pl.id, pl.source_type, pl.source_id, pl.created_at::text,
			  coalesce(
			    case when pl.source_type = 'official_receipt' then orc.receipt_no end,
			    case when pl.source_type = 'payment_voucher' then pv.payment_no end,
			    ''
			  ) as document_no,
			  coalesce(
			    case when pl.source_type = 'official_receipt' then orp.company_name end,
			    case when pl.source_type = 'payment_voucher' then pvp.company_name end,
			    ''
			  ) as partner_name,
			  coalesce(
			    case when pl.source_type = 'official_receipt' then orc.amount_total end,
			    case when pl.source_type = 'payment_voucher' then pv.amount_total end,
			    0
			  )::float8 as amount
			from (
			  select distinct on (source_type, source_id)
			    id, tenant_id, source_type, source_id, created_at
			  from public.fin_posting_log pl0
			  where pl0.tenant_id = $1 and pl0.poster_kind = 'audit'
			    and pl0.source_type in ('official_receipt', 'payment_voucher')
			  order by source_type, source_id, created_at desc, id desc
			) pl
			left join public.fin_official_receipts orc
			  on orc.id = pl.source_id and orc.tenant_id = pl.tenant_id and orc.deleted_at is null
			    and pl.source_type = 'official_receipt'
			left join public.inv_partners orp on orp.id = orc.partner_id
			left join public.fin_payment_vouchers pv
			  on pv.id = pl.source_id and pv.tenant_id = pl.tenant_id and pv.deleted_at is null
			    and pl.source_type = 'payment_voucher'
			left join public.inv_partners pvp on pvp.id = pv.partner_id
			where %s
			order by pl.created_at desc, pl.id desc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, pageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list posting log.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []postingLogRow{}
		for rows.Next() {
			var row postingLogRow
			if err := rows.Scan(&row.ID, &row.SourceType, &row.SourceID, &row.CreatedAt,
				&row.DocumentNo, &row.PartnerName, &row.Amount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read posting log.", "ERR_INTERNAL")
				return
			}
			switch row.SourceType {
			case "official_receipt":
				row.Href = "/app/finance/official-receipts"
			case "payment_voucher":
				row.Href = "/app/finance/payment-vouchers"
			default:
				row.Href = "/app/finance/bookkeeping"
			}
			// Prefer EntryNo helper for consistency in docs (SQL already filters by same pattern).
			_ = ledger.EntryNo(row.SourceType, row.SourceID)
			out = append(out, row)
		}
		if err := rows.Err(); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read posting log.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

func countAuditOnlyPending(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var n int64
	err := pool.QueryRow(ctx, `
		select count(*) from (
		  select distinct pl.source_type, pl.source_id
		  from public.fin_posting_log pl
		  where pl.tenant_id = $1
		    and pl.poster_kind = 'audit'
		    and pl.source_type in ('official_receipt', 'payment_voucher')
		    and not exists (
		      select 1 from public.fin_journal_entries je
		      where je.tenant_id = pl.tenant_id
		        and je.entry_no = pl.source_type || '-' || pl.source_id::text
		        and je.status = 'posted'
		    )
		) t`, tenantID).Scan(&n)
	return n, err
}
