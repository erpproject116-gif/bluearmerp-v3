package inventory

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type rmaCandidateRow struct {
	SalesID      int64  `json:"sales_id"`
	SalesNo      string `json:"sales_no"`
	SalesLineID  int64  `json:"sales_line_id"`
	ItemID       *int64 `json:"item_id,omitempty"`
	ItemCode     string `json:"item_code"`
	ItemName     string `json:"item_name"`
	SerialUnitID int64  `json:"serial_unit_id"`
	SerialNo     string `json:"serial_no"`
	PartnerID    int64  `json:"partner_id"`
	CustomerName string `json:"customer_name"`
	OrderDate    string `json:"order_date"`
}

// listRMACandidates returns sold serials still on sales invoices (for Repair Order RMA pick).
func listRMACandidates(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		partnerID, _ := strconv.ParseInt(r.URL.Query().Get("partner_id"), 10, 64)
		limit := 40

		args := []any{tu.TenantID}
		argN := 2
		where := `s.tenant_id = $1 and s.deleted_at is null and su.status = 'sold'`
		if partnerID > 0 {
			where += ` and s.partner_id = $` + strconv.Itoa(argN)
			args = append(args, partnerID)
			argN++
		}
		if q != "" {
			where += ` and (s.sales_no ilike $` + strconv.Itoa(argN) +
				` or su.serial_no ilike $` + strconv.Itoa(argN) +
				` or sl.item_code ilike $` + strconv.Itoa(argN) +
				` or sl.item_name ilike $` + strconv.Itoa(argN) + `)`
			args = append(args, "%"+q+"%")
			argN++
		}
		args = append(args, limit)

		rows, err := pool.Query(r.Context(), `
			select s.id, s.sales_no, sl.id, sl.item_id, coalesce(sl.item_code, ''), coalesce(sl.item_name, ''),
			  su.id, su.serial_no, s.partner_id, p.company_name, s.order_date::text
			from public.sa_sales s
			join public.inv_partners p on p.id = s.partner_id
			join public.sa_sales_lines sl on sl.sales_id = s.id
			join public.inv_serial_unit_sales_lines j on j.sales_line_id = sl.id
			join public.inv_serial_units su on su.id = j.serial_unit_id
			where `+where+`
			order by s.order_date desc, s.sales_no desc, su.serial_no
			limit $`+strconv.Itoa(argN), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list RMA candidates.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []rmaCandidateRow{}
		for rows.Next() {
			var row rmaCandidateRow
			if err := rows.Scan(
				&row.SalesID, &row.SalesNo, &row.SalesLineID, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.SerialUnitID, &row.SerialNo, &row.PartnerID, &row.CustomerName, &row.OrderDate,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read RMA candidates.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}
