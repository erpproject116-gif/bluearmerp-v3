package hr

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type RemittanceBatch struct {
	ID            int64   `json:"id"`
	PayPeriodID   int64   `json:"pay_period_id"`
	Agency        string  `json:"agency"`
	PeriodLabel   string  `json:"period_label"`
	Status        string  `json:"status"`
	TotalEmployee float64 `json:"total_employee"`
	TotalEmployer float64 `json:"total_employer"`
	TotalAmount   float64 `json:"total_amount"`
	Notes         *string `json:"notes,omitempty"`
	LineCount     int     `json:"line_count,omitempty"`
}

type RemittanceLine struct {
	ID           int64   `json:"id"`
	EmployeeID   int64   `json:"employee_id"`
	EmployeeNo   string  `json:"employee_no"`
	EmployeeName string  `json:"employee_name"`
	GovID        string  `json:"gov_id"`
	EEAmount     float64 `json:"ee_amount"`
	ERAmount     float64 `json:"er_amount"`
	OtherAmount  float64 `json:"other_amount"`
}

type buildRemittanceBody struct {
	PayPeriodID int64  `json:"pay_period_id"`
	Agency      string `json:"agency"`
}

type patchRemittanceBody struct {
	Status *string `json:"status"`
	Notes  *string `json:"notes"`
}

type agencyAmounts struct {
	EE    float64 `json:"ee"`
	ER    float64 `json:"er"`
	Other float64 `json:"other"`
}

func registerRemittanceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.remittances", auth.AccessRead)).Get("/remittances", listRemittances(pool))
	r.With(auth.RequirePermission("hr.remittances", auth.AccessRead)).Get("/remittances/{id}", getRemittance(pool))
	r.With(auth.RequirePermission("hr.remittances", auth.AccessRead)).Get("/remittances/{id}/export.csv", exportRemittanceCSV(pool))
	r.With(auth.RequirePermission("hr.remittances", auth.AccessWrite)).Post("/remittances/build", buildRemittance(pool))
	r.With(auth.RequirePermission("hr.remittances", auth.AccessWrite)).Patch("/remittances/{id}", patchRemittance(pool))
}

func listRemittances(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", map[string]string{"created_at": "b.created_at", "agency": "b.agency"})
		offset := httputil.Offset(p)
		where := "b.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if a := strings.TrimSpace(r.URL.Query().Get("agency")); a != "" {
			where += fmt.Sprintf(" and b.agency = $%d", n)
			args = append(args, strings.ToLower(a))
			n++
		}
		if pid := strings.TrimSpace(r.URL.Query().Get("pay_period_id")); pid != "" {
			where += fmt.Sprintf(" and b.pay_period_id = $%d", n)
			args = append(args, pid)
			n++
		}
		q := fmt.Sprintf(`
			select b.id, b.pay_period_id, b.agency, b.period_label, b.status,
			  b.total_employee::float8, b.total_employer::float8, b.total_amount::float8, b.notes,
			  (select count(*)::int from public.hr_remittance_lines l where l.batch_id = b.id),
			  count(*) over()
			from public.hr_remittance_batches b
			where %s order by b.created_at desc limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list remittances.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []RemittanceBatch
		var total int64
		for rows.Next() {
			var row RemittanceBatch
			if err := rows.Scan(&row.ID, &row.PayPeriodID, &row.Agency, &row.PeriodLabel, &row.Status,
				&row.TotalEmployee, &row.TotalEmployer, &row.TotalAmount, &row.Notes, &row.LineCount, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read remittance.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []RemittanceBatch{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getRemittance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var batch RemittanceBatch
		if err := pool.QueryRow(r.Context(), `
			select id, pay_period_id, agency, period_label, status,
			  total_employee::float8, total_employer::float8, total_amount::float8, notes
			from public.hr_remittance_batches where id=$1 and tenant_id=$2`, id, tu.TenantID).Scan(
			&batch.ID, &batch.PayPeriodID, &batch.Agency, &batch.PeriodLabel, &batch.Status,
			&batch.TotalEmployee, &batch.TotalEmployer, &batch.TotalAmount, &batch.Notes); err != nil {
			response.Err(w, http.StatusNotFound, "Remittance batch not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, employee_id, employee_no, employee_name, gov_id,
			  ee_amount::float8, er_amount::float8, other_amount::float8
			from public.hr_remittance_lines where batch_id=$1 order by employee_name`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var lines []RemittanceLine
		for rows.Next() {
			var ln RemittanceLine
			if err := rows.Scan(&ln.ID, &ln.EmployeeID, &ln.EmployeeNo, &ln.EmployeeName, &ln.GovID,
				&ln.EEAmount, &ln.ERAmount, &ln.OtherAmount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read line.", "ERR_INTERNAL")
				return
			}
			lines = append(lines, ln)
		}
		if lines == nil {
			lines = []RemittanceLine{}
		}
		batch.LineCount = len(lines)
		response.OK(w, map[string]any{"batch": batch, "lines": lines}, "OK")
	}
}

func buildRemittance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body buildRemittanceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		agency := strings.ToLower(strings.TrimSpace(body.Agency))
		if agency != "sss" && agency != "philhealth" && agency != "pagibig" && agency != "bir" {
			response.Validation(w, map[string]string{"agency": "Agency must be sss, philhealth, pagibig, or bir."})
			return
		}
		if body.PayPeriodID <= 0 {
			response.Validation(w, map[string]string{"pay_period_id": "Pay period is required."})
			return
		}
		var periodLabel string
		if err := pool.QueryRow(r.Context(), `
			select period_label from public.hr_pay_periods where id=$1 and tenant_id=$2`,
			body.PayPeriodID, tu.TenantID).Scan(&periodLabel); err != nil {
			response.Err(w, http.StatusNotFound, "Pay period not found.", "ERR_NOT_FOUND")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build remittance.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var batchID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_remittance_batches (
			  tenant_id, pay_period_id, agency, period_label, status, created_by_user_id
			) values ($1,$2,$3,$4,'ready',$5)
			on conflict (tenant_id, pay_period_id, agency) do update set
			  status = 'ready', updated_at = now(),
			  total_employee = 0, total_employer = 0, total_amount = 0
			returning id`, tu.TenantID, body.PayPeriodID, agency, periodLabel, tu.AppUserID).Scan(&batchID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create remittance batch.", "ERR_INTERNAL")
			return
		}
		if _, err := tx.Exec(r.Context(), `delete from public.hr_remittance_lines where batch_id=$1`, batchID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reset remittance lines.", "ERR_INTERNAL")
			return
		}

		rows, err := tx.Query(r.Context(), `
			select ps.id, ps.employee_id, e.employee_no, e.full_name,
			  coalesce(e.sss_no,''), coalesce(e.philhealth_no,''), coalesce(e.pagibig_no,''), coalesce(e.tin,'')
			from public.hr_payslips ps
			join public.hr_employees e on e.id = ps.employee_id
			where ps.tenant_id=$1 and ps.pay_period_id=$2 and ps.status='posted'`, tu.TenantID, body.PayPeriodID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load payslips.", "ERR_INTERNAL")
			return
		}

		type empRow struct {
			PayslipID            int64
			EmpID                int64
			No, Name             string
			SSS, PHIC, HDMF, TIN string
		}
		var emps []empRow
		for rows.Next() {
			var e empRow
			if err := rows.Scan(&e.PayslipID, &e.EmpID, &e.No, &e.Name, &e.SSS, &e.PHIC, &e.HDMF, &e.TIN); err != nil {
				rows.Close()
				response.Err(w, http.StatusInternalServerError, "Failed to read employee payslip.", "ERR_INTERNAL")
				return
			}
			emps = append(emps, e)
		}
		rows.Close()

		var totalEE, totalER float64
		lineCount := 0
		for _, e := range emps {
			lineAmts, err := sumPayslipAgencyAmounts(r.Context(), tx, e.PayslipID, agency)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to sum statutory lines.", "ERR_INTERNAL")
				return
			}
			if lineAmts.EE == 0 && lineAmts.ER == 0 && lineAmts.Other == 0 {
				continue
			}
			govID := ""
			switch agency {
			case "sss":
				govID = e.SSS
			case "philhealth":
				govID = e.PHIC
			case "pagibig":
				govID = e.HDMF
			case "bir":
				govID = e.TIN
			}
			detail, _ := json.Marshal(lineAmts)
			if _, err := tx.Exec(r.Context(), `
				insert into public.hr_remittance_lines (
				  batch_id, employee_id, employee_no, employee_name, gov_id, ee_amount, er_amount, other_amount, detail
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
				batchID, e.EmpID, e.No, e.Name, govID, lineAmts.EE, lineAmts.ER, lineAmts.Other, detail); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert remittance line.", "ERR_INTERNAL")
				return
			}
			totalEE += lineAmts.EE
			totalER += lineAmts.ER
			lineCount++
		}
		totalEE = roundMoney(totalEE)
		totalER = roundMoney(totalER)
		total := roundMoney(totalEE + totalER)
		if _, err := tx.Exec(r.Context(), `
			update public.hr_remittance_batches
			set total_employee=$2, total_employer=$3, total_amount=$4, updated_at=now()
			where id=$1`, batchID, totalEE, totalER, total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update remittance totals.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save remittance.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.remittance.build", "hr_remittance_batch", &batchID, nil, body)
		response.OK(w, map[string]any{
			"batch_id": batchID, "line_count": lineCount,
			"total_employee": totalEE, "total_employer": totalER, "total_amount": total,
		}, "Remittance batch built.")
	}
}

func sumPayslipAgencyAmounts(ctx context.Context, tx pgx.Tx, payslipID int64, agency string) (agencyAmounts, error) {
	rows, err := tx.Query(ctx, `
		select coalesce(line_code,''), line_type, amount::float8
		from public.hr_payslip_lines where payslip_id = $1`, payslipID)
	if err != nil {
		return agencyAmounts{}, err
	}
	defer rows.Close()
	var out agencyAmounts
	for rows.Next() {
		var code, typ string
		var amt float64
		if err := rows.Scan(&code, &typ, &amt); err != nil {
			return agencyAmounts{}, err
		}
		switch agency {
		case "sss":
			switch code {
			case "SSS_EE":
				out.EE += amt
			case "SSS_ER", "SSS_EC":
				out.ER += amt
			}
		case "philhealth":
			switch code {
			case "PHIC_EE":
				out.EE += amt
			case "PHIC_ER":
				out.ER += amt
			}
		case "pagibig":
			switch code {
			case "HDMF_EE":
				out.EE += amt
			case "HDMF_ER":
				out.ER += amt
			}
		case "bir":
			if code == "WHT" {
				out.EE += amt
			}
		}
	}
	out.EE = roundMoney(out.EE)
	out.ER = roundMoney(out.ER)
	out.Other = roundMoney(out.Other)
	return out, rows.Err()
}

func patchRemittance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body patchRemittanceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.Status != nil {
			st := strings.ToLower(strings.TrimSpace(*body.Status))
			if st != "draft" && st != "ready" && st != "filed" && st != "paid" {
				response.Validation(w, map[string]string{"status": "Invalid status."})
				return
			}
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, st)
			n++
		}
		if body.Notes != nil {
			sets = append(sets, fmt.Sprintf("notes = $%d", n))
			args = append(args, body.Notes)
			n++
		}
		if len(sets) == 1 {
			response.Validation(w, map[string]string{"body": "No changes."})
			return
		}
		tag, err := pool.Exec(r.Context(),
			fmt.Sprintf(`update public.hr_remittance_batches set %s where id=$1 and tenant_id=$2`, strings.Join(sets, ", ")),
			args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Remittance batch not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func exportRemittanceCSV(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
		var agency, label string
		if err := pool.QueryRow(r.Context(), `
			select agency, period_label from public.hr_remittance_batches where id=$1 and tenant_id=$2`,
			id, tu.TenantID).Scan(&agency, &label); err != nil {
			response.Err(w, http.StatusNotFound, "Remittance batch not found.", "ERR_NOT_FOUND")
			return
		}
		if format == "" {
			format = agency
		}
		rows, err := pool.Query(r.Context(), `
			select employee_no, employee_name, gov_id, ee_amount::float8, er_amount::float8, other_amount::float8
			from public.hr_remittance_lines where batch_id=$1 order by employee_name`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		headers := remittanceExportHeaders(agency, format)
		var data [][]string
		for rows.Next() {
			var no, name, gov string
			var ee, er, other float64
			if err := rows.Scan(&no, &name, &gov, &ee, &er, &other); err != nil {
				return
			}
			data = append(data, remittanceExportRow(agency, label, format, no, name, gov, ee, er, other))
		}
		filename := fmt.Sprintf("%s-remittance-%d.csv", format, id)
		writeRemittanceCSV(w, filename, headers, data)
	}
}
