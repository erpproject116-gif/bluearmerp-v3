package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customerregistry"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/day1commercial"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type day1PaymentRow struct {
	CustomerID         int64          `json:"customer_id"`
	Email              string         `json:"email"`
	FullName           string         `json:"full_name"`
	CompanyName        string         `json:"company_name"`
	TenantID           *int64         `json:"tenant_id,omitempty"`
	CompanyCode        string         `json:"company_code,omitempty"`
	CommercialStatus   string         `json:"commercial_status"`
	Day1CompletedAt    *time.Time     `json:"day1_completed_at,omitempty"`
	PaymentRequestedAt *time.Time     `json:"payment_requested_at,omitempty"`
	AmountCentavos     int            `json:"amount_centavos"`
	Day1Snapshot       map[string]any `json:"day1_snapshot,omitempty"`
	PaymentNote        string         `json:"payment_note,omitempty"`
}

func (s *service) listDay1Payments(w http.ResponseWriter, r *http.Request) {
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))
	if statusFilter == "" {
		statusFilter = day1commercial.StatusAwaitingPayment
	}
	allowed := map[string]bool{
		day1commercial.StatusAwaitingPayment: true,
		day1commercial.StatusSetup:           true,
		day1commercial.StatusCancelled:       true,
		"all_locked":                         true,
	}
	if !allowed[statusFilter] {
		response.Validation(w, map[string]string{"status": "Use awaiting_payment, setup, cancelled, or all_locked."})
		return
	}

	q := `
		select pc.id, pc.email, coalesce(pc.full_name,''), coalesce(pc.company_name,''),
		       pc.tenant_id, coalesce(t.company_code,''),
		       coalesce(pc.commercial_status,'unlocked'),
		       pc.day1_completed_at, pc.payment_requested_at,
		       coalesce(pc.paywall_amount_centavos, $1),
		       pc.day1_snapshot, coalesce(pc.payment_note,'')
		from public.platform_customers pc
		left join public.tenants t on t.id = pc.tenant_id
		where `
	args := []any{day1commercial.DefaultAmountCentavos}
	switch statusFilter {
	case "all_locked":
		q += ` pc.commercial_status in ('setup','awaiting_payment','cancelled') `
	default:
		q += ` pc.commercial_status = $2 `
		args = append(args, statusFilter)
	}
	q += ` order by coalesce(pc.day1_completed_at, pc.payment_requested_at, pc.updated_at) desc nulls last limit 200`

	rows, err := s.pool.Query(r.Context(), q, args...)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list Day 1 payments.", "ERR_INTERNAL")
		return
	}
	defer rows.Close()

	out := []day1PaymentRow{}
	for rows.Next() {
		var row day1PaymentRow
		var snapRaw []byte
		if err := rows.Scan(
			&row.CustomerID, &row.Email, &row.FullName, &row.CompanyName,
			&row.TenantID, &row.CompanyCode, &row.CommercialStatus,
			&row.Day1CompletedAt, &row.PaymentRequestedAt, &row.AmountCentavos,
			&snapRaw, &row.PaymentNote,
		); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to read Day 1 payments.", "ERR_INTERNAL")
			return
		}
		if len(snapRaw) > 0 {
			_ = json.Unmarshal(snapRaw, &row.Day1Snapshot)
		}
		out = append(out, row)
	}
	response.OK(w, map[string]any{"rows": out, "status": statusFilter}, "OK")
}

func (s *service) confirmDay1Payment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	note := strings.TrimSpace(body.Note)

	tu, _ := auth.FromContext(r.Context())
	var confirmedBy *int64
	if tu.AppUserID > 0 {
		uid := tu.AppUserID
		confirmedBy = &uid
	} else if tu.PlatformUserID > 0 {
		uid := tu.PlatformUserID
		confirmedBy = &uid
	}

	tenantID, err := day1commercial.ConfirmPayment(r.Context(), s.pool, id, confirmedBy, note)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusBadRequest, "Customer is not awaiting Day 1 payment.", "ERR_BAD_REQUEST")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to confirm payment.", "ERR_INTERNAL")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id,
		"[day1] Platform confirmed GCash Day 1 payment. Commercial unlocked.")
	_, _ = customerregistry.UpdateCustomerUrgency(r.Context(), s.pool, id, time.Now())
	tid := tenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.confirm_day1_payment", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: &tid,
		TargetType: "platform_customers", TargetID: &id,
		Summary: "Confirmed Day 1 GCash payment; commercial unlocked",
	})
	response.OK(w, map[string]any{
		"customer_id":       id,
		"tenant_id":         tenantID,
		"commercial_status": day1commercial.StatusUnlocked,
	}, "Payment confirmed. Workspace unlocked for trading.")
}

func (s *service) rejectDay1Payment(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{"id": "Invalid customer id."})
		return
	}
	var body struct {
		Note string `json:"note"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	note := strings.TrimSpace(body.Note)
	if note == "" {
		note = "Day 1 payment rejected by product owner."
	}

	tenantID, err := day1commercial.RejectPayment(r.Context(), s.pool, id, note)
	if err != nil {
		if err == pgx.ErrNoRows {
			response.Err(w, http.StatusBadRequest, "Customer is not awaiting Day 1 payment.", "ERR_BAD_REQUEST")
			return
		}
		response.Err(w, http.StatusInternalServerError, "Failed to reject payment.", "ERR_INTERNAL")
		return
	}
	customerregistry.AppendCRMLeadNote(r.Context(), s.pool, id, "[day1] "+note)
	tu, _ := auth.FromContext(r.Context())
	tid := tenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode: "platform.customer.reject_day1_payment", EventKind: "change",
		HTTPMethod: "POST", RoutePath: r.URL.Path,
		PlatformCustomerID: &id, TenantID: &tid,
		TargetType: "platform_customers", TargetID: &id,
		Summary: "Rejected Day 1 payment; commercial cancelled",
	})
	response.OK(w, map[string]any{
		"customer_id":       id,
		"tenant_id":         tenantID,
		"commercial_status": day1commercial.StatusCancelled,
	}, "Day 1 payment rejected.")
}
