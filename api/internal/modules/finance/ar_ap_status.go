package finance

import (
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type arApStatusRow struct {
	PartnerID   int64   `json:"partner_id"`
	PartnerName string  `json:"partner_name"`
	PartnerKind string  `json:"partner_kind"`
	ArBalance   float64 `json:"ar_balance"`
	ApBalance   float64 `json:"ap_balance"`
	NetBalance  float64 `json:"net_balance"`
}

func parseArApStatusFilters(r *http.Request) (asOf time.Time, statusType string, partnerID *int64, errs map[string]string) {
	asOfStr := strings.TrimSpace(r.URL.Query().Get("as_of"))
	if asOfStr == "" {
		asOfStr = time.Now().Format("2006-01-02")
	}
	parsed, err := parseDate(asOfStr)
	if err != nil {
		return time.Time{}, "", nil, map[string]string{"as_of": "Invalid date. Use YYYY-MM-DD."}
	}
	asOf = parsed
	statusType = strings.TrimSpace(r.URL.Query().Get("status_type"))
	switch statusType {
	case "receivable", "payable", "combined":
	default:
		statusType = "combined"
	}
	if v := strings.TrimSpace(r.URL.Query().Get("partner_id")); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil && n > 0 {
			partnerID = &n
		}
	}
	return asOf, statusType, partnerID, nil
}

func arApStatusSQL(tenantID int64, asOf time.Time, statusType string, partnerID *int64) (string, []any) {
	args := []any{tenantID, asOf.Format("2006-01-02")}
	partnerFilter := ""
	if partnerID != nil {
		partnerFilter = " and p.id = $3"
		args = append(args, *partnerID)
	}
	q := fmt.Sprintf(`
		with ar as (
		  select s.partner_id,
		    coalesce(sum(s.grand_total), 0)::float8 - coalesce(sum(recv.received), 0)::float8 as balance
		  from public.sa_sales s
		  ` + saleAppliedLateralSQLAsOf("s", "$2::date") + `
		  where s.tenant_id = $1 and s.deleted_at is null and s.order_date <= $2::date
		  group by s.partner_id
		),
		ap as (
		  select si.partner_id,
		    coalesce(sum(si.grand_total), 0)::float8 - coalesce(sum(paid.paid), 0)::float8 as balance
		  from public.fin_supplier_invoices si
		  ` + supplierInvoiceAppliedLateralSQLAsOf("si", "$2::date") + `
		  where si.tenant_id = $1 and si.deleted_at is null and si.invoice_date <= $2::date
		  group by si.partner_id
		)
		select p.id as partner_id, p.company_name as partner_name, p.partner_kind,
		  coalesce(ar.balance, 0)::float8 as ar_balance,
		  coalesce(ap.balance, 0)::float8 as ap_balance,
		  (coalesce(ar.balance, 0) - coalesce(ap.balance, 0))::float8 as net_balance
		from public.inv_partners p
		left join ar on ar.partner_id = p.id
		left join ap on ap.partner_id = p.id
		where p.tenant_id = $1 and p.deleted_at is null%s
		  and (coalesce(ar.balance, 0) <> 0 or coalesce(ap.balance, 0) <> 0)`, partnerFilter)

	switch statusType {
	case "receivable":
		q += " and coalesce(ar.balance, 0) > 0.0001"
	case "payable":
		q += " and coalesce(ap.balance, 0) > 0.0001"
	}
	return q, args
}

func listArApStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, statusType, partnerID, errs := parseArApStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "partner_name", map[string]string{
			"partner_name": "partner_name", "ar_balance": "ar_balance", "ap_balance": "ap_balance",
		})
		offset := httputil.Offset(p)
		base, args := arApStatusSQL(tu.TenantID, asOf, statusType, partnerID)
		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			log.Printf("ar-ap-status count failed: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to count AR/AP status.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select partner_id, partner_name, partner_kind, ar_balance, ap_balance, net_balance from (%s) sub order by %s %s limit $%d offset $%d",
			base, p.Sort, orderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			log.Printf("ar-ap-status query failed: %v", err)
			response.Err(w, http.StatusInternalServerError, "Failed to load AR/AP status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []arApStatusRow
		for rows.Next() {
			var row arApStatusRow
			if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.PartnerKind, &row.ArBalance, &row.ApBalance, &row.NetBalance); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read AR/AP status.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []arApStatusRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func exportArApStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		asOf, statusType, partnerID, errs := parseArApStatusFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		base, args := arApStatusSQL(tu.TenantID, asOf, statusType, partnerID)
		q := fmt.Sprintf("select partner_id, partner_name, partner_kind, ar_balance, ap_balance, net_balance from (%s) sub order by partner_name asc limit %d", base, reportExportMaxRows)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export AR/AP status.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="ar-ap-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Partner", "Kind", "A/R Balance", "A/P Balance", "Net"})
		for rows.Next() {
			var row arApStatusRow
			if err := rows.Scan(&row.PartnerID, &row.PartnerName, &row.PartnerKind, &row.ArBalance, &row.ApBalance, &row.NetBalance); err != nil {
				return
			}
			_ = cw.Write([]string{
				row.PartnerName, row.PartnerKind,
				strconv.FormatFloat(row.ArBalance, 'f', -1, 64),
				strconv.FormatFloat(row.ApBalance, 'f', -1, 64),
				strconv.FormatFloat(row.NetBalance, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
