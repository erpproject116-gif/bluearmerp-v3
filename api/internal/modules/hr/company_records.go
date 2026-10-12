package hr

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type companyRecord struct {
	ID         int64   `json:"id"`
	RecordKind string  `json:"record_kind"`
	Title      string  `json:"title"`
	Body       string  `json:"body"`
	RecordDate *string `json:"record_date,omitempty"`
	Status     string  `json:"status"`
	CreatedAt  string  `json:"created_at"`
}

func registerCompanyRecordRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.employees", auth.AccessRead)).Get("/company-records", listCompanyRecords(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/company-records", createCompanyRecord(pool))
}

func listCompanyRecords(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		kind := strings.TrimSpace(r.URL.Query().Get("kind"))
		where := "tenant_id=$1 and status='active'"
		args := []any{tu.TenantID}
		if kind == "policy" || kind == "announcement" || kind == "event" {
			where += " and record_kind=$2"
			args = append(args, kind)
		}
		rows, err := pool.Query(r.Context(), `
			select id, record_kind, title, body, record_date::text, status, created_at::text
			from public.hr_company_records
			where `+where+`
			order by coalesce(record_date, created_at::date) desc, id desc
			limit 200`, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load records.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []companyRecord{}
		for rows.Next() {
			var row companyRecord
			if err := rows.Scan(&row.ID, &row.RecordKind, &row.Title, &row.Body, &row.RecordDate, &row.Status, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read record.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createCompanyRecord(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			RecordKind string  `json:"record_kind"`
			Title      string  `json:"title"`
			Body       string  `json:"body"`
			RecordDate *string `json:"record_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		kind := strings.TrimSpace(body.RecordKind)
		if kind != "policy" && kind != "announcement" && kind != "event" {
			response.Validation(w, map[string]string{"record_kind": "Choose policy, announcement, or event."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		var recordDate any
		if body.RecordDate != nil && strings.TrimSpace(*body.RecordDate) != "" {
			recordDate = strings.TrimSpace(*body.RecordDate)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_company_records
			  (tenant_id, record_kind, title, body, record_date, created_by_user_id)
			values ($1,$2,$3,$4,$5::date,$6) returning id`,
			tu.TenantID, kind, title, strings.TrimSpace(body.Body), recordDate, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.company_record.create", "hr_company_record", &id, nil, body)
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}
