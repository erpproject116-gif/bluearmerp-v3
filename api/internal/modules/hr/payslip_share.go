package hr

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
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

type payslipDetail struct {
	Payslip
	PeriodStart string        `json:"period_start,omitempty"`
	PeriodEnd   string        `json:"period_end,omitempty"`
	Lines       []PayslipLine `json:"lines"`
	EmployerTotal float64     `json:"employer_total"`
}

type shareLinkResult struct {
	Token     string `json:"token"`
	URLPath   string `json:"url_path"`
	ExpiresAt string `json:"expires_at"`
}

func registerPayslipDetailRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessRead)).Get("/payslips/{id}", getPayslip(pool))
	r.With(auth.RequirePermission("hr.payroll_runs", auth.AccessWrite)).Post("/payslips/{id}/share-link", createPayslipShareLink(pool))
}

// RegisterPublicRoutes mounts token-based payslip viewing (no session auth).
func RegisterPublicRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/hr/payslips/shared/{token}", viewSharedPayslip(pool))
}

func getPayslip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid payslip id."})
			return
		}
		detail, err := loadPayslipDetail(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Payslip not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, detail, "OK")
	}
}

func createPayslipShareLink(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid payslip id."})
			return
		}
		var exists int64
		if err := pool.QueryRow(r.Context(), `
			select id from public.hr_payslips where id=$1 and tenant_id=$2`, id, tu.TenantID).Scan(&exists); err != nil {
			response.Err(w, http.StatusNotFound, "Payslip not found.", "ERR_NOT_FOUND")
			return
		}
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create share link.", "ERR_INTERNAL")
			return
		}
		token := hex.EncodeToString(raw)
		sum := sha256.Sum256([]byte(token))
		hash := hex.EncodeToString(sum[:])
		expires := time.Now().Add(72 * time.Hour)
		if _, err := pool.Exec(r.Context(), `
			insert into public.hr_payslip_share_tokens (tenant_id, payslip_id, token_hash, expires_at, created_by_user_id)
			values ($1,$2,$3,$4,$5)`, tu.TenantID, id, hash, expires, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save share link.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.payslip.share", "hr_payslip", &id, nil, map[string]any{
			"expires_at": expires,
		})
		response.OK(w, shareLinkResult{
			Token:     token,
			URLPath:   "/payslip/" + token,
			ExpiresAt: expires.UTC().Format(time.RFC3339),
		}, "Share link created. Send only to this employee.")
	}
}

func viewSharedPayslip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimSpace(chi.URLParam(r, "token"))
		if len(token) < 32 {
			response.Err(w, http.StatusNotFound, "Link not found or expired.", "ERR_NOT_FOUND")
			return
		}
		sum := sha256.Sum256([]byte(token))
		hash := hex.EncodeToString(sum[:])
		var tenantID, payslipID, tokenID int64
		var expires time.Time
		err := pool.QueryRow(r.Context(), `
			select id, tenant_id, payslip_id, expires_at
			from public.hr_payslip_share_tokens
			where token_hash = $1 and revoked_at is null`, hash).Scan(&tokenID, &tenantID, &payslipID, &expires)
		if err != nil || time.Now().After(expires) {
			response.Err(w, http.StatusNotFound, "Link not found or expired.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `update public.hr_payslip_share_tokens set last_viewed_at = now() where id = $1`, tokenID)
		detail, err := loadPayslipDetail(r.Context(), pool, tenantID, payslipID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Payslip not found.", "ERR_NOT_FOUND")
			return
		}
		// Never expose journal entry / tenant internals on public view beyond payslip itself.
		detail.JournalEntryID = nil
		response.OK(w, detail, "OK")
	}
}

func loadPayslipDetail(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (payslipDetail, error) {
	var d payslipDetail
	err := pool.QueryRow(ctx, `
		select ps.id, ps.pay_period_id, pp.period_label, pp.period_start::text, pp.period_end::text,
		  ps.employee_id, e.employee_no, e.full_name,
		  ps.gross_pay::float8, ps.deductions::float8, ps.net_pay::float8, ps.status, ps.journal_entry_id
		from public.hr_payslips ps
		join public.hr_pay_periods pp on pp.id = ps.pay_period_id
		join public.hr_employees e on e.id = ps.employee_id
		where ps.id = $1 and ps.tenant_id = $2`, id, tenantID).Scan(
		&d.ID, &d.PayPeriodID, &d.PeriodLabel, &d.PeriodStart, &d.PeriodEnd,
		&d.EmployeeID, &d.EmployeeNo, &d.EmployeeName,
		&d.GrossPay, &d.Deductions, &d.NetPay, &d.Status, &d.JournalEntryID,
	)
	if err != nil {
		return d, err
	}
	rows, err := pool.Query(ctx, `
		select id, line_no, line_type, coalesce(line_code,''), description, amount::float8
		from public.hr_payslip_lines where payslip_id = $1 order by line_no`, id)
	if err != nil {
		return d, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln PayslipLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.LineType, &ln.LineCode, &ln.Description, &ln.Amount); err != nil {
			return d, err
		}
		if ln.LineType == "employer_share" {
			d.EmployerTotal += ln.Amount
		}
		d.Lines = append(d.Lines, ln)
	}
	if d.Lines == nil {
		d.Lines = []PayslipLine{}
	}
	d.EmployerTotal = roundMoney(d.EmployerTotal)
	return d, nil
}
