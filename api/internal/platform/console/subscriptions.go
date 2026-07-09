package console

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/billing"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/plans"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type createSubBody struct {
	PlanKind string `json:"plan_kind"`
	PlanID   int64  `json:"plan_id"`
	Notes    string `json:"notes"`
}

func (s *service) createSubscription(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || customerID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body createSubBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	var tenantID int64
	err = s.pool.QueryRow(r.Context(), `select tenant_id from public.platform_customers where id = $1`, customerID).Scan(&tenantID)
	if err != nil || tenantID <= 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no tenant workspace yet.", "ERR_BAD_REQUEST")
		return
	}

	plan, ep, err := plans.ResolvePaidPlan(r.Context(), s.pool, strings.TrimSpace(body.PlanKind), body.PlanID)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Validation(w, map[string]string{"plan_kind": "Unknown or inactive plan."})
			return
		}
		response.Validation(w, map[string]string{"plan": err.Error()})
		return
	}

	startsAt := time.Now()
	var endsAt *time.Time
	if plan.LockInMonths > 0 {
		t := startsAt.AddDate(0, plan.LockInMonths, 0)
		endsAt = &t
	}
	monthly := ep.Monthly
	var total float64
	if ep.Total != nil {
		total = *ep.Total
	} else if plan.LockInMonths > 0 {
		total = monthly * float64(plan.LockInMonths)
	}
	notes := strings.TrimSpace(body.Notes)
	if ep.PromoActive && notes == "" {
		notes = "Promo: " + ep.PromoLabel
	}

	_, _ = s.pool.Exec(r.Context(), `
		update public.platform_subscriptions
		set status = 'cancelled', updated_at = now()
		where customer_id = $1 and status = 'active'`, customerID)

	pid := plan.ID
	subID, err := customerregistry.CreateSubscription(r.Context(), s.pool, customerID, tenantID,
		plan.PlanCode, &pid, startsAt, endsAt, plan.LockInMonths, monthly, total, notes)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create subscription.", "ERR_INTERNAL")
		return
	}
	_, _ = customerregistry.UpdateCustomerUrgency(r.Context(), s.pool, customerID, time.Now())
	response.OK(w, map[string]any{
		"subscription_id": subID,
		"plan_code":       plan.PlanCode,
		"monthly_amount":  monthly,
		"total_amount":    total,
		"promo_applied":   ep.PromoActive,
	}, "Subscription activated.")
}

type extendTrialBody struct {
	Days int `json:"days"`
}

func (s *service) extendTrial(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || customerID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body extendTrialBody
	_ = json.NewDecoder(r.Body).Decode(&body)
	days := body.Days
	if days <= 0 {
		days = 30
	}
	tag, err := s.pool.Exec(r.Context(), `
		update public.platform_subscriptions
		set ends_at = coalesce(ends_at, now()) + ($2 || ' days')::interval,
		    updated_at = now()
		where customer_id = $1 and plan_kind = 'trial_90d' and status = 'active'`, customerID, strconv.Itoa(days))
	if err != nil || tag.RowsAffected() == 0 {
		response.Err(w, http.StatusBadRequest, "No active trial subscription.", "ERR_BAD_REQUEST")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, customerID, fmt.Sprintf("[admin] Trial extended %d days.", days))
	_, _ = customerregistry.UpdateCustomerUrgency(r.Context(), s.pool, customerID, time.Now())
	response.OK(w, map[string]any{"customer_id": customerID, "days_added": days}, "Trial extended.")
}

func (s *service) convertDemo(w http.ResponseWriter, r *http.Request) {
	customerID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || customerID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var tenantID int64
	err = s.pool.QueryRow(r.Context(), `select tenant_id from public.platform_customers where id = $1`, customerID).Scan(&tenantID)
	if err != nil || tenantID <= 0 {
		response.Err(w, http.StatusBadRequest, "Customer has no tenant.", "ERR_BAD_REQUEST")
		return
	}

	_, _ = s.pool.Exec(r.Context(), `
		update public.platform_subscriptions set status = 'expired', updated_at = now()
		where customer_id = $1 and plan_kind = 'demo' and status = 'active'`, customerID)
	_, _ = s.pool.Exec(r.Context(), `
		update public.tenants set is_demo = false, demo_expires_at = null, updated_at = now()
		where id = $1`, tenantID)

	trialPlan, err := plans.GetByCode(r.Context(), s.pool, customerregistry.PlanTrial90d)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Trial plan not configured.", "ERR_INTERNAL")
		return
	}
	startsAt := time.Now()
	endsAt := startsAt.Add(customerregistry.TrialDays * 24 * time.Hour)
	pid := trialPlan.ID
	subID, err := customerregistry.CreateSubscription(r.Context(), s.pool, customerID, tenantID,
		customerregistry.PlanTrial90d, &pid, startsAt, &endsAt, 0, 0, 0, "Converted from demo to trial.")
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, customerID, "[admin] Demo converted to 90-day trial.")
	_, _ = customerregistry.UpdateCustomerUrgency(r.Context(), s.pool, customerID, time.Now())
	response.OK(w, map[string]any{"subscription_id": subID, "trial_ends_at": endsAt}, "Converted to trial.")
}

type createInvoiceBody struct {
	PeriodStart string  `json:"period_start"`
	PeriodEnd   string  `json:"period_end"`
	Amount      float64 `json:"amount"`
	DueDate     string  `json:"due_date"`
	InvoiceNo   string  `json:"invoice_no"`
	Notes       string  `json:"notes"`
}

func (s *service) createInvoice(w http.ResponseWriter, r *http.Request) {
	subID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || subID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid subscription id."})
		return
	}
	var body createInvoiceBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return
	}
	invNo := strings.TrimSpace(body.InvoiceNo)
	if invNo == "" {
		invNo = fmt.Sprintf("INV-%d-%d", subID, time.Now().Unix())
	}
	ps, pe, dd, err := parseDates(body.PeriodStart, body.PeriodEnd, body.DueDate)
	if err != nil {
		response.Validation(w, map[string]string{"dates": err.Error()})
		return
	}
	amount := body.Amount
	if amount <= 0 {
		var monthly float64
		_ = s.pool.QueryRow(r.Context(), `select monthly_amount from public.platform_subscriptions where id = $1`, subID).Scan(&monthly)
		amount = monthly
	}

	var invID int64
	var tenantID int64
	err = s.pool.QueryRow(r.Context(), `
		insert into public.platform_subscription_invoices
		  (subscription_id, invoice_no, period_start, period_end, amount, due_date, status, notes)
		values ($1, $2, $3, $4, $5, $6, 'issued', nullif($7,''))
		returning id`, subID, invNo, ps, pe, amount, dd, body.Notes).Scan(&invID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to create invoice.", "ERR_INTERNAL")
		return
	}
	_ = s.pool.QueryRow(r.Context(), `select tenant_id from public.platform_subscriptions where id = $1`, subID).Scan(&tenantID)
	if tenantID > 0 {
		tx, txErr := s.pool.Begin(r.Context())
		if txErr == nil {
			key := fmt.Sprintf("platform.billing.invoice_issued:%d", invID)
			_ = billing.EnqueueInvoiceIssuedTx(r.Context(), tx, tenantID, key, invID)
			_ = tx.Commit(r.Context())
		}
	}
	response.OK(w, map[string]any{"invoice_id": invID, "invoice_no": invNo}, "Invoice issued.")
}

func (s *service) markInvoicePaid(w http.ResponseWriter, r *http.Request) {
	invID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || invID <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid invoice id."})
		return
	}
	tu, _ := auth.FromContext(r.Context())
	var markedBy *string
	if tu.AuthUserID != "" {
		markedBy = &tu.AuthUserID
	}

	tx, err := s.pool.Begin(r.Context())
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
		return
	}
	result, err := billing.MarkInvoicePaidTx(r.Context(), tx, billing.MarkPaidParams{
		InvoiceID: invID,
		Provider:  "manual",
		MarkedBy:  markedBy,
	})
	if err != nil {
		_ = tx.Rollback(r.Context())
		response.Err(w, http.StatusBadRequest, "Invoice not found or not issuable.", "ERR_BAD_REQUEST")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to mark paid.", "ERR_INTERNAL")
		return
	}
	billing.FinalizePaidInvoice(r.Context(), s.pool, result.CustomerID)
	response.OK(w, map[string]any{"invoice_id": invID, "already_paid": result.AlreadyPaid}, "Marked paid.")
}

func parseDates(ps, pe, dd string) (time.Time, time.Time, time.Time, error) {
	if ps == "" || pe == "" || dd == "" {
		return time.Time{}, time.Time{}, time.Time{}, fmt.Errorf("period_start, period_end, and due_date required (YYYY-MM-DD).")
	}
	pStart, err := time.Parse("2006-01-02", ps)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, fmt.Errorf("invalid period_start.")
	}
	pEnd, err := time.Parse("2006-01-02", pe)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, fmt.Errorf("invalid period_end.")
	}
	due, err := time.Parse("2006-01-02", dd)
	if err != nil {
		return time.Time{}, time.Time{}, time.Time{}, fmt.Errorf("invalid due_date.")
	}
	return pStart, pEnd, due, nil
}

func scanSubscriptions(rows pgx.Rows) []map[string]any {
	if rows == nil {
		return nil
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id int64
		var plan, status, notes *string
		var startsAt time.Time
		var endsAt *time.Time
		var lockIn int
		var monthly, total *float64
		var createdAt time.Time
		if err := rows.Scan(&id, &plan, &status, &startsAt, &endsAt, &lockIn, &monthly, &total, &notes, &createdAt); err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id": id, "plan_kind": plan, "status": status, "starts_at": startsAt,
			"ends_at": endsAt, "lock_in_months": lockIn, "monthly_amount": monthly,
			"total_contract_amount": total, "notes": notes, "created_at": createdAt,
		})
	}
	return out
}

func scanInvoices(rows pgx.Rows) []map[string]any {
	if rows == nil {
		return nil
	}
	defer rows.Close()
	out := make([]map[string]any, 0)
	for rows.Next() {
		var id int64
		var invNo, currency, status, notes, planKind *string
		var ps, pe, due time.Time
		var amount float64
		var paidAt *time.Time
		if err := rows.Scan(&id, &invNo, &ps, &pe, &amount, &currency, &due, &paidAt, &status, &notes, &planKind); err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id": id, "invoice_no": invNo, "period_start": ps, "period_end": pe,
			"amount": amount, "currency": currency, "due_date": due, "paid_at": paidAt,
			"status": status, "notes": notes, "plan_kind": planKind,
		})
	}
	return out
}
