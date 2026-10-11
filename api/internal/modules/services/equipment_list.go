package services

import (
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func scanAssignments(rows pgx.Rows) []map[string]any {
	out := []map[string]any{}
	for rows.Next() {
		var id, employeeID int64
		var name, notes string
		var start, end *time.Time
		if err := rows.Scan(&id, &employeeID, &name, &start, &end, &notes); err != nil {
			return out
		}
		out = append(out, map[string]any{
			"id": id, "employee_id": employeeID, "employee_name": name,
			"scheduled_start": start, "scheduled_end": end, "notes": notes,
		})
	}
	return out
}

func scanSchedule(rows pgx.Rows) []map[string]any {
	out := []map[string]any{}
	for rows.Next() {
		var id, jobID, employeeID, locationID int64
		var jobNo, name, notes string
		var start, end *time.Time
		if err := rows.Scan(&id, &jobID, &jobNo, &employeeID, &name, &start, &end, &notes, &locationID); err != nil {
			return out
		}
		out = append(out, map[string]any{
			"id": id, "job_id": jobID, "job_no": jobNo, "employee_id": employeeID,
			"employee_name": name, "scheduled_start": start, "scheduled_end": end,
			"notes": notes, "location_id": locationID,
		})
	}
	return out
}

func listEquipment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		page, per := pageParams(r)
		q := r.URL.Query().Get("q")
		args := []any{tu.TenantID}
		where := "where e.tenant_id = $1 and e.deleted_at is null"
		if q != "" {
			where += " and (e.name ilike $2 or e.serial_no ilike $2)"
			args = append(args, "%"+q+"%")
		}
		var total int64
		if err := pool.QueryRow(r.Context(), `select count(*) from public.svc_customer_equipment e `+where, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list equipment.", "ERR_INTERNAL")
			return
		}
		limitPos := len(args) + 1
		args = append(args, per, (page-1)*per)
		rows, err := pool.Query(r.Context(), `
			select e.id, e.name, e.serial_no, e.custody_status, e.qty_in_custody::float8, e.is_serialized,
			  e.partner_id, coalesce(p.company_name, ''), e.location_id, e.row_version
			from public.svc_customer_equipment e
			left join public.inv_partners p on p.id = e.partner_id
			`+where+` order by e.name
			limit $`+strconv.Itoa(limitPos)+` offset $`+strconv.Itoa(limitPos+1), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list equipment.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, partnerID, locationID int64
			var name, serial, status, customer string
			var qty float64
			var serialized bool
			var version int
			if err := rows.Scan(&id, &name, &serial, &status, &qty, &serialized, &partnerID, &customer, &locationID, &version); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list equipment.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "name": name, "serial_no": serial, "custody_status": status,
				"qty_in_custody": qty, "is_serialized": serialized, "partner_id": partnerID,
				"customer_name": customer, "location_id": locationID, "row_version": version,
			})
		}
		response.OKList(w, out, page, per, total)
	}
}
