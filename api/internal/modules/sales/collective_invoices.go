package sales

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type CollectiveInvoice struct {
	ID                 int64   `json:"id"`
	InvoiceDate        string  `json:"invoice_date"`
	DateSeq            int     `json:"date_seq"`
	DateNoDisplay      string  `json:"date_no_display"`
	AccountingSlipNo   *string `json:"accounting_slip_no,omitempty"`
	ReceivableNo       *string `json:"receivable_no,omitempty"`
	PartnerID          int64   `json:"partner_id"`
	CustomerName       string  `json:"customer_name"`
	DepartmentID       *int64  `json:"department_id,omitempty"`
	ProjectID          *int64  `json:"project_id,omitempty"`
	PicUserID          *int64  `json:"pic_user_id,omitempty"`
	TaxTypeID          *int64  `json:"tax_type_id,omitempty"`
	Status             string  `json:"status"`
	Source             string  `json:"source"`
	BatchKey           *string `json:"batch_key,omitempty"`
	Subtotal           float64 `json:"subtotal"`
	TaxTotal           float64 `json:"tax_total"`
	GrandTotal         float64 `json:"grand_total"`
	DueDate            *string `json:"due_date,omitempty"`
	DisplayReceivableNo string `json:"display_receivable_no,omitempty"`
	SalesCount         int     `json:"sales_count,omitempty"`
}

type createCollectiveInvoiceBody struct {
	SalesIDs  []int64 `json:"sales_ids"`
	AutoBatch *struct {
		PartnerID  int64  `json:"partner_id"`
		OrderDate  string `json:"order_date"`
		TaxTypeID  *int64 `json:"tax_type_id"`
		DepartmentID *int64 `json:"department_id"`
	} `json:"auto_batch"`
	InvoiceDate *string `json:"invoice_date"`
}

type patchCollectiveStatusBody struct {
	Status string `json:"status"`
}

type patchReceivableNoBody struct {
	ReceivableNo string `json:"receivable_no"`
}

func registerCollectiveInvoiceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/collective-invoices", listCollectiveInvoices(pool))
	r.Post("/collective-invoices", createCollectiveInvoice(pool))
	r.Post("/collective-invoices/auto-batch", autoBatchCollectiveInvoices(pool))
	r.Get("/collective-invoice-status-report/export", exportCollectiveInvoiceStatusReport(pool))
	r.Get("/collective-invoice-status-report", listCollectiveInvoiceStatusReport(pool))
	r.Get("/collective-invoices/{id}/transactions/export", exportCollectiveInvoiceTransactions(pool))
	r.Get("/collective-invoices/{id}/transactions", listCollectiveInvoiceTransactions(pool))
	r.Get("/collective-invoices/{id}/print-slip", getCollectiveInvoicePrintSlip(pool))
	r.Get("/collective-invoices/{id}/print-invoice", getCollectiveInvoicePrintInvoice(pool))
	r.Patch("/collective-invoices/{id}/receivable-no", patchCollectiveInvoiceReceivableNo(pool))
	r.Patch("/collective-invoices/{id}/status", patchCollectiveInvoiceStatus(pool))
	r.Get("/collective-invoices/{id}", getCollectiveInvoice(pool))
}

func scanCollectiveInvoice(scanner interface{ Scan(dest ...any) error }) (CollectiveInvoice, error) {
	var row CollectiveInvoice
	var invoiceDate time.Time
	var dueDate *time.Time
	var acctSlip, recvNo, batchKey *string
	err := scanner.Scan(
		&row.ID, &invoiceDate, &row.DateSeq, &acctSlip, &recvNo,
		&row.PartnerID, &row.CustomerName,
		&row.DepartmentID, &row.ProjectID, &row.PicUserID, &row.TaxTypeID,
		&row.Status, &row.Source, &batchKey,
		&row.Subtotal, &row.TaxTotal, &row.GrandTotal, &dueDate,
		&row.SalesCount,
	)
	if err != nil {
		return CollectiveInvoice{}, err
	}
	row.InvoiceDate = dateToStr(invoiceDate)
	row.DateNoDisplay = formatDateNoDisplay(invoiceDate, row.DateSeq)
	row.AccountingSlipNo = acctSlip
	row.ReceivableNo = recvNo
	row.BatchKey = batchKey
	row.DueDate = datePtrToStr(dueDate)
	row.DisplayReceivableNo = displayReceivableNo(recvNo, nil)
	return row, nil
}

func displayReceivableNo(header *string, saleSiDr *string) string {
	if header != nil && strings.TrimSpace(*header) != "" {
		return strings.TrimSpace(*header)
	}
	if saleSiDr != nil && strings.TrimSpace(*saleSiDr) != "" {
		return strings.TrimSpace(*saleSiDr)
	}
	return ""
}

const collectiveInvoiceListSelect = `
  select ci.id, ci.invoice_date, ci.date_seq, ci.accounting_slip_no, ci.receivable_no,
    ci.partner_id, coalesce(p.company_name, ''),
    ci.department_id, ci.project_id, ci.pic_user_id, ci.tax_type_id,
    ci.status, ci.source, ci.batch_key,
    ci.subtotal::float8, ci.tax_total::float8, ci.grand_total::float8, ci.due_date,
    (select count(*)::int from public.sa_collective_invoice_sales cis where cis.collective_invoice_id = ci.id)`

const collectiveInvoiceFrom = `
  from public.sa_collective_invoices ci
  join public.inv_partners p on p.id = ci.partner_id`

func listCollectiveInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"invoice_date": "ci.invoice_date",
		"grand_total":  "ci.grand_total",
		"status":       "ci.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "invoice_date", allowed)
		offset := httputil.Offset(p)
		where := "ci.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if v := strings.TrimSpace(r.URL.Query().Get("status")); v != "" && v != "all" {
			where += fmt.Sprintf(" and ci.status = $%d", n)
			args = append(args, v)
			n++
		}
		if v := strings.TrimSpace(r.URL.Query().Get("q")); v != "" {
			where += fmt.Sprintf(` and (coalesce(p.company_name, '') ilike $%d or coalesce(ci.receivable_no, '') ilike $%d)`, n, n)
			args = append(args, "%"+v+"%")
			n++
		}
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "ci.invoice_date"
		}
		q := fmt.Sprintf(`%s, count(*) over() %s where %s order by %s %s limit $%d offset $%d`,
			collectiveInvoiceListSelect, collectiveInvoiceFrom, where, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list collective invoices.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CollectiveInvoice
		var total int64
		for rows.Next() {
			var row CollectiveInvoice
			var invoiceDate time.Time
			var dueDate *time.Time
			var acctSlip, recvNo, batchKey *string
			var rowTotal int64
			if err := rows.Scan(
				&row.ID, &invoiceDate, &row.DateSeq, &acctSlip, &recvNo,
				&row.PartnerID, &row.CustomerName,
				&row.DepartmentID, &row.ProjectID, &row.PicUserID, &row.TaxTypeID,
				&row.Status, &row.Source, &batchKey,
				&row.Subtotal, &row.TaxTotal, &row.GrandTotal, &dueDate,
				&row.SalesCount, &rowTotal,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read collective invoices.", "ERR_INTERNAL")
				return
			}
			row.InvoiceDate = dateToStr(invoiceDate)
			row.DateNoDisplay = formatDateNoDisplay(invoiceDate, row.DateSeq)
			row.AccountingSlipNo = acctSlip
			row.ReceivableNo = recvNo
			row.BatchKey = batchKey
			row.DueDate = datePtrToStr(dueDate)
			row.DisplayReceivableNo = displayReceivableNo(recvNo, nil)
			total = rowTotal
			out = append(out, row)
		}
		if out == nil {
			out = []CollectiveInvoice{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getCollectiveInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func loadCollectiveInvoice(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (CollectiveInvoice, error) {
	q := collectiveInvoiceListSelect + collectiveInvoiceFrom + ` where ci.id = $1 and ci.tenant_id = $2`
	return scanCollectiveInvoice(pool.QueryRow(ctx, q, id, tenantID))
}

type eligibleSale struct {
	ID         int64
	PartnerID  int64
	Subtotal   float64
	TaxTotal   float64
	GrandTotal float64
	DueDate    *time.Time
	DepartmentID *int64
	ProjectID  *int64
	PicUserID  *int64
	TaxTypeID  int64
	SiDrNo     *string
	OrderDate  time.Time
}

func fetchEligibleSales(ctx context.Context, pool *pgxpool.Pool, tenantID int64, salesIDs []int64) ([]eligibleSale, error) {
	if len(salesIDs) == 0 {
		return nil, errors.New("no sales ids")
	}
	q := `
		select s.id, s.partner_id, s.subtotal::float8, s.tax_total::float8, s.grand_total::float8,
		  s.due_date, s.department_id, s.project_id, s.pic_user_id, s.tax_type_id, s.si_dr_no, s.order_date
		from public.sa_sales s
		where s.tenant_id = $1 and s.id = any($2::bigint[])
		  and s.deleted_at is null and s.invoicing_status = false
		  and s.progress_status = 'completed'
		  and not exists (
		    select 1 from public.sa_collective_invoice_sales cis where cis.sales_id = s.id
		  )`
	rows, err := pool.Query(ctx, q, tenantID, salesIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []eligibleSale
	for rows.Next() {
		var row eligibleSale
		if err := rows.Scan(
			&row.ID, &row.PartnerID, &row.Subtotal, &row.TaxTotal, &row.GrandTotal,
			&row.DueDate, &row.DepartmentID, &row.ProjectID, &row.PicUserID, &row.TaxTypeID, &row.SiDrNo, &row.OrderDate,
		); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, nil
}

func validateSamePartner(sales []eligibleSale) (int64, error) {
	if len(sales) == 0 {
		return 0, errors.New("no eligible sales")
	}
	partnerID := sales[0].PartnerID
	for _, s := range sales[1:] {
		if s.PartnerID != partnerID {
			return 0, errors.New("all sales must belong to the same customer")
		}
	}
	return partnerID, nil
}

func sumEligible(sales []eligibleSale) (sub, tax, grand float64, due *time.Time) {
	for _, s := range sales {
		sub += s.Subtotal
		tax += s.TaxTotal
		grand += s.GrandTotal
		if s.DueDate != nil && (due == nil || s.DueDate.After(*due)) {
			d := *s.DueDate
			due = &d
		}
	}
	return
}

func insertCollectiveInvoice(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, invoiceDate time.Time, partnerID int64, sales []eligibleSale, source, batchKey string) (int64, error) {
	sub, tax, grand, due := sumEligible(sales)
	var dateSeq int
	if err := tx.QueryRow(ctx,
		`select date_seq from public.allocate_collective_invoice_sequences($1, $2::date)`,
		tu.TenantID, invoiceDate).Scan(&dateSeq); err != nil {
		return 0, err
	}
	dept := sales[0].DepartmentID
	proj := sales[0].ProjectID
	pic := sales[0].PicUserID
	taxType := sales[0].TaxTypeID
	var batchKeyPtr *string
	if batchKey != "" {
		batchKeyPtr = &batchKey
	}
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.sa_collective_invoices (
		  tenant_id, invoice_date, date_seq, partner_id, department_id, project_id, pic_user_id, tax_type_id,
		  status, source, batch_key, subtotal, tax_total, grand_total, due_date, created_by_user_id
		) values ($1,$2,$3,$4,$5,$6,$7,$8,'unconfirmed',$9,$10,$11,$12,$13,$14,$15)
		returning id`,
		tu.TenantID, invoiceDate, dateSeq, partnerID, dept, proj, pic, taxType,
		source, batchKeyPtr, sub, tax, grand, due, tu.AppUserID).Scan(&id)
	if err != nil {
		return 0, err
	}
	for i, s := range sales {
		if _, err := tx.Exec(ctx, `
			insert into public.sa_collective_invoice_sales (collective_invoice_id, sales_id, sort_order)
			values ($1, $2, $3)`, id, s.ID, i+1); err != nil {
			return 0, err
		}
	}
	return id, nil
}

func createCollectiveInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body createCollectiveInvoiceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SalesIDs) == 0 {
			response.Validation(w, map[string]string{"sales_ids": "At least one sale is required."})
			return
		}
		sales, err := fetchEligibleSales(r.Context(), pool, tu.TenantID, body.SalesIDs)
		if err != nil || len(sales) != len(body.SalesIDs) {
			response.Validation(w, map[string]string{"sales_ids": "One or more sales are not eligible (already invoiced, not completed, or linked)."})
			return
		}
		partnerID, err := validateSamePartner(sales)
		if err != nil {
			response.Validation(w, map[string]string{"sales_ids": err.Error()})
			return
		}
		invoiceDate := time.Now()
		if body.InvoiceDate != nil && strings.TrimSpace(*body.InvoiceDate) != "" {
			invoiceDate, err = parseDate(*body.InvoiceDate)
			if err != nil {
				response.Validation(w, map[string]string{"invoice_date": "Use YYYY-MM-DD."})
				return
			}
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create invoice.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		id, err := insertCollectiveInvoice(r.Context(), tx, tu, invoiceDate, partnerID, sales, "manual", "")
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create collective invoice.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.collective_invoice.create", "sa_collective_invoice", &id, nil, body)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save invoice.", "ERR_INTERNAL")
			return
		}
		row, _ := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func autoBatchCollectiveInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		orderDateStr := strings.TrimSpace(r.URL.Query().Get("order_date"))
		if orderDateStr == "" {
			orderDateStr = time.Now().Format("2006-01-02")
		}
		orderDate, err := parseDate(orderDateStr)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Use YYYY-MM-DD."})
			return
		}
		q := `
			select s.id
			from public.sa_sales s
			where s.tenant_id = $1 and s.order_date = $2::date
			  and s.deleted_at is null and s.invoicing_status = false
			  and s.progress_status = 'completed'
			  and not exists (select 1 from public.sa_collective_invoice_sales cis where cis.sales_id = s.id)
			order by s.partner_id, s.id`
		rows, err := pool.Query(r.Context(), q, tu.TenantID, orderDate)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to query sales.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var allIDs []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				continue
			}
			allIDs = append(allIDs, id)
		}
		type batchResult struct {
			Created int            `json:"created"`
			Skipped int            `json:"skipped"`
			Invoices []CollectiveInvoice `json:"invoices"`
		}
		result := batchResult{Invoices: []CollectiveInvoice{}}
		if len(allIDs) == 0 {
			response.OK(w, result, "No eligible sales.")
			return
		}
		eligible, err := fetchEligibleSales(r.Context(), pool, tu.TenantID, allIDs)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales.", "ERR_INTERNAL")
			return
		}
		byPartner := map[int64][]eligibleSale{}
		for _, s := range eligible {
			byPartner[s.PartnerID] = append(byPartner[s.PartnerID], s)
		}
		for partnerID, group := range byPartner {
			batchKey := fmt.Sprintf("partner:%d|date:%s", partnerID, dateToStr(orderDate))
			var existingID int64
			err := pool.QueryRow(r.Context(), `
				select id from public.sa_collective_invoices
				where tenant_id = $1 and batch_key = $2 and status <> 'cancelled'`,
				tu.TenantID, batchKey).Scan(&existingID)
			if err == nil {
				result.Skipped++
				continue
			}
			tx, err := pool.Begin(r.Context())
			if err != nil {
				continue
			}
			id, err := insertCollectiveInvoice(r.Context(), tx, tu, orderDate, partnerID, group, "auto_batch", batchKey)
			if err != nil {
				tx.Rollback(r.Context())
				result.Skipped++
				continue
			}
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.collective_invoice.auto_batch", "sa_collective_invoice", &id, nil, map[string]any{"batch_key": batchKey})
			if err := tx.Commit(r.Context()); err != nil {
				result.Skipped++
				continue
			}
			row, _ := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
			result.Invoices = append(result.Invoices, row)
			result.Created++
		}
		response.OK(w, result, "Batch complete.")
	}
}

func patchCollectiveInvoiceStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body patchCollectiveStatusBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := strings.TrimSpace(body.Status)
		switch status {
		case "unconfirmed", "e_approval", "confirmed", "cancelled":
		default:
			response.Validation(w, map[string]string{"status": "Invalid status."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if status == "cancelled" {
			if _, err := tx.Exec(r.Context(), `
				delete from public.sa_collective_invoice_sales where collective_invoice_id = $1`, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to unlink sales.", "ERR_INTERNAL")
				return
			}
		}
		confirmedAt := interface{}(nil)
		if status == "confirmed" {
			confirmedAt = time.Now()
			if _, err := tx.Exec(r.Context(), `
				update public.sa_sales s set invoicing_status = true, updated_at = now()
				from public.sa_collective_invoice_sales cis
				where cis.collective_invoice_id = $1 and cis.sales_id = s.id and s.tenant_id = $2`,
				id, tu.TenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update sales.", "ERR_INTERNAL")
				return
			}
		}
		tag, err := tx.Exec(r.Context(), `
			update public.sa_collective_invoices set status = $1,
			  confirmed_at = case when $1 = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
			  updated_at = now()
			where id = $2 and tenant_id = $3`, status, id, tu.TenantID)
		_ = confirmedAt
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.collective_invoice.status", "sa_collective_invoice", &id, nil, body)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		row, _ := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func patchCollectiveInvoiceReceivableNo(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body patchReceivableNoBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		recv := strings.TrimSpace(body.ReceivableNo)
		tag, err := pool.Exec(r.Context(), `
			update public.sa_collective_invoices set receivable_no = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, nullIfEmpty(recv), id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		row, _ := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}
