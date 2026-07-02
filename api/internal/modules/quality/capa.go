package quality

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type CapaRecord struct {
	ID             int64   `json:"id"`
	NcrID          *int64  `json:"ncr_id,omitempty"`
	Title          string  `json:"title"`
	Description    *string `json:"description,omitempty"`
	Status         string  `json:"status"`
	AssignedUserID *int64  `json:"assigned_user_id,omitempty"`
	DueDate        *string `json:"due_date,omitempty"`
}

type capaBody struct {
	NcrID          *int64  `json:"ncr_id"`
	Title          string  `json:"title"`
	Description    *string `json:"description"`
	Status         string  `json:"status"`
	AssignedUserID *int64  `json:"assigned_user_id"`
	DueDate        *string `json:"due_date"`
}

func listCapaRecords(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, ncr_id, title, description, status, assigned_user_id, due_date::text
			from public.qms_capa_records
			where tenant_id = $1
			order by id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list CAPA records.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []CapaRecord
		for rows.Next() {
			var row CapaRecord
			if err := rows.Scan(&row.ID, &row.NcrID, &row.Title, &row.Description, &row.Status, &row.AssignedUserID, &row.DueDate); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read CAPA records.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []CapaRecord{}
		}
		response.OK(w, out, "OK")
	}
}

func createCapaRecord(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body capaBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "open"
		}
		var dueDate any
		if body.DueDate != nil && strings.TrimSpace(*body.DueDate) != "" {
			dueDate = strings.TrimSpace(*body.DueDate)
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.qms_capa_records (tenant_id, ncr_id, title, description, status, assigned_user_id, due_date, created_by_user_id)
			values ($1, $2, $3, $4, $5, $6, $7::date, $8)
			returning id`,
			tu.TenantID, body.NcrID, title, body.Description, status, body.AssignedUserID, dueDate, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create CAPA record.", "ERR_INTERNAL")
			return
		}
		row := CapaRecord{ID: id, NcrID: body.NcrID, Title: title, Description: body.Description, Status: status, AssignedUserID: body.AssignedUserID, DueDate: body.DueDate}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "quality.capa.create", "qms_capa_record", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}
