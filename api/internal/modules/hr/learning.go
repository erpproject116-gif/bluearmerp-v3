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

type Course struct {
	ID                   int64    `json:"id"`
	Code                 string   `json:"code"`
	Title                string   `json:"title"`
	Summary              string   `json:"summary"`
	BodyMarkdown         string   `json:"body_markdown"`
	IsMandatory          bool     `json:"is_mandatory"`
	PassMark             float64  `json:"pass_mark"`
	AttemptLimit         int      `json:"attempt_limit"`
	TimeLimitMinutes     *int     `json:"time_limit_minutes,omitempty"`
	CertificateValidDays *int     `json:"certificate_valid_days,omitempty"`
	IsActive             bool     `json:"is_active"`
}

type QuizQuestion struct {
	ID           int64           `json:"id"`
	CourseID     int64           `json:"course_id"`
	Prompt       string          `json:"prompt"`
	ChoicesJSON  json.RawMessage `json:"choices_json"`
	CorrectIndex int             `json:"correct_index,omitempty"`
	SortOrder    int             `json:"sort_order"`
}

type LearningAssignment struct {
	ID           int64   `json:"id"`
	CourseID     int64   `json:"course_id"`
	CourseCode   string  `json:"course_code,omitempty"`
	CourseTitle  string  `json:"course_title,omitempty"`
	EmployeeID   int64   `json:"employee_id"`
	EmployeeNo   string  `json:"employee_no,omitempty"`
	EmployeeName string  `json:"employee_name,omitempty"`
	DueDate      *string `json:"due_date,omitempty"`
	Status       string  `json:"status"`
	AssignedAt   string  `json:"assigned_at,omitempty"`
	CompletedAt  *string `json:"completed_at,omitempty"`
}

func registerLearningRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.learning", auth.AccessRead)).Get("/learning/courses", listCourses(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessWrite)).Post("/learning/courses", createCourse(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessRead)).Get("/learning/courses/{id}/questions", listQuestions(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessWrite)).Post("/learning/courses/{id}/questions", addQuestion(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessWrite)).Post("/learning/assignments", assignCourse(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessRead)).Get("/learning/assignments", listAssignments(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessRead)).Get("/learning/compliance", learningCompliance(pool))
	r.With(auth.RequirePermission("hr.learning", auth.AccessWrite)).Post("/learning/assignments/{id}/attempt", submitQuizAttempt(pool))
}

func listCourses(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, title, summary, body_markdown, is_mandatory, pass_mark::float8, attempt_limit,
			  time_limit_minutes, certificate_valid_days, is_active
			from public.hr_courses where tenant_id=$1 order by code`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load courses.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []Course{}
		for rows.Next() {
			var row Course
			_ = rows.Scan(&row.ID, &row.Code, &row.Title, &row.Summary, &row.BodyMarkdown, &row.IsMandatory, &row.PassMark, &row.AttemptLimit,
				&row.TimeLimitMinutes, &row.CertificateValidDays, &row.IsActive)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createCourse(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body Course
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.ToUpper(strings.TrimSpace(body.Code))
		if code == "" || strings.TrimSpace(body.Title) == "" {
			response.Validation(w, map[string]string{"code": "Code and title required."})
			return
		}
		if body.PassMark <= 0 {
			body.PassMark = 70
		}
		if body.AttemptLimit <= 0 {
			body.AttemptLimit = 3
		}
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_courses
			  (tenant_id, code, title, summary, body_markdown, is_mandatory, pass_mark, attempt_limit, time_limit_minutes, certificate_valid_days)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id`,
			tu.TenantID, code, strings.TrimSpace(body.Title), body.Summary, body.BodyMarkdown, body.IsMandatory,
			body.PassMark, body.AttemptLimit, body.TimeLimitMinutes, body.CertificateValidDays,
		).Scan(&body.ID)
		if err != nil {
			response.Err(w, http.StatusConflict, "Could not create course.", "ERR_CONFLICT")
			return
		}
		body.Code, body.IsActive = code, true
		response.OK(w, body, "Created.")
	}
}

func listQuestions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		courseID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		includeAnswers := r.URL.Query().Get("reveal") == "1"
		rows, err := pool.Query(r.Context(), `
			select id, course_id, prompt, choices_json, correct_index, sort_order
			from public.hr_quiz_questions where tenant_id=$1 and course_id=$2 order by sort_order`, tu.TenantID, courseID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load questions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []QuizQuestion{}
		for rows.Next() {
			var q QuizQuestion
			_ = rows.Scan(&q.ID, &q.CourseID, &q.Prompt, &q.ChoicesJSON, &q.CorrectIndex, &q.SortOrder)
			if !includeAnswers {
				q.CorrectIndex = -1
			}
			out = append(out, q)
		}
		response.OK(w, out, "OK")
	}
}

func addQuestion(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		courseID, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body QuizQuestion
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Prompt) == "" {
			response.Validation(w, map[string]string{"prompt": "Required."})
			return
		}
		choices := body.ChoicesJSON
		if choices == nil {
			choices = json.RawMessage(`[]`)
		}
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_quiz_questions (tenant_id, course_id, prompt, choices_json, correct_index, sort_order)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, courseID, body.Prompt, []byte(choices), body.CorrectIndex, body.SortOrder,
		).Scan(&body.ID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to add question.", "ERR_INTERNAL")
			return
		}
		response.OK(w, body, "Created.")
	}
}

func assignCourse(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			CourseID   int64  `json:"course_id"`
			EmployeeID int64  `json:"employee_id"`
			DueDate    string `json:"due_date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.CourseID <= 0 || body.EmployeeID <= 0 {
			response.Validation(w, map[string]string{"course_id": "course_id and employee_id required."})
			return
		}
		var due any
		if strings.TrimSpace(body.DueDate) != "" {
			due = body.DueDate
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_learning_assignments (tenant_id, course_id, employee_id, due_date)
			values ($1,$2,$3,$4)
			on conflict (tenant_id, course_id, employee_id) do update set due_date=excluded.due_date, status='assigned'
			returning id`, tu.TenantID, body.CourseID, body.EmployeeID, due,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to assign.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Assigned.")
	}
}

func listAssignments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "a.tenant_id=$1"
		args := []any{tu.TenantID}
		if emp := strings.TrimSpace(r.URL.Query().Get("employee_id")); emp != "" {
			if id, err := strconv.ParseInt(emp, 10, 64); err == nil {
				where += " and a.employee_id=$2"
				args = append(args, id)
			}
		}
		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select a.id, a.course_id, c.code, c.title, a.employee_id, e.employee_no, e.full_name,
			  a.due_date::text, a.status, a.assigned_at::text, a.completed_at::text
			from public.hr_learning_assignments a
			join public.hr_courses c on c.id=a.course_id
			join public.hr_employees e on e.id=a.employee_id
			where %s
			order by a.assigned_at desc
			limit 500`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load assignments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LearningAssignment{}
		for rows.Next() {
			var row LearningAssignment
			_ = rows.Scan(&row.ID, &row.CourseID, &row.CourseCode, &row.CourseTitle, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName,
				&row.DueDate, &row.Status, &row.AssignedAt, &row.CompletedAt)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func learningCompliance(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select a.id, a.course_id, c.code, c.title, a.employee_id, e.employee_no, e.full_name,
			  a.due_date::text, a.status, a.assigned_at::text, a.completed_at::text
			from public.hr_learning_assignments a
			join public.hr_courses c on c.id=a.course_id
			join public.hr_employees e on e.id=a.employee_id
			where a.tenant_id=$1 and c.is_mandatory
			  and a.status not in ('passed')
			  and (a.due_date is null or a.due_date < current_date or a.status in ('assigned','in_progress','failed','expired'))
			order by a.due_date nulls last, e.full_name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load compliance.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []LearningAssignment{}
		for rows.Next() {
			var row LearningAssignment
			_ = rows.Scan(&row.ID, &row.CourseID, &row.CourseCode, &row.CourseTitle, &row.EmployeeID, &row.EmployeeNo, &row.EmployeeName,
				&row.DueDate, &row.Status, &row.AssignedAt, &row.CompletedAt)
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func submitQuizAttempt(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		assignID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || assignID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Answers []int `json:"answers"` // index per question in sort order
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var empID, courseID int64
		var passMark float64
		var attemptLimit int
		var status string
		err = pool.QueryRow(r.Context(), `
			select a.employee_id, a.course_id, a.status, c.pass_mark::float8, c.attempt_limit
			from public.hr_learning_assignments a
			join public.hr_courses c on c.id=a.course_id
			where a.id=$1 and a.tenant_id=$2`, assignID, tu.TenantID,
		).Scan(&empID, &courseID, &status, &passMark, &attemptLimit)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Assignment not found.", "ERR_NOT_FOUND")
			return
		}
		var prior int
		_ = pool.QueryRow(r.Context(), `
			select count(*)::int from public.hr_quiz_attempts where assignment_id=$1 and tenant_id=$2`, assignID, tu.TenantID).Scan(&prior)
		if prior >= attemptLimit {
			response.Err(w, http.StatusConflict, "Attempt limit reached.", "ERR_CONFLICT")
			return
		}
		qrows, err := pool.Query(r.Context(), `
			select id, correct_index from public.hr_quiz_questions
			where tenant_id=$1 and course_id=$2 order by sort_order`, tu.TenantID, courseID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load questions.", "ERR_INTERNAL")
			return
		}
		defer qrows.Close()
		correct := 0
		total := 0
		for qrows.Next() {
			var qid int64
			var idx int
			_ = qrows.Scan(&qid, &idx)
			ans := -1
			if total < len(body.Answers) {
				ans = body.Answers[total]
			}
			if ans == idx {
				correct++
			}
			total++
		}
		score := 0.0
		if total > 0 {
			score = roundMoney(100.0 * float64(correct) / float64(total))
		}
		passed := score >= passMark
		ansBytes, _ := json.Marshal(body.Answers)
		var attemptID int64
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_quiz_attempts
			  (tenant_id, assignment_id, employee_id, course_id, score, passed, answers_json, finished_at)
			values ($1,$2,$3,$4,$5,$6,$7,now()) returning id`,
			tu.TenantID, assignID, empID, courseID, score, passed, ansBytes,
		).Scan(&attemptID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save attempt.", "ERR_INTERNAL")
			return
		}
		newStatus := "failed"
		if passed {
			newStatus = "passed"
			cert := fmt.Sprintf("CERT-%d-%d", courseID, time.Now().Unix()%1000000)
			var expires any
			_, _ = pool.Exec(r.Context(), `
				insert into public.hr_learning_completions
				  (tenant_id, employee_id, course_id, certificate_code, expires_at)
				values ($1,$2,$3,$4,$5)`,
				tu.TenantID, empID, courseID, cert, expires)
			_, _ = pool.Exec(r.Context(), `
				update public.hr_learning_assignments set status='passed', completed_at=now() where id=$1 and tenant_id=$2`,
				assignID, tu.TenantID)
			// complete matching onboarding task if any
			_, _ = pool.Exec(r.Context(), `
				update public.hr_onboarding_tasks t
				set status='done', completed_at=now()
				from public.hr_onboarding_cases c
				where t.case_id=c.id and c.employee_id=$1 and t.tenant_id=$2
				  and t.task_kind='complete_course' and t.course_id=$3 and t.status='pending'`,
				empID, tu.TenantID, courseID)
		} else {
			_, _ = pool.Exec(r.Context(), `
				update public.hr_learning_assignments set status='failed' where id=$1 and tenant_id=$2`, assignID, tu.TenantID)
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.learning.attempt", "hr_quiz_attempt", &attemptID, nil, map[string]any{"score": score, "passed": passed})
		response.OK(w, map[string]any{
			"attempt_id": attemptID, "score": score, "passed": passed, "status": newStatus, "correct": correct, "total": total,
		}, "Attempt recorded.")
	}
}
