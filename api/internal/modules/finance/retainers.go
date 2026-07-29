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

type retainerRow struct {
	ID              int64   `json:"id"`
	RetainerDate    string  `json:"retainer_date"`
	RetainerNo      string  `json:"retainer_no"`
	PartnerID       *int64  `json:"partner_id,omitempty"`
	CustomerName    string  `json:"customer_name"`
	AmountTotal     float64 `json:"amount_total"`
	RemainingAmount float64 `json:"remaining_amount"`
	Status          string  `json:"status"`
	Notes           string  `json:"notes"`
	OfficialReceiptID *int64 `json:"official_receipt_id,omitempty"`
}

type retainerBody struct {
	RetainerDate string  `json:"retainer_date"`
	PartnerID    *int64  `json:"partner_id"`
	CustomerName string  `json:"customer_name"`
	AmountTotal  float64 `json:"amount_total"`
	Notes        string  `json:"notes"`
	Status       string  `json:"status"`
}

type retainerApplyBody struct {
	SalesID       int64   `json:"sales_id"`
	AppliedAmount float64 `json:"applied_amount"`
}

func registerRetainerRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.retainers", auth.AccessRead)).Get("/retainer-invoices", listRetainers(pool))
	r.With(auth.RequirePermission("finance.retainers_write", auth.AccessWrite)).Post("/retainer-invoices", createRetainer(pool))
	r.With(auth.RequirePermission("finance.retainers_write", auth.AccessWrite)).Patch("/retainer-invoices/{id}", updateRetainer(pool))
	r.With(auth.RequirePermission("finance.retainers_write", auth.AccessWrite)).Post("/retainer-invoices/{id}/post", postRetainer(pool))
	r.With(auth.RequirePermission("finance.retainers_write", auth.AccessWrite)).Post("/retainer-invoices/{id}/apply", applyRetainer(pool))
	r.With(auth.RequirePermission("finance.retainers_write", auth.AccessWrite)).Delete("/retainer-invoices/{id}", softDeleteRetainer(pool))
}

func listRetainers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		status := strings.TrimSpace(r.URL.Query().Get("status"))
		where := "r.tenant_id = $1 and r.deleted_at is null"
		args := []any{tu.TenantID}
		n := 2
		if status != "" {
			where += fmt.Sprintf(" and r.status = $%d", n)
			args = append(args, status)
			n++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (r.retainer_no ilike $%d or r.customer_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select r.id, r.retainer_date::text, r.retainer_no, r.partner_id, r.customer_name,
			  r.amount_total::float8, r.remaining_amount::float8, r.status, r.notes, r.official_receipt_id
			from public.fin_retainer_invoices r
			where %s
			order by r.retainer_date desc, r.id desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list retainer invoices. Apply migration 217 if needed.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []retainerRow{}
		for rows.Next() {
			var row retainerRow
			if err := rows.Scan(&row.ID, &row.RetainerDate, &row.RetainerNo, &row.PartnerID, &row.CustomerName,
				&row.AmountTotal, &row.RemainingAmount, &row.Status, &row.Notes, &row.OfficialReceiptID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read retainer invoices.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createRetainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body retainerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.AmountTotal < 0 {
			response.Validation(w, map[string]string{"amount_total": "Amount must be >= 0."})
			return
		}
		retainerDate := time.Now()
		if strings.TrimSpace(body.RetainerDate) != "" {
			d, err := time.Parse("2006-01-02", strings.TrimSpace(body.RetainerDate))
			if err != nil {
				response.Validation(w, map[string]string{"retainer_date": "Invalid date. Use YYYY-MM-DD."})
				return
			}
			retainerDate = d
		}
		customer := strings.TrimSpace(body.CustomerName)
		if customer == "" && body.PartnerID != nil {
			_ = pool.QueryRow(r.Context(), `select coalesce(company_name, '') from public.inv_partners where id = $1 and tenant_id = $2`,
				*body.PartnerID, tu.TenantID).Scan(&customer)
		}
		var seq int
		_ = pool.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.fin_retainer_invoices
			where tenant_id = $1 and retainer_date = $2::date`, tu.TenantID, retainerDate.Format("2006-01-02")).Scan(&seq)
		if seq <= 0 {
			seq = 1
		}
		retainerNo := fmt.Sprintf("RI-%s-%d", retainerDate.Format("20060102"), seq)
		status := "draft"
		if body.Status == "open" {
			status = "open"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_retainer_invoices (
			  tenant_id, retainer_date, date_seq, retainer_no, partner_id, customer_name,
			  amount_total, remaining_amount, status, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $7, $8, $9, $10)
			returning id`,
			tu.TenantID, retainerDate.Format("2006-01-02"), seq, retainerNo, body.PartnerID, customer,
			body.AmountTotal, status, strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create retainer invoice.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "retainer.create", "retainer_invoice", &id, nil, nil)
		response.OK(w, map[string]any{"id": id, "retainer_no": retainerNo}, "Retainer invoice created.")
	}
}

func updateRetainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body retainerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_retainer_invoices set
			  customer_name = coalesce(nullif($3, ''), customer_name),
			  partner_id = coalesce($4, partner_id),
			  notes = coalesce(nullif($5, ''), notes),
			  amount_total = case when status = 'draft' and $6::numeric >= 0 then $6 else amount_total end,
			  remaining_amount = case when status = 'draft' and $6::numeric >= 0 then $6 else remaining_amount end,
			  updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status in ('draft', 'open')`,
			id, tu.TenantID, strings.TrimSpace(body.CustomerName), body.PartnerID,
			strings.TrimSpace(body.Notes), body.AmountTotal)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Retainer not found or not editable.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Updated.")
	}
}

func postRetainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_retainer_invoices
			set status = 'open', remaining_amount = amount_total, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusBadRequest, "Only draft retainers can be posted.", "ERR_BAD_REQUEST")
			return
		}
		response.OK(w, nil, "Retainer opened (ready to apply to invoices).")
	}
}

func applyRetainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body retainerApplyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.SalesID <= 0 || body.AppliedAmount <= 0 {
			response.Validation(w, map[string]string{"sales_id": "Sales and amount are required."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var remaining float64
		var status string
		err = tx.QueryRow(r.Context(), `
			select remaining_amount::float8, status from public.fin_retainer_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null for update`, id, tu.TenantID).Scan(&remaining, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Retainer not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "open" && status != "applied" {
			response.Err(w, http.StatusBadRequest, "Retainer must be open to apply.", "ERR_BAD_REQUEST")
			return
		}
		if body.AppliedAmount > remaining+0.0001 {
			response.Validation(w, map[string]string{"applied_amount": "Amount exceeds remaining retainer."})
			return
		}
		var salesOK bool
		_ = tx.QueryRow(r.Context(), `
			select exists(select 1 from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null)`,
			body.SalesID, tu.TenantID).Scan(&salesOK)
		if !salesOK {
			response.Validation(w, map[string]string{"sales_id": "Sales invoice not found."})
			return
		}
		_, err = tx.Exec(r.Context(), `
			insert into public.fin_retainer_applications (retainer_id, sales_id, applied_amount)
			values ($1, $2, $3)
			on conflict (retainer_id, sales_id) do update
			  set applied_amount = fin_retainer_applications.applied_amount + excluded.applied_amount`,
			id, body.SalesID, body.AppliedAmount)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply retainer.", "ERR_INTERNAL")
			return
		}
		newRem := remaining - body.AppliedAmount
		newStatus := "open"
		if newRem <= 0.0001 {
			newRem = 0
			newStatus = "applied"
		}
		_, err = tx.Exec(r.Context(), `
			update public.fin_retainer_invoices set remaining_amount = $3, status = $4, updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID, newRem, newStatus)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update retainer.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to commit.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"remaining_amount": newRem, "status": newStatus}, "Retainer applied to sales invoice.")
	}
}

func softDeleteRetainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		softDelete(pool, w, r, "fin_retainer_invoices", "retainer.delete", "retainer_invoice")
	}
}
