package finance

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bir2307Certificate struct {
	ID              int64   `json:"id"`
	PayeePartnerID  int64   `json:"payee_partner_id"`
	PayeeName       string  `json:"payee_name"`
	PeriodFrom      string  `json:"period_from"`
	PeriodTo        string  `json:"period_to"`
	CertificateNo   string  `json:"certificate_no"`
	Status          string  `json:"status"`
	TotalBase       float64 `json:"total_base"`
	TotalTax        float64 `json:"total_tax"`
	IssuedAt        *string `json:"issued_at,omitempty"`
	VoidedAt        *string `json:"voided_at,omitempty"`
	CreatedAt       string  `json:"created_at"`
	Lines           []bir2307CertificateLine `json:"lines,omitempty"`
}

type bir2307CertificateLine struct {
	ID                int64   `json:"id,omitempty"`
	WithholdingLineID *int64  `json:"withholding_line_id,omitempty"`
	ATCCode           string  `json:"atc_code"`
	Description       string  `json:"description"`
	RatePct           float64 `json:"rate_pct"`
	BaseAmount        float64 `json:"base_amount"`
	TaxAmount         float64 `json:"tax_amount"`
	SourceRefType     *string `json:"source_ref_type,omitempty"`
	SourceRefID       *int64  `json:"source_ref_id,omitempty"`
	SourceDate        *string `json:"source_date,omitempty"`
}

type bir2307CreateBody struct {
	PayeePartnerID int64  `json:"payee_partner_id"`
	PeriodFrom     string `json:"period_from"`
	PeriodTo       string `json:"period_to"`
	CertificateNo  string `json:"certificate_no"`
}

type statutory1601Row struct {
	ATCCode     string  `json:"atc_code"`
	Description string  `json:"description"`
	RatePct     float64 `json:"rate_pct"`
	PayeeTIN    string  `json:"payee_tin"`
	PayeeName   string  `json:"payee_name"`
	TotalBase   float64 `json:"total_base"`
	TotalTax    float64 `json:"total_tax"`
}

type statutory1601Payload struct {
	PeriodFrom string             `json:"period_from"`
	PeriodTo   string             `json:"period_to"`
	Rows       []statutory1601Row `json:"rows"`
	TotalBase  float64            `json:"total_base"`
	TotalTax   float64            `json:"total_tax"`
	Disclaimer string             `json:"disclaimer"`
}

type openWithholdingRow struct {
	ID          int64
	RefType     string
	RefID       int64
	SourceDate  time.Time
	ATCCode     string
	Description string
	RatePct     float64
	BaseAmount  float64
	TaxAmount   float64
}

func registerBIRStatutoryS1Routes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/2307-certificates", list2307Certificates(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Post("/statutory/2307-certificates", create2307Certificate(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/2307-certificates/{id}", get2307Certificate(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/2307-certificates/{id}/print", get2307CertificatePrint(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Post("/statutory/2307-certificates/{id}/issue", issue2307Certificate(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Post("/statutory/2307-certificates/{id}/void", void2307Certificate(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/1601-eq", get1601EQWorkpaper(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/alphalist-ewt", exportAlphalistEWT(pool))
}

func parseStatutoryPeriod(w http.ResponseWriter, r *http.Request) (time.Time, time.Time, bool) {
	fromStr := strings.TrimSpace(r.URL.Query().Get("period_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("period_to"))
	if fromStr == "" || toStr == "" {
		response.Validation(w, map[string]string{"period": "period_from and period_to are required (YYYY-MM-DD)."})
		return time.Time{}, time.Time{}, false
	}
	from, err := parseDate(fromStr)
	if err != nil {
		response.Validation(w, map[string]string{"period_from": "Invalid date."})
		return time.Time{}, time.Time{}, false
	}
	to, err := parseDate(toStr)
	if err != nil {
		response.Validation(w, map[string]string{"period_to": "Invalid date."})
		return time.Time{}, time.Time{}, false
	}
	if to.Before(from) {
		response.Validation(w, map[string]string{"period_to": "Must be on or after period_from."})
		return time.Time{}, time.Time{}, false
	}
	return from, to, true
}

func list2307Certificates(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "c.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if pid, ok := optionalInt64Query(r, "payee_partner_id"); ok {
			where += fmt.Sprintf(" and c.payee_partner_id = $%d", argN)
			args = append(args, *pid)
			argN++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and c.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		q := fmt.Sprintf(`
			select c.id, c.payee_partner_id, coalesce(p.company_name, ''), c.period_from::text, c.period_to::text,
			  c.certificate_no, c.status, c.total_base::float8, c.total_tax::float8,
			  c.issued_at::text, c.voided_at::text, c.created_at::text
			from public.fin_bir_2307_certificates c
			left join public.inv_partners p on p.id = c.payee_partner_id
			where %s
			order by c.period_from desc, c.id desc`, where)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list certificates.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []bir2307Certificate
		for rows.Next() {
			var row bir2307Certificate
			if err := rows.Scan(&row.ID, &row.PayeePartnerID, &row.PayeeName, &row.PeriodFrom, &row.PeriodTo,
				&row.CertificateNo, &row.Status, &row.TotalBase, &row.TotalTax,
				&row.IssuedAt, &row.VoidedAt, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read certificates.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []bir2307Certificate{}
		}
		response.OK(w, out, "OK")
	}
}

func create2307Certificate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bir2307CreateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.PayeePartnerID <= 0 {
			response.Validation(w, map[string]string{"payee_partner_id": "Payee is required."})
			return
		}
		from, err := parseDate(body.PeriodFrom)
		if err != nil {
			response.Validation(w, map[string]string{"period_from": "Invalid date."})
			return
		}
		to, err := parseDate(body.PeriodTo)
		if err != nil {
			response.Validation(w, map[string]string{"period_to": "Invalid date."})
			return
		}
		if to.Before(from) {
			response.Validation(w, map[string]string{"period_to": "Must be on or after period_from."})
			return
		}

		openRows, err := loadOpenWithholdingForPartner(r.Context(), pool, tu.TenantID, body.PayeePartnerID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load withholding lines.", "ERR_INTERNAL")
			return
		}
		if len(openRows) == 0 {
			response.Validation(w, map[string]string{"withholding": "No open withholding lines for this payee and period."})
			return
		}

		certNo := strings.TrimSpace(body.CertificateNo)
		if certNo == "" {
			certNo = fmt.Sprintf("2307-%d-%s-%s", body.PayeePartnerID, from.Format("20060102"), to.Format("20060102"))
		}

		var totalBase, totalTax float64
		for _, ln := range openRows {
			totalBase += ln.BaseAmount
			totalTax += ln.TaxAmount
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create certificate.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var certID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_bir_2307_certificates (
			  tenant_id, payee_partner_id, period_from, period_to, certificate_no,
			  status, total_base, total_tax, created_by_user_id
			) values ($1,$2,$3,$4,$5,'draft',$6,$7,$8)
			returning id`,
			tu.TenantID, body.PayeePartnerID, from, to, certNo, totalBase, totalTax, tu.AppUserID).Scan(&certID)
		if err != nil {
			response.Validation(w, map[string]string{"certificate_no": "Certificate number already exists or invalid."})
			return
		}

		for _, ln := range openRows {
			srcDate := ln.SourceDate.Format("2006-01-02")
			_, err = tx.Exec(r.Context(), `
				insert into public.fin_bir_2307_certificate_lines (
				  certificate_id, withholding_line_id, atc_code, description, rate_pct,
				  base_amount, tax_amount, source_ref_type, source_ref_id, source_date
				) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
				certID, ln.ID, ln.ATCCode, ln.Description, ln.RatePct,
				ln.BaseAmount, ln.TaxAmount, ln.RefType, ln.RefID, srcDate)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save certificate lines.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save certificate.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bir2307.create", "fin_bir_2307_certificate", &certID, nil, body)
		cert, _ := load2307Certificate(r.Context(), pool, tu.TenantID, certID)
		response.OK(w, cert, "Created.")
	}
}

func get2307Certificate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		cert, err := load2307Certificate(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Certificate not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, cert, "OK")
	}
}

func issue2307Certificate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_bir_2307_certificates
			set status = 'issued', issued_at = now()
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"status": "Only draft certificates can be issued."})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bir2307.issue", "fin_bir_2307_certificate", &id, nil, nil)
		cert, _ := load2307Certificate(r.Context(), pool, tu.TenantID, id)
		response.OK(w, cert, "Issued.")
	}
}

func void2307Certificate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_bir_2307_certificates
			set status = 'void', voided_at = now()
			where id = $1 and tenant_id = $2 and status in ('draft', 'issued')`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"status": "Certificate cannot be voided."})
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bir2307.void", "fin_bir_2307_certificate", &id, nil, nil)
		cert, _ := load2307Certificate(r.Context(), pool, tu.TenantID, id)
		response.OK(w, cert, "Voided.")
	}
}

func get2307CertificatePrint(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		cert, err := load2307Certificate(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Certificate not found.", "ERR_NOT_FOUND")
			return
		}
		if cert.Status == "void" {
			response.Validation(w, map[string]string{"status": "Void certificates cannot be printed."})
			return
		}

		var payor bir2307Party
		var payorTin *string
		_ = pool.QueryRow(r.Context(), `
			select t.company_name, t.address, t.phone, t.email,
			  coalesce(nullif(trim(t.tin), ''), nullif(trim(tb.settings->'receipt'->>'tax_id'), ''))
			from public.tenants t
			left join public.tenant_branding tb on tb.tenant_id = t.id
			where t.id = $1`, tu.TenantID).
			Scan(&payor.CompanyName, &payor.Address, &payor.Phone, &payor.Email, &payorTin)
		payor.Tin = payorTin

		var payee bir2307Party
		_ = pool.QueryRow(r.Context(), `
			select company_name, tin, address, phone, email
			from public.inv_partners
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			cert.PayeePartnerID, tu.TenantID).
			Scan(&payee.CompanyName, &payee.Tin, &payee.Address, &payee.Phone, &payee.Email)

		var rows []bir2307WithholdingRow
		for _, ln := range cert.Lines {
			rows = append(rows, bir2307WithholdingRow{
				Code:        ln.ATCCode,
				Description: ln.Description,
				RatePct:     ln.RatePct,
				BaseAmount:  ln.BaseAmount,
				TaxAmount:   ln.TaxAmount,
			})
		}

		response.OK(w, bir2307PrintPayload{
			CertificateNo: cert.CertificateNo,
			PaymentDate:   cert.PeriodTo,
			PaymentNo:     cert.CertificateNo,
			DateNoDisplay: cert.CertificateNo,
			Payor:         payor,
			Payee:         payee,
			Lines:         rows,
			TotalBase:     cert.TotalBase,
			TotalTax:      cert.TotalTax,
		}, "OK")
	}
}

func get1601EQWorkpaper(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		rows, err := aggregateStatutoryWHT(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build 1601-EQ workpaper.", "ERR_INTERNAL")
			return
		}
		var totalBase, totalTax float64
		for _, row := range rows {
			totalBase += row.TotalBase
			totalTax += row.TotalTax
		}
		response.OK(w, statutory1601Payload{
			PeriodFrom: from.Format("2006-01-02"),
			PeriodTo:   to.Format("2006-01-02"),
			Rows:       rows,
			TotalBase:  totalBase,
			TotalTax:   totalTax,
			Disclaimer: statutoryDisclaimer,
		}, "OK")
	}
}

func exportAlphalistEWT(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		rows, err := aggregateStatutoryWHT(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export alphalist.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="alphalist-ewt_%s_%s.csv"`, from.Format("20060102"), to.Format("20060102")))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"period_from", "period_to", "atc_code", "description", "rate_pct", "payee_tin", "payee_name", "total_base", "total_tax"})
		for _, row := range rows {
			_ = cw.Write([]string{
				from.Format("2006-01-02"),
				to.Format("2006-01-02"),
				row.ATCCode,
				row.Description,
				fmt.Sprintf("%.4f", row.RatePct),
				row.PayeeTIN,
				row.PayeeName,
				fmt.Sprintf("%.4f", row.TotalBase),
				fmt.Sprintf("%.4f", row.TotalTax),
			})
		}
		cw.Flush()
	}
}

const statutoryDisclaimer = "For accountant review — not a BIR e-filing submission."

func load2307Certificate(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (bir2307Certificate, error) {
	var cert bir2307Certificate
	err := pool.QueryRow(ctx, `
		select c.id, c.payee_partner_id, coalesce(p.company_name, ''), c.period_from::text, c.period_to::text,
		  c.certificate_no, c.status, c.total_base::float8, c.total_tax::float8,
		  c.issued_at::text, c.voided_at::text, c.created_at::text
		from public.fin_bir_2307_certificates c
		left join public.inv_partners p on p.id = c.payee_partner_id
		where c.id = $1 and c.tenant_id = $2`, id, tenantID).
		Scan(&cert.ID, &cert.PayeePartnerID, &cert.PayeeName, &cert.PeriodFrom, &cert.PeriodTo,
			&cert.CertificateNo, &cert.Status, &cert.TotalBase, &cert.TotalTax,
			&cert.IssuedAt, &cert.VoidedAt, &cert.CreatedAt)
	if err != nil {
		return bir2307Certificate{}, err
	}
	lineRows, err := pool.Query(ctx, `
		select id, withholding_line_id, atc_code, description, rate_pct::float8,
		  base_amount::float8, tax_amount::float8, source_ref_type, source_ref_id, source_date::text
		from public.fin_bir_2307_certificate_lines
		where certificate_id = $1
		order by id`, id)
	if err != nil {
		return bir2307Certificate{}, err
	}
	defer lineRows.Close()
	for lineRows.Next() {
		var ln bir2307CertificateLine
		if err := lineRows.Scan(&ln.ID, &ln.WithholdingLineID, &ln.ATCCode, &ln.Description, &ln.RatePct,
			&ln.BaseAmount, &ln.TaxAmount, &ln.SourceRefType, &ln.SourceRefID, &ln.SourceDate); err != nil {
			return bir2307Certificate{}, err
		}
		cert.Lines = append(cert.Lines, ln)
	}
	if cert.Lines == nil {
		cert.Lines = []bir2307CertificateLine{}
	}
	return cert, nil
}

func loadOpenWithholdingForPartner(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, from, to time.Time) ([]openWithholdingRow, error) {
	rows, err := pool.Query(ctx, openWithholdingSQL(), tenantID, partnerID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []openWithholdingRow
	for rows.Next() {
		var row openWithholdingRow
		if err := rows.Scan(&row.ID, &row.RefType, &row.RefID, &row.SourceDate,
			&row.ATCCode, &row.Description, &row.RatePct, &row.BaseAmount, &row.TaxAmount); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}

func aggregateStatutoryWHT(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) ([]statutory1601Row, error) {
	q := `
		select
		  coalesce(nullif(trim(tc.atc_code), ''), tc.code),
		  tc.description,
		  tc.rate_pct::float8,
		  coalesce(nullif(trim(p.tin), ''), ''),
		  coalesce(p.company_name, ''),
		  sum(wl.base_amount)::float8,
		  sum(wl.tax_amount)::float8
		from public.fin_withholding_tax_lines wl
		join public.fin_withholding_tax_codes tc on tc.id = wl.tax_code_id
		left join lateral (
		  select pv.partner_id, pv.payment_date as doc_date
		  from public.fin_payment_vouchers pv
		  where wl.ref_type = 'payment_voucher' and pv.id = wl.ref_id and pv.tenant_id = wl.tenant_id and pv.deleted_at is null
		  union all
		  select si.partner_id, si.invoice_date as doc_date
		  from public.fin_supplier_invoices si
		  join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id and je.status = 'posted'
		  where wl.ref_type = 'supplier_invoice' and si.id = wl.ref_id and si.tenant_id = wl.tenant_id and si.deleted_at is null
		) src on true
		left join public.inv_partners p on p.id = src.partner_id
		where wl.tenant_id = $1
		  and src.doc_date between $2 and $3
		group by coalesce(nullif(trim(tc.atc_code), ''), tc.code), tc.description, tc.rate_pct, p.tin, p.company_name
		order by coalesce(nullif(trim(tc.atc_code), ''), tc.code), p.company_name`
	rows, err := pool.Query(ctx, q, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []statutory1601Row
	for rows.Next() {
		var row statutory1601Row
		if err := rows.Scan(&row.ATCCode, &row.Description, &row.RatePct, &row.PayeeTIN, &row.PayeeName, &row.TotalBase, &row.TotalTax); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []statutory1601Row{}
	}
	return out, nil
}

func openWithholdingSQL() string {
	return `
		select wl.id, wl.ref_type, wl.ref_id, src.doc_date,
		  coalesce(nullif(trim(tc.atc_code), ''), tc.code), tc.description, tc.rate_pct::float8, wl.base_amount::float8, wl.tax_amount::float8
		from public.fin_withholding_tax_lines wl
		join public.fin_withholding_tax_codes tc on tc.id = wl.tax_code_id
		join lateral (
		  select pv.partner_id, pv.payment_date as doc_date
		  from public.fin_payment_vouchers pv
		  where wl.ref_type = 'payment_voucher' and pv.id = wl.ref_id and pv.tenant_id = wl.tenant_id and pv.deleted_at is null
		  union all
		  select si.partner_id, si.invoice_date as doc_date
		  from public.fin_supplier_invoices si
		  join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id and je.status = 'posted'
		  where wl.ref_type = 'supplier_invoice' and si.id = wl.ref_id and si.tenant_id = wl.tenant_id and si.deleted_at is null
		) src on true
		where wl.tenant_id = $1
		  and src.partner_id = $2
		  and src.doc_date between $3 and $4
		  and not exists (
		    select 1
		    from public.fin_bir_2307_certificate_lines cl
		    join public.fin_bir_2307_certificates c on c.id = cl.certificate_id
		    where cl.withholding_line_id = wl.id and c.status = 'issued'
		  )
		order by src.doc_date, wl.id`
}
