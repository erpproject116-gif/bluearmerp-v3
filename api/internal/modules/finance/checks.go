package finance

import (
	"encoding/json"
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

type Check struct {
	ID            int64   `json:"id"`
	CheckNo       string  `json:"check_no"`
	CheckDate     string  `json:"check_date"`
	BankAccountID *int64  `json:"bank_account_id,omitempty"`
	PayeeName     string  `json:"payee_name"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"`
}

type checkBody struct {
	CheckNo       string  `json:"check_no"`
	CheckDate     string  `json:"check_date"`
	BankAccountID *int64  `json:"bank_account_id"`
	PayeeName     string  `json:"payee_name"`
	Amount        float64 `json:"amount"`
	Status        string  `json:"status"`
}

func registerCheckRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.check_read", auth.AccessRead)).Get("/checks", listChecks(pool))
	r.With(auth.RequirePermission("finance.check_write", auth.AccessWrite)).Post("/checks", createCheck(pool))
	r.With(auth.RequirePermission("finance.check_write", auth.AccessWrite)).Patch("/checks/{id}/status", patchCheckStatus(pool))
}

func listChecks(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, check_no, check_date::text, bank_account_id, payee_name, amount::float8, status
			from public.fin_checks
			where tenant_id = $1
			order by check_date desc, check_no desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list checks.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Check
		for rows.Next() {
			var row Check
			if err := rows.Scan(&row.ID, &row.CheckNo, &row.CheckDate, &row.BankAccountID, &row.PayeeName, &row.Amount, &row.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read checks.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Check{}
		}
		response.OK(w, out, "OK")
	}
}

func createCheck(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body checkBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		checkNo := strings.TrimSpace(body.CheckNo)
		payee := strings.TrimSpace(body.PayeeName)
		if checkNo == "" || payee == "" {
			response.Validation(w, map[string]string{"check_no": "Check number and payee are required."})
			return
		}
		checkDate := strings.TrimSpace(body.CheckDate)
		if checkDate == "" {
			checkDate = time.Now().Format("2006-01-02")
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "issued"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_checks (tenant_id, check_no, check_date, bank_account_id, payee_name, amount, status, created_by_user_id)
			values ($1, $2, $3::date, $4, $5, $6, $7, $8)
			returning id`,
			tu.TenantID, checkNo, checkDate, body.BankAccountID, payee, body.Amount, status, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create check.", "ERR_INTERNAL")
			return
		}
		row := Check{ID: id, CheckNo: checkNo, CheckDate: checkDate, BankAccountID: body.BankAccountID, PayeeName: payee, Amount: body.Amount, Status: status}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.check.create", "fin_check", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchCheckStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := strings.TrimSpace(body.Status)
		switch status {
		case "issued", "cleared", "stale", "cancelled":
		default:
			response.Validation(w, map[string]string{"status": "Invalid status."})
			return
		}
		clearedAt := interface{}(nil)
		if status == "cleared" {
			clearedAt = time.Now()
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_checks set status = $1, cleared_at = $2, updated_at = now()
			where id = $3 and tenant_id = $4`, status, clearedAt, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Check not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.check.status", "fin_check", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "status": status}, "Updated.")
	}
}
