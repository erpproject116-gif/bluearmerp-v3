package finance

import (
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

type recurringInvoiceRow struct {
	ID           int64   `json:"id"`
	Name         string  `json:"name"`
	PartnerID    *int64  `json:"partner_id,omitempty"`
	CustomerName string  `json:"customer_name"`
	Description  string  `json:"description"`
	Amount       float64 `json:"amount"`
	Frequency    string  `json:"frequency"`
	NextRunDate  string  `json:"next_run_date"`
	EndDate      *string `json:"end_date,omitempty"`
	IsActive     bool    `json:"is_active"`
	LastSalesID  *int64  `json:"last_sales_id,omitempty"`
	LastRunAt    *string `json:"last_run_at,omitempty"`
	Notes        string  `json:"notes"`
}

type recurringInvoiceBody struct {
	Name         string  `json:"name"`
	PartnerID    *int64  `json:"partner_id"`
	CustomerName string  `json:"customer_name"`
	Description  string  `json:"description"`
	Amount       float64 `json:"amount"`
	Frequency    string  `json:"frequency"`
	NextRunDate  string  `json:"next_run_date"`
	EndDate      *string `json:"end_date"`
	IsActive     *bool   `json:"is_active"`
	Notes        string  `json:"notes"`
}

func registerRecurringInvoiceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.recurring_invoices", auth.AccessRead)).Get("/recurring-invoices", listRecurringInvoices(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Post("/recurring-invoices", createRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Patch("/recurring-invoices/{id}", updateRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Post("/recurring-invoices/{id}/generate", generateRecurringInvoice(pool))
	r.With(auth.RequirePermission("finance.recurring_invoices_write", auth.AccessWrite)).Delete("/recurring-invoices/{id}", softDeleteRecurringInvoice(pool))
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
			var row recurringInvoiceRow
			if err := rows.Scan(&row.ID, &row.Name, &row.PartnerID, &row.CustomerName, &row.Description, &row.Amount, &row.Frequency,
				&row.NextRunDate, &row.EndDate, &row.IsActive, &row.LastSalesID, &row.LastRunAt, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read recurring invoices.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
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
		if name == "" || body.Amount < 0 {
			response.Validation(w, map[string]string{"name": "Name is required.", "amount": "Amount must be >= 0."})
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
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_recurring_invoices (
			  tenant_id, name, partner_id, customer_name, description, amount, frequency,
			  next_run_date, end_date, is_active, notes, created_by_user_id
			) values ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date, $10, $11, $12)
			returning id`,
			tu.TenantID, name, body.PartnerID, customer, strings.TrimSpace(body.Description), body.Amount, freq,
			nextRun.Format("2006-01-02"), endDate, active, strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create recurring invoice.", "ERR_INTERNAL")
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
		tag, err := pool.Exec(r.Context(), `
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
			strings.TrimSpace(body.Description), body.Amount, freq, nextRun, endDate, active, strings.TrimSpace(body.Notes))
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Recurring invoice not found.", "ERR_NOT_FOUND")
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

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var (
			partnerID    *int64
			customerName string
			description  string
			amount       float64
			frequency    string
			nextRunStr   string
			endDateStr   *string
			isActive     bool
			name         string
		)
		err = tx.QueryRow(r.Context(), `
			select name, partner_id, customer_name, description, amount::float8, frequency,
			  next_run_date::text, end_date::text, is_active
			from public.fin_recurring_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null for update`,
			id, tu.TenantID).Scan(&name, &partnerID, &customerName, &description, &amount, &frequency, &nextRunStr, &endDateStr, &isActive)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Recurring invoice not found.", "ERR_NOT_FOUND")
			return
		}
		if !isActive {
			response.Err(w, http.StatusBadRequest, "Recurring invoice is inactive.", "ERR_BAD_REQUEST")
			return
		}
		if partnerID == nil || *partnerID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "Link a customer partner before generating a sales invoice."})
			return
		}

		var taxTypeID, currencyID, locationID int64
		err = tx.QueryRow(r.Context(), `
			select id from public.quo_tax_types
			where tenant_id = $1 and status = 'active' and deleted_at is null
			order by sort_order, id limit 1`, tu.TenantID).Scan(&taxTypeID)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "No tax type configured. Set up Tax Types first.", "ERR_BAD_REQUEST")
			return
		}
		err = tx.QueryRow(r.Context(), `
			select id from public.quo_currencies
			where tenant_id = $1 and status = 'active' and deleted_at is null
			order by is_default desc, id limit 1`, tu.TenantID).Scan(&currencyID)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "No currency configured.", "ERR_BAD_REQUEST")
			return
		}
		err = tx.QueryRow(r.Context(), `
			select id from public.inv_locations
			where tenant_id = $1 and status = 'active' and deleted_at is null
			order by location_code, id limit 1`, tu.TenantID).Scan(&locationID)
		if err != nil {
			response.Err(w, http.StatusBadRequest, "No location configured.", "ERR_BAD_REQUEST")
			return
		}

		orderDate := time.Now()
		var dateSeq int
		var salesNo string
		err = tx.QueryRow(r.Context(), `
			select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
			tu.TenantID, orderDate.Format("2006-01-02")).Scan(&dateSeq, &salesNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sales number.", "ERR_INTERNAL")
			return
		}

		lineDesc := strings.TrimSpace(description)
		if lineDesc == "" {
			lineDesc = name
		}
		var salesID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.sa_sales (
			  tenant_id, order_date, date_seq, sales_no, tax_type_id, currency_id, partner_id,
			  location_id, notes, progress_status, subtotal, tax_total, grand_total, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, 'unconfirmed', $10, 0, $10, $11)
			returning id`,
			tu.TenantID, orderDate.Format("2006-01-02"), dateSeq, salesNo, taxTypeID, currencyID, *partnerID,
			locationID, fmt.Sprintf("Generated from recurring invoice: %s", name), amount, tu.AppUserID,
		).Scan(&salesID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create sales invoice: "+err.Error(), "ERR_INTERNAL")
			return
		}
		_, err = tx.Exec(r.Context(), `
			insert into public.sa_sales_lines (
			  sales_id, line_no, item_code, item_name, description, qty,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1, 1, 'RECUR', $2, $3, 1, $4, $4, 0, $4, $4)`,
			salesID, lineDesc, lineDesc, amount)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create sales line.", "ERR_INTERNAL")
			return
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
		_, err = tx.Exec(r.Context(), `
			update public.fin_recurring_invoices set
			  last_sales_id = $3, last_run_at = now(), next_run_date = $4::date,
			  is_active = $5, updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, salesID, newNext.Format("2006-01-02"), stillActive)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update schedule.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "recurring_invoice.generate", "recurring_invoice", &id, nil, map[string]any{
			"sales_id": salesID, "sales_no": salesNo,
		})
		response.OK(w, map[string]any{
			"sales_id":      salesID,
			"sales_no":      salesNo,
			"next_run_date": newNext.Format("2006-01-02"),
			"is_active":     stillActive,
		}, "Sales invoice generated from recurring schedule.")
	}
}

func softDeleteRecurringInvoice(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_recurring_invoices", "recurring_invoice.delete", "recurring_invoice")
	}
}
