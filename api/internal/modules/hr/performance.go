package hr

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

type ReviewCycle struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	CycleKind   string `json:"cycle_kind"`
	TemplateID  *int64 `json:"template_id,omitempty"`
	PeriodStart string `json:"period_start"`
	PeriodEnd   string `json:"period_end"`
	Status      string `json:"status"`
}

type PerformanceReview struct {
	ID               int64           `json:"id"`
	CycleID          *int64          `json:"cycle_id,omitempty"`
	EmployeeID       int64           `json:"employee_id"`
	EmployeeNo       string          `json:"employee_no,omitempty"`
	EmployeeName     string          `json:"employee_name,omitempty"`
	Status           string          `json:"status"`
	SelfComments     string          `json:"self_comments"`
	ManagerComments  string          `json:"manager_comments"`
	OverallScore     *float64        `json:"overall_score,omitempty"`
	ScoresJSON       json.RawMessage `json:"scores_json"`
	AcknowledgedAt   *string         `json:"acknowledged_at,omitempty"`
	DocumentID       *int64          `json:"document_id,omitempty"`
}

func registerPerformanceRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.performance", auth.AccessRead)).Get("/performance/cycles", listReviewCycles(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Post("/performance/cycles", createReviewCycle(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Post("/performance/cycles/{id}/assign", assignReviews(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessRead)).Get("/performance/reviews", listReviews(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Patch("/performance/reviews/{id}", patchReview(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Post("/performance/reviews/{id}/acknowledge", ackReview(pool))
	r.With(auth.RequirePermission("hr.performance", auth.AccessWrite)).Post("/performance/reviews/{id}/store-201", storeReviewPDF(pool))
}

func listReviewCycles(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, name, cycle_kind, template_id, period_start::text, period_end::text, status
			from public.hr_review_cycles where tenant_id=$1 order by period_start desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cycles.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []ReviewCycle{}
		for rows.Next() {
			var row ReviewCycle
			_ = rows.Scan(&row.ID, &row.Name, &row.CycleKind, &row.TemplateID, &row.PeriodStart, &row.PeriodEnd, &row.Status)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createReviewCycle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body ReviewCycle
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
			response.Validation(w, map[string]string{"name": "Required."})
			return
		}
		kind := body.CycleKind
		if kind == "" {
			kind = "annual"
		}
		var tmplID *int64
		if body.TemplateID != nil {
			tmplID = body.TemplateID
		} else {
			var tid int64
			if err := pool.QueryRow(r.Context(), `
				select id from public.hr_review_templates where tenant_id=$1 and is_active order by id limit 1`, tu.TenantID).Scan(&tid); err == nil {
				tmplID = &tid
			}
		}
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_review_cycles (tenant_id, name, cycle_kind, template_id, period_start, period_end)
			values ($1,$2,$3,$4,$5::date,$6::date) returning id`,
			tu.TenantID, strings.TrimSpace(body.Name), kind, tmplID, body.PeriodStart, body.PeriodEnd,
		).Scan(&body.ID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create cycle.", "ERR_INTERNAL")
			return
		}
		body.CycleKind, body.TemplateID, body.Status = kind, tmplID, "open"
		response.OK(w, body, "Created.")
	}
}

func assignReviews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		cycleID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || cycleID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id from public.hr_employees where tenant_id=$1 and status='active'`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load employees.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var empID int64
			_ = rows.Scan(&empID)
			_, _ = pool.Exec(r.Context(), `
				insert into public.hr_performance_reviews (tenant_id, cycle_id, employee_id, status)
				select $1,$2,$3,'assigned'
				where not exists (
				  select 1 from public.hr_performance_reviews
				  where tenant_id=$1 and cycle_id=$2 and employee_id=$3
				)`, tu.TenantID, cycleID, empID)
		}
		var count int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.hr_performance_reviews where tenant_id=$1 and cycle_id=$2`, tu.TenantID, cycleID).Scan(&count)
		response.OK(w, map[string]any{"assigned": count}, "Reviews assigned.")
	}
}

func listReviews(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "r.tenant_id=$1"
		args := []any{tu.TenantID}
		n := 2
		if c := strings.TrimSpace(r.URL.Query().Get("cycle_id")); c != "" {
			if id, err := strconv.ParseInt(c, 10, 64); err == nil {
				where += fmt.Sprintf(" and r.cycle_id=$%d", n)
				args = append(args, id)
				n++
			}
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select r.id, r.cycle_id, r.employee_id, e.employee_no, e.full_name, r.status,
			  r.self_comments, r.manager_comments, r.overall_score::float8, r.scores_json, r.acknowledged_at::text, r.document_id
			from public.hr_performance_reviews r
			join public.hr_employees e on e.id=r.employee_id
			where %s
			order by e.full_name
			limit 500`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load reviews.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []PerformanceReview{}
		for rows.Next() {
			var row PerformanceReview
			var score *float64
			_ = rows.Scan(&row.ID, &row.CycleID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.Status,
				&row.SelfComments, &row.ManagerComments, &score, &row.ScoresJSON, &row.AcknowledgedAt, &row.DocumentID)
			row.OverallScore = score
			if row.ScoresJSON == nil {
				row.ScoresJSON = json.RawMessage(`{}`)
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func patchReview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			SelfComments    *string          `json:"self_comments"`
			ManagerComments *string          `json:"manager_comments"`
			OverallScore    *float64         `json:"overall_score"`
			ScoresJSON      *json.RawMessage `json:"scores_json"`
			Status          *string          `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.SelfComments != nil {
			sets = append(sets, fmt.Sprintf("self_comments=$%d", n))
			args = append(args, *body.SelfComments)
			n++
		}
		if body.ManagerComments != nil {
			sets = append(sets, fmt.Sprintf("manager_comments=$%d", n))
			args = append(args, *body.ManagerComments)
			n++
		}
		if body.OverallScore != nil {
			sets = append(sets, fmt.Sprintf("overall_score=$%d", n))
			args = append(args, *body.OverallScore)
			n++
		}
		if body.ScoresJSON != nil {
			sets = append(sets, fmt.Sprintf("scores_json=$%d", n))
			args = append(args, []byte(*body.ScoresJSON))
			n++
		}
		if body.Status != nil {
			sets = append(sets, fmt.Sprintf("status=$%d", n))
			args = append(args, *body.Status)
			n++
		}
		tag, err := pool.Exec(r.Context(), fmt.Sprintf(`update public.hr_performance_reviews set %s where id=$1 and tenant_id=$2`, strings.Join(sets, ",")), args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Review not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func ackReview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.hr_performance_reviews
			set status='acknowledged', acknowledged_at=now(), updated_at=now()
			where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Review not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Acknowledged.")
	}
}

func storeReviewPDF(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var empID int64
		var name, selfC, mgrC string
		var score *float64
		err = pool.QueryRow(r.Context(), `
			select r.employee_id, e.full_name, r.self_comments, r.manager_comments, r.overall_score::float8
			from public.hr_performance_reviews r
			join public.hr_employees e on e.id=r.employee_id
			where r.id=$1 and r.tenant_id=$2`, id, tu.TenantID,
		).Scan(&empID, &name, &selfC, &mgrC, &score)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Review not found.", "ERR_NOT_FOUND")
			return
		}
		sc := "n/a"
		if score != nil {
			sc = fmt.Sprintf("%.2f", *score)
		}
		html := fmt.Sprintf(`<!DOCTYPE html><html><body>
<h1>Performance Review</h1>
<p><strong>Employee:</strong> %s</p>
<p><strong>Overall score:</strong> %s</p>
<p><strong>Self comments:</strong> %s</p>
<p><strong>Manager comments:</strong> %s</p>
<p>Generated %s</p>
</body></html>`, name, sc, selfC, mgrC, time.Now().Format(time.RFC3339))
		var docID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employee_documents (tenant_id, employee_id, doc_type, title, notes, file_bytes)
			values ($1,$2,'review',$3,$4,convert_to($5,'UTF8')) returning id`,
			tu.TenantID, empID, "Performance review #"+strconv.FormatInt(id, 10), "Auto-stored review", html,
		).Scan(&docID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to store 201 doc.", "ERR_INTERNAL")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			update public.hr_performance_reviews set document_id=$3, updated_at=now() where id=$1 and tenant_id=$2`, id, tu.TenantID, docID)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.review.store_201", "hr_performance_review", &id, nil, map[string]any{"document_id": docID})
		response.OK(w, map[string]any{"document_id": docID}, "Stored in 201.")
	}
}
