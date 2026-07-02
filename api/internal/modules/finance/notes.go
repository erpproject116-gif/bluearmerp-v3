package finance

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Note struct {
	ID         int64   `json:"id"`
	NoteType   string  `json:"note_type"`
	NoteNo     string  `json:"note_no"`
	PartnerID  int64   `json:"partner_id"`
	IssueDate  string  `json:"issue_date"`
	DueDate    string  `json:"due_date"`
	Amount     float64 `json:"amount"`
	Status     string  `json:"status"`
}

type noteBody struct {
	NoteType  string  `json:"note_type"`
	NoteNo    string  `json:"note_no"`
	PartnerID int64   `json:"partner_id"`
	IssueDate string  `json:"issue_date"`
	DueDate   string  `json:"due_date"`
	Amount    float64 `json:"amount"`
	Status    string  `json:"status"`
}

func registerNoteRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.note_read", auth.AccessRead)).Get("/notes", listNotes(pool))
	r.With(auth.RequirePermission("finance.note_write", auth.AccessWrite)).Post("/notes", createNote(pool))
}

func listNotes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, note_type, note_no, partner_id, issue_date::text, due_date::text, amount::float8, status
			from public.fin_notes
			where tenant_id = $1
			order by due_date desc, note_no`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list notes.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Note
		for rows.Next() {
			var row Note
			if err := rows.Scan(&row.ID, &row.NoteType, &row.NoteNo, &row.PartnerID, &row.IssueDate, &row.DueDate, &row.Amount, &row.Status); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read notes.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Note{}
		}
		response.OK(w, out, "OK")
	}
}

func createNote(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body noteBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		noteType := strings.TrimSpace(body.NoteType)
		noteNo := strings.TrimSpace(body.NoteNo)
		if noteType == "" || noteNo == "" || body.PartnerID <= 0 {
			response.Validation(w, map[string]string{"note_no": "Note type, number, and partner are required."})
			return
		}
		issueDate := strings.TrimSpace(body.IssueDate)
		if issueDate == "" {
			issueDate = time.Now().Format("2006-01-02")
		}
		dueDate := strings.TrimSpace(body.DueDate)
		if dueDate == "" {
			dueDate = issueDate
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "open"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_notes (tenant_id, note_type, note_no, partner_id, issue_date, due_date, amount, status)
			values ($1, $2, $3, $4, $5::date, $6::date, $7, $8)
			returning id`,
			tu.TenantID, noteType, noteNo, body.PartnerID, issueDate, dueDate, body.Amount, status,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create note.", "ERR_INTERNAL")
			return
		}
		row := Note{ID: id, NoteType: noteType, NoteNo: noteNo, PartnerID: body.PartnerID, IssueDate: issueDate, DueDate: dueDate, Amount: body.Amount, Status: status}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.note.create", "fin_note", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}
