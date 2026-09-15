package finance

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type recurringInvoiceLine struct {
	ID        int64   `json:"id,omitempty"`
	ItemID    *int64  `json:"item_id,omitempty"`
	ItemCode  string  `json:"item_code"`
	ItemName  string  `json:"item_name"`
	Qty       float64 `json:"qty"`
	UnitPrice float64 `json:"unit_price"`
	LineNo    int     `json:"line_no"`
}

type recurringInvoiceRow struct {
	ID           int64                  `json:"id"`
	Name         string                 `json:"name"`
	PartnerID    *int64                 `json:"partner_id,omitempty"`
	CustomerName string                 `json:"customer_name"`
	Description  string                 `json:"description"`
	Amount       float64                `json:"amount"`
	Frequency    string                 `json:"frequency"`
	NextRunDate  string                 `json:"next_run_date"`
	EndDate      *string                `json:"end_date,omitempty"`
	IsActive     bool                   `json:"is_active"`
	LastSalesID  *int64                 `json:"last_sales_id,omitempty"`
	LastRunAt    *string                `json:"last_run_at,omitempty"`
	Notes        string                 `json:"notes"`
	Lines        []recurringInvoiceLine `json:"lines,omitempty"`
}

type recurringInvoiceBody struct {
	Name         string                 `json:"name"`
	PartnerID    *int64                 `json:"partner_id"`
	CustomerName string                 `json:"customer_name"`
	Description  string                 `json:"description"`
	Amount       float64                `json:"amount"`
	Frequency    string                 `json:"frequency"`
	NextRunDate  string                 `json:"next_run_date"`
	EndDate      *string                `json:"end_date"`
	IsActive     *bool                  `json:"is_active"`
	Notes        string                 `json:"notes"`
	Lines        []recurringInvoiceLine `json:"lines"`
}

type recurringGenerateResult struct {
	SalesID     int64  `json:"sales_id"`
	SalesNo     string `json:"sales_no"`
	NextRunDate string `json:"next_run_date"`
	IsActive    bool   `json:"is_active"`
}

func registerRecurringInvoiceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.recurring_invoices", auth.AccessRead)).Get("/recurring-invoices", listRecurringInvoices(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices", auth.AccessRead)).Get("/recurring-invoices/{id}", getRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Post("/recurring-invoices", createRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Patch("/recurring-invoices/{id}", updateRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Post("/recurring-invoices/{id}/generate", generateRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Post("/recurring-invoices/run-due", runDueRecurringInvoices(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Delete("/recurring-invoices/{id}", softDeleteRecurringInvoice(pool))
}

func scanRecurringInvoiceRow(rows pgx.Rows) (recurringInvoiceRow, error) {
	var row recurringInvoiceRow
	err := rows.Scan(&row.ID, &row.Name, &row.PartnerID, &row.CustomerName, &row.Description, &row.Amount, &row.Frequency,
		&row.NextRunDate, &row.EndDate, &row.IsActive, &row.LastSalesID, &row.LastRunAt, &row.Notes)
	return row, err
}

func listRecurringInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) != "0"
		where := "tenant_id = $1 and deleted_at is null"
		if activeOnly {
			where += " and is_active = true"
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select id, name, partner_id, customer_name, description, amount::float8, frequency,
			  next_run_date::text, end_date::text, is_active, last_sales_id, last_run_at::text, coalesce(notes, '')
			from public.fin_recurring_invoices
			where %s
			order by is_active desc, next_run_date asc, name`, where), tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list recurring invoices. Apply migration 217 if needed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []recurringInvoiceRow{}
		for rows.Next() {
			row, err := scanRecurringInvoiceRow(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read recurring invoices.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func getRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, name, partner_id, customer_name, description, amount::float8, frequency,
			  next_run_date::text, end_date::text, is_active, last_sales_id, last_run_at::text, coalesce(notes, '')
			from public.fin_recurring_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load recurring invoice.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		if !rows.Next() {
			response.Err(w, http.StatusNotFound, "Recurring invoice not found.", "ERR_NOT_FOUND")
			return
		}
		row, err := scanRecurringInvoiceRow(rows)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read recurring invoice.", "ERR_INTERNAL")
			return
		}
		lines, err := loadRecurringInvoiceLines(r.Context(), pool, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load lines.", "ERR_INTERNAL")
			return
		}
		row.Lines = lines
		response.OK(w, row, "OK")
	}
}

func loadRecurringInvoiceLines(ctx context.Context, q pgxQueryable, recurringID int64) ([]recurringInvoiceLine, error) {
	rows, err := q.Query(ctx, `
		select id, item_id, item_code, item_name, qty::float8, unit_price::float8, line_no
		from public.fin_recurring_invoice_lines
		where recurring_invoice_id = $1
		order by line_no, id`, recurringID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []recurringInvoiceLine{}
	for rows.Next() {
		var line recurringInvoiceLine
		if err := rows.Scan(&line.ID, &line.ItemID, &line.ItemCode, &line.ItemName, &line.Qty, &line.UnitPrice, &line.LineNo); err != nil {
			return nil, err
		}
		out = append(out, line)
	}
	return out, rows.Err()
}

type pgxQueryable interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func saveRecurringInvoiceLines(ctx context.Context, tx pgx.Tx, recurringID int64, lines []recurringInvoiceLine) error {
	if _, err := tx.Exec(ctx, `delete from public.fin_recurring_invoice_lines where recurring_invoice_id = $1`, recurringID); err != nil {
		return err
	}
	for i, line := range lines {
		lineNo := line.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		qty := line.Qty
		if qty <= 0 {
			qty = 1
		}
		_, err := tx.Exec(ctx, `
			insert into public.fin_recurring_invoice_lines (
			  recurring_invoice_id, line_no, item_id, item_code, item_name, qty, unit_price
			) values ($1, $2, $3, $4, $5, $6, $7)`,
			recurringID, lineNo, line.ItemID,
			strings.TrimSpace(line.ItemCode), strings.TrimSpace(line.ItemName), qty, line.UnitPrice)
		if err != nil {
			return err
		}
	}
	return nil
}

func sumRecurringLineAmount(lines []recurringInvoiceLine) float64 {
	var total float64
	for _, line := range lines {
		qty := line.Qty
		if qty <= 0 {
			qty = 1
		}
		total += qty * line.UnitPrice
	}
	return total
}

func createRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body recurringInvoiceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.Name)
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		amount := body.Amount
		if len(body.Lines) > 0 {
			amount = sumRecurringLineAmount(body.Lines)
		}
		if amount < 0 {
			response.Validation(w, map[string]string{"amount": "Amount must be >= 0."})
			return
		}
		freq := strings.ToLower(strings.TrimSpace(body.Frequency))
		if freq == "" {
			freq = "monthly"
		}
		switch freq {
		case "weekly", "monthly", "quarterly", "yearly":
		default:
			response.Validation(w, map[string]string{"frequency": "Use weekly, monthly, quarterly, or yearly."})
			return
		}
		nextRun := time.Now()
		if strings.TrimSpace(body.NextRunDate) != "" {
			d, err := time.Parse("2006-01-02", strings.TrimSpace(body.NextRunDate))
			if err != nil {
				response.Validation(w, map[string]string{"next_run_date": "Invalid date. Use YYYY-MM-DD."})
				return
			}
			nextRun = d
		}
		customer := strings.TrimSpace(body.CustomerName)
		if customer == "" && body.PartnerID != nil {
			_ = pool.QueryRow(r.Context(), `select coalesce(company_name, '') from public.inv_partners where id = $1 and tenant_id = $2`,
				*body.PartnerID, tu.TenantID).Scan(&customer)
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var endDate any
		if body.EndDate != nil && strings.TrimSpace(*body.EndDate) != "" {
			endDate = strings.TrimSpace(*body.EndDate)
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.fin_recurring_invoices (
			  tenant_id, name, partner_id, customer_name, description, amount, frequency,
			  next_run_date, end_date, is_active, notes, created_by_user_id
			) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12)
			returning id`,
			tu.TenantID, name, body.PartnerID, customer, strings.TrimSpace(body.Description), amount, freq,
			nextRun.Format("2006-01-02"), endDate, active, strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create recurring invoice.", "ERR_INTERNAL")
			return
		}
		if len(body.Lines) > 0 {
			if err := saveRecurringInvoiceLines(r.Context(), tx, id, body.Lines); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "recurring_invoice.create", "recurring_invoice", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Recurring invoice created.")
	}
}

func updateRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body recurringInvoiceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		freq := strings.ToLower(strings.TrimSpace(body.Frequency))
		if freq == "" {
			freq = "monthly"
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		nextRun := strings.TrimSpace(body.NextRunDate)
		if nextRun == "" {
			nextRun = time.Now().Format("2006-01-02")
		}
		var endDate any
		if body.EndDate != nil && strings.TrimSpace(*body.EndDate) != "" {
			endDate = strings.TrimSpace(*body.EndDate)
		}
		amount := body.Amount
		if body.Lines != nil {
			if len(body.Lines) > 0 {
				amount = sumRecurringLineAmount(body.Lines)
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.fin_recurring_invoices set
			  name = coalesce(nullif($3, ''), name),
			  partner_id = coalesce($4, partner_id),
			  customer_name = coalesce(nullif($5, ''), customer_name),
			  description = coalesce(nullif($6, ''), description),
			  amount = case when $7::numeric >= 0 then $7 else amount end,
			  frequency = $8,
			  next_run_date = $9::date,
			  end_date = $10::date,
			  is_active = $11,
			  notes = coalesce(nullif($12, ''), notes),
			  updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID, strings.TrimSpace(body.Name), body.PartnerID, strings.TrimSpace(body.CustomerName),
			strings.TrimSpace(body.Description), amount, freq, nextRun, endDate, active, strings.TrimSpace(body.Notes))
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Recurring invoice not found.", "ERR_NOT_FOUND")
			return
		}
		if body.Lines != nil {
			if err := saveRecurringInvoiceLines(r.Context(), tx, id, body.Lines); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
				return
			}
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		response.OK(w, nil, "Updated.")
	}
}

func advanceRecurringDate(from time.Time, freq string) time.Time {
	switch freq {
	case "weekly":
		return from.AddDate(0, 0, 7)
	case "quarterly":
		return from.AddDate(0, 3, 0)
	case "yearly":
		return from.AddDate(1, 0, 0)
	default:
		return from.AddDate(0, 1, 0)
	}
}

func generateRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		result, err := generateRecurringInvoiceByID(r.Context(), pool, tu.TenantID, &tu.AppUserID, id)
		if err != nil {
			respondRecurringGenerateError(w, err)
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "recurring_invoice.generate", "recurring_invoice", &id, nil, map[string]any{
			"sales_id": result.SalesID, "sales_no": result.SalesNo,
		})
		response.OK(w, result, "Sales invoice generated from recurring schedule.")
	}
}

func runDueRecurringInvoices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		today := time.Now().Format("2006-01-02")
		result, err := runDueRecurringInvoicesForTenant(r.Context(), pool, tu.TenantID, &tu.AppUserID, today)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to run due recurring invoices.", "ERR_INTERNAL")
			return
		}
		response.OK(w, result, "Due recurring invoices processed.")
	}
}

type runDueRecurringResult struct {
	Processed int                      `json:"processed"`
	Generated []recurringGenerateResult `json:"generated"`
	Errors    []string                 `json:"errors,omitempty"`
}

func runDueRecurringInvoicesForTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, userID *int64, today string) (runDueRecurringResult, error) {
	var result runDueRecurringResult
	rows, err := pool.Query(ctx, `
		select id from public.fin_recurring_invoices
		where tenant_id = $1 and deleted_at is null
		  and is_active = true and next_run_date <= $2::date
		order by next_run_date, id`, tenantID, today)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return result, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	for _, id := range ids {
		gen, err := generateRecurringInvoiceByID(ctx, pool, tenantID, userID, id)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("recurring %d: %s", id, err.Error()))
			continue
		}
		result.Processed++
		result.Generated = append(result.Generated, gen)
	}
	return result, nil
}

type recurringGenerateErr struct {
	status  int
	message string
	fields  map[string]string
}

func (e *recurringGenerateErr) Error() string { return e.message }

func respondRecurringGenerateError(w http.ResponseWriter, err error) {
	if ge, ok := err.(*recurringGenerateErr); ok {
		if len(ge.fields) > 0 {
			response.Validation(w, ge.fields)
			return
		}
		response.Err(w, ge.status, ge.message, "ERR_BAD_REQUEST")
		return
	}
	response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
}

func generateRecurringInvoiceByID(ctx context.Context, pool *pgxpool.Pool, tenantID int64, userID *int64, id int64) (recurringGenerateResult, error) {
	var result recurringGenerateResult
	tx, err := pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)

	gen, err := executeRecurringGenerate(ctx, tx, tenantID, userID, id)
	if err != nil {
		return result, err
	}
	if err := tx.Commit(ctx); err != nil {
		return result, err
	}
	return gen, nil
}

func executeRecurringGenerate(ctx context.Context, tx pgx.Tx, tenantID int64, userID *int64, id int64) (recurringGenerateResult, error) {
	var result recurringGenerateResult
	var (
		partnerID   *int64
		description string
		amount      float64
		frequency   string
		nextRunStr  string
		endDateStr  *string
		isActive    bool
		name        string
		discard     string
	)
	err := tx.QueryRow(ctx, `
		select name, partner_id, customer_name, description, amount::float8, frequency,
		  next_run_date::text, end_date::text, is_active
		from public.fin_recurring_invoices
		where id = $1 and tenant_id = $2 and deleted_at is null for update`,
		id, tenantID).Scan(&name, &partnerID, &discard, &description, &amount, &frequency, &nextRunStr, &endDateStr, &isActive)
	if err != nil {
		return result, &recurringGenerateErr{status: http.StatusNotFound, message: "Recurring invoice not found."}
	}
	if !isActive {
		return result, &recurringGenerateErr{status: http.StatusBadRequest, message: "Recurring invoice is inactive."}
	}
	if partnerID == nil || *partnerID <= 0 {
		return result, &recurringGenerateErr{
			status: http.StatusBadRequest,
			fields: map[string]string{"partner_id": "Link a customer partner before generating a sales invoice."},
		}
	}

	lines, err := loadRecurringInvoiceLines(ctx, tx, id)
	if err != nil {
		return result, err
	}
	lineTotal := sumRecurringLineAmount(lines)
	if lineTotal > 0 {
		amount = lineTotal
	}

	var taxTypeID, currencyID, locationID int64
	err = tx.QueryRow(ctx, `
		select id from public.quo_tax_types
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by sort_order, id limit 1`, tenantID).Scan(&taxTypeID)
	if err != nil {
		return result, &recurringGenerateErr{status: http.StatusBadRequest, message: "No tax type configured. Set up Tax Types first."}
	}
	err = tx.QueryRow(ctx, `
		select id from public.quo_currencies
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by is_default desc, id limit 1`, tenantID).Scan(&currencyID)
	if err != nil {
		return result, &recurringGenerateErr{status: http.StatusBadRequest, message: "No currency configured."}
	}
	err = tx.QueryRow(ctx, `
		select id from public.inv_locations
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by location_code, id limit 1`, tenantID).Scan(&locationID)
	if err != nil {
		return result, &recurringGenerateErr{status: http.StatusBadRequest, message: "No location configured."}
	}

	orderDate := time.Now()
	var dateSeq int
	var salesNo string
	err = tx.QueryRow(ctx, `
		select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
		tenantID, orderDate.Format("2006-01-02")).Scan(&dateSeq, &salesNo)
	if err != nil {
		return result, err
	}

	var salesID int64
	err = tx.QueryRow(ctx, `
		insert into public.sa_sales (
		  tenant_id, order_date, date_seq, sales_no, tax_type_id, currency_id, partner_id,
		  location_id, notes, progress_status, subtotal, tax_total, grand_total, created_by_user_id
		) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, 0, $10, $11)
		returning id`,
		tenantID, orderDate.Format("2006-01-02"), dateSeq, salesNo, taxTypeID, currencyID, *partnerID,
		locationID, fmt.Sprintf("Generated from recurring invoice: %s", name), amount, userID,
	).Scan(&salesID)
	if err != nil {
		return result, fmt.Errorf("failed to create sales invoice: %w", err)
	}

	if len(lines) > 0 {
		for i, line := range lines {
			qty := line.Qty
			if qty <= 0 {
				qty = 1
			}
			lineAmt := qty * line.UnitPrice
			itemCode := strings.TrimSpace(line.ItemCode)
			if itemCode == "" {
				itemCode = "RECUR"
			}
			itemName := strings.TrimSpace(line.ItemName)
			if itemName == "" {
				itemName = strings.TrimSpace(description)
				if itemName == "" {
					itemName = name
				}
			}
			_, err = tx.Exec(ctx, `
				insert into public.sa_sales_lines (
				  sales_id, line_no, item_code, item_name, description, qty,
				  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
				) values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $7, $8)`,
				salesID, i+1, itemCode, itemName, itemName, qty, line.UnitPrice, lineAmt)
			if err != nil {
				return result, fmt.Errorf("failed to create sales line: %w", err)
			}
		}
	} else {
		lineDesc := strings.TrimSpace(description)
		if lineDesc == "" {
			lineDesc = name
		}
		_, err = tx.Exec(ctx, `
			insert into public.sa_sales_lines (
			  sales_id, line_no, item_code, item_name, description, qty,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1, 1, 'RECUR', $2, $3, 1, $4, $4, 0, $4, $4)`,
			salesID, lineDesc, lineDesc, amount)
		if err != nil {
			return result, fmt.Errorf("failed to create sales line: %w", err)
		}
	}

	uid := int64(0)
	if userID != nil {
		uid = *userID
	}
	if err := sales.SyncSalesInvoiceJournalFromDefaultsTx(ctx, tx, tenantID, uid, salesID); err != nil {
		return result, fmt.Errorf("sales invoice journal: %w", err)
	}

	nextRun, _ := time.Parse("2006-01-02", nextRunStr)
	if nextRun.IsZero() {
		nextRun = orderDate
	}
	newNext := advanceRecurringDate(nextRun, frequency)
	stillActive := true
	if endDateStr != nil && strings.TrimSpace(*endDateStr) != "" {
		end, eerr := time.Parse("2006-01-02", strings.TrimSpace(*endDateStr))
		if eerr == nil && newNext.After(end) {
			stillActive = false
		}
	}
	_, err = tx.Exec(ctx, `
		update public.fin_recurring_invoices set
		  last_sales_id = $3, last_run_at = now(), next_run_date = $4::date,
		  is_active = $5, updated_at = now()
		where id = $1 and tenant_id = $2`,
		id, tenantID, salesID, newNext.Format("2006-01-02"), stillActive)
	if err != nil {
		return result, err
	}

	result = recurringGenerateResult{
		SalesID:     salesID,
		SalesNo:     salesNo,
		NextRunDate: newNext.Format("2006-01-02"),
		IsActive:    stillActive,
	}
	return result, nil
}

func softDeleteRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_recurring_invoices", "recurring_invoice.delete", "recurring_invoice")
	}
}
