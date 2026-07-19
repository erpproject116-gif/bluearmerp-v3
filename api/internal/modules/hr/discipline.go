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

type DisciplineCase struct {
	ID                  int64   `json:"id"`
	EmployeeID          int64   `json:"employee_id"`
	EmployeeNo          string  `json:"employee_no,omitempty"`
	EmployeeName        string  `json:"employee_name,omitempty"`
	CaseNo              string  `json:"case_no"`
	CaseType            string  `json:"case_type"`
	Status              string  `json:"status"`
	Subject             string  `json:"subject"`
	Details             string  `json:"details"`
	PolicyRef           string  `json:"policy_ref"`
	AbsenceAlertID      *int64  `json:"absence_alert_id,omitempty"`
	ExplanationDue      *string `json:"explanation_due,omitempty"`
	EmployeeExplanation *string `json:"employee_explanation,omitempty"`
	DecisionNotes       *string `json:"decision_notes,omitempty"`
	DecidedAt           *string `json:"decided_at,omitempty"`
	AcknowledgedAt      *string `json:"acknowledged_at,omitempty"`
	LetterHTML          *string `json:"letter_html,omitempty"`
	DocumentID          *int64  `json:"document_id,omitempty"`
	CreatedAt           string  `json:"created_at,omitempty"`
}

type DisciplineEvent struct {
	ID        int64  `json:"id"`
	CaseID    int64  `json:"case_id"`
	EventType string `json:"event_type"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"created_at"`
}

func registerDisciplineRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.discipline", auth.AccessRead)).Get("/discipline/cases", listDisciplineCases(pool))
	r.With(auth.RequirePermission("hr.discipline", auth.AccessRead)).Get("/discipline/cases/{id}", getDisciplineCase(pool))
	r.With(auth.RequirePermission("hr.discipline", auth.AccessWrite)).Post("/discipline/cases", createDisciplineCase(pool))
	r.With(auth.RequirePermission("hr.discipline", auth.AccessWrite)).Post("/discipline/cases/{id}/advance", advanceDisciplineCase(pool))
	r.With(auth.RequirePermission("hr.discipline", auth.AccessWrite)).Post("/discipline/cases/{id}/render-letter", renderDisciplineLetter(pool))
}

func listDisciplineCases(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "c.tenant_id=$1"
		args := []any{tu.TenantID}
		n := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and c.status=$%d", n)
			args = append(args, st)
			n++
		}
		if emp := strings.TrimSpace(r.URL.Query().Get("employee_id")); emp != "" {
			if id, err := strconv.ParseInt(emp, 10, 64); err == nil {
				where += fmt.Sprintf(" and c.employee_id=$%d", n)
				args = append(args, id)
			}
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select c.id, c.employee_id, e.employee_no, e.full_name, c.case_no, c.case_type, c.status,
			  c.subject, c.details, c.policy_ref, c.absence_alert_id, c.explanation_due::text,
			  c.employee_explanation, c.decision_notes, c.decided_at::text, c.acknowledged_at::text,
			  c.document_id, c.created_at::text
			from public.hr_discipline_cases c
			join public.hr_employees e on e.id=c.employee_id
			where %s
			order by c.created_at desc
			limit 200`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load cases.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []DisciplineCase{}
		for rows.Next() {
			var row DisciplineCase
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.CaseNo, &row.CaseType, &row.Status,
				&row.Subject, &row.Details, &row.PolicyRef, &row.AbsenceAlertID, &row.ExplanationDue,
				&row.EmployeeExplanation, &row.DecisionNotes, &row.DecidedAt, &row.AcknowledgedAt,
				&row.DocumentID, &row.CreatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read case.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func getDisciplineCase(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row DisciplineCase
		err = pool.QueryRow(r.Context(), `
			select c.id, c.employee_id, e.employee_no, e.full_name, c.case_no, c.case_type, c.status,
			  c.subject, c.details, c.policy_ref, c.absence_alert_id, c.explanation_due::text,
			  c.employee_explanation, c.decision_notes, c.decided_at::text, c.acknowledged_at::text,
			  c.letter_html, c.document_id, c.created_at::text
			from public.hr_discipline_cases c
			join public.hr_employees e on e.id=c.employee_id
			where c.id=$1 and c.tenant_id=$2`, id, tu.TenantID,
		).Scan(&row.ID, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName, &row.CaseNo, &row.CaseType, &row.Status,
			&row.Subject, &row.Details, &row.PolicyRef, &row.AbsenceAlertID, &row.ExplanationDue,
			&row.EmployeeExplanation, &row.DecisionNotes, &row.DecidedAt, &row.AcknowledgedAt,
			&row.LetterHTML, &row.DocumentID, &row.CreatedAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Case not found.", "ERR_NOT_FOUND")
			return
		}
		evRows, _ := pool.Query(r.Context(), `
			select id, case_id, event_type, notes, created_at::text
			from public.hr_discipline_events where tenant_id=$1 and case_id=$2 order by created_at`, tu.TenantID, id)
		events := []DisciplineEvent{}
		if evRows != nil {
			defer evRows.Close()
			for evRows.Next() {
				var ev DisciplineEvent
				_ = evRows.Scan(&ev.ID, &ev.CaseID, &ev.EventType, &ev.Notes, &ev.CreatedAt)
				events = append(events, ev)
			}
		}
		response.OK(w, map[string]any{"case": row, "events": events}, "OK")
	}
}

func createDisciplineCase(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			EmployeeID     int64  `json:"employee_id"`
			CaseType       string `json:"case_type"`
			Subject        string `json:"subject"`
			Details        string `json:"details"`
			PolicyRef      string `json:"policy_ref"`
			AbsenceAlertID *int64 `json:"absence_alert_id"`
			ExplanationDue string `json:"explanation_due"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"employee_id": "Required."})
			return
		}
		ct := strings.ToLower(strings.TrimSpace(body.CaseType))
		valid := map[string]bool{"coaching": true, "nte": true, "written_warning": true, "final_warning": true, "suspension": true, "termination": true}
		if !valid[ct] {
			ct = "nte"
		}
		caseNo := fmt.Sprintf("DA-%d-%d", time.Now().Year(), time.Now().Unix()%100000)
		status := "open"
		if ct == "nte" {
			status = "awaiting_explanation"
		}
		var due *string
		if strings.TrimSpace(body.ExplanationDue) != "" {
			due = &body.ExplanationDue
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_discipline_cases
			  (tenant_id, employee_id, case_no, case_type, status, subject, details, policy_ref, absence_alert_id, explanation_due, issued_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::date,$11) returning id`,
			tu.TenantID, body.EmployeeID, caseNo, ct, status, strings.TrimSpace(body.Subject), strings.TrimSpace(body.Details),
			strings.TrimSpace(body.PolicyRef), body.AbsenceAlertID, due, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create case.", "ERR_INTERNAL")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			insert into public.hr_discipline_events (tenant_id, case_id, event_type, notes, actor_user_id)
			values ($1,$2,'opened',$3,$4)`, tu.TenantID, id, "Case opened: "+ct, tu.AppUserID)
		if body.AbsenceAlertID != nil && *body.AbsenceAlertID > 0 {
			_, _ = pool.Exec(r.Context(), `
				update public.hr_absence_alerts set status='escalated', discipline_case_id=$3, updated_at=now()
				where id=$1 and tenant_id=$2`, *body.AbsenceAlertID, tu.TenantID, id)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.discipline.create", "hr_discipline_case", &id, nil, body)
		response.OK(w, map[string]any{"id": id, "case_no": caseNo, "status": status}, "Created.")
	}
}

func advanceDisciplineCase(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Action string `json:"action"` // under_review | decide | close | cancel
			Notes  string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		action := strings.ToLower(strings.TrimSpace(body.Action))
		var newStatus string
		switch action {
		case "under_review":
			newStatus = "under_review"
		case "decide":
			newStatus = "decided"
		case "close":
			newStatus = "closed"
		case "cancel":
			newStatus = "cancelled"
		default:
			response.Validation(w, map[string]string{"action": "Invalid action."})
			return
		}
		sets := "status=$3, updated_at=now()"
		args := []any{id, tu.TenantID, newStatus}
		if action == "decide" {
			sets += ", decision_notes=$4, decided_at=now()"
			args = append(args, strings.TrimSpace(body.Notes))
		}
		tag, err := pool.Exec(r.Context(), fmt.Sprintf(`update public.hr_discipline_cases set %s where id=$1 and tenant_id=$2`, sets), args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Case not found.", "ERR_NOT_FOUND")
			return
		}
		_, _ = pool.Exec(r.Context(), `
			insert into public.hr_discipline_events (tenant_id, case_id, event_type, notes, actor_user_id)
			values ($1,$2,$3,$4,$5)`, tu.TenantID, id, action, strings.TrimSpace(body.Notes), tu.AppUserID)
		response.OK(w, map[string]any{"id": id, "status": newStatus}, "Updated.")
	}
}

func renderDisciplineLetter(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var empID int64
		var caseNo, caseType, subject, details, empName string
		err = pool.QueryRow(r.Context(), `
			select c.employee_id, c.case_no, c.case_type, c.subject, c.details, e.full_name
			from public.hr_discipline_cases c
			join public.hr_employees e on e.id=c.employee_id
			where c.id=$1 and c.tenant_id=$2`, id, tu.TenantID,
		).Scan(&empID, &caseNo, &caseType, &subject, &details, &empName)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Case not found.", "ERR_NOT_FOUND")
			return
		}
		html := fmt.Sprintf(`<!DOCTYPE html><html><body>
<h1>%s — %s</h1>
<p><strong>Employee:</strong> %s</p>
<p><strong>Subject:</strong> %s</p>
<p>%s</p>
<p><em>This letter is a system-generated HR artifact. Legal due-process wording must be reviewed by PH labor counsel before claiming DOLE compliance.</em></p>
</body></html>`, strings.ToUpper(caseType), caseNo, empName, subject, details)

		docType := "da"
		switch caseType {
		case "nte":
			docType = "nte"
		case "written_warning", "final_warning":
			docType = "warning"
		}
		title := fmt.Sprintf("%s %s", strings.ToUpper(caseType), caseNo)
		var docID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employee_documents
			  (tenant_id, employee_id, doc_type, title, notes, file_bytes)
			values ($1,$2,$3,$4,$5,convert_to($6,'UTF8')) returning id`,
			tu.TenantID, empID, docType, title, "Auto-generated discipline letter", html,
		).Scan(&docID)
		if err != nil {
			// fallback without file_bytes if convert fails for some reason
			err = pool.QueryRow(r.Context(), `
				insert into public.hr_employee_documents (tenant_id, employee_id, doc_type, title, notes)
				values ($1,$2,$3,$4,$5) returning id`,
				tu.TenantID, empID, docType, title, html,
			).Scan(&docID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to store letter in 201.", "ERR_INTERNAL")
				return
			}
		}
		_, _ = pool.Exec(r.Context(), `
			update public.hr_discipline_cases set letter_html=$3, document_id=$4, updated_at=now()
			where id=$1 and tenant_id=$2`, id, tu.TenantID, html, docID)
		_, _ = pool.Exec(r.Context(), `
			insert into public.hr_discipline_events (tenant_id, case_id, event_type, notes, actor_user_id)
			values ($1,$2,'letter_rendered',$3,$4)`, tu.TenantID, id, "Letter stored in 201", tu.AppUserID)
		response.OK(w, map[string]any{"document_id": docID, "letter_html": html}, "Letter rendered into 201 file.")
	}
}
