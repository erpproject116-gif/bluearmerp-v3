package finance

import (
	"context"
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

type Contract struct {
	ID               int64   `json:"id"`
	ContractNo       string  `json:"contract_no"`
	PartnerID        int64   `json:"partner_id"`
	Title            string  `json:"title"`
	StartDate        string  `json:"start_date"`
	EndDate          *string `json:"end_date,omitempty"`
	TotalAmount      float64 `json:"total_amount"`
	Status           string  `json:"status"`
	InvProjectID     *int64  `json:"inv_project_id,omitempty"`
	JobCostProjectID *int64  `json:"job_cost_project_id,omitempty"`
}

type contractBody struct {
	ContractNo       string  `json:"contract_no"`
	PartnerID        int64   `json:"partner_id"`
	Title            string  `json:"title"`
	StartDate        string  `json:"start_date"`
	EndDate          *string `json:"end_date"`
	TotalAmount      float64 `json:"total_amount"`
	Status           string  `json:"status"`
	InvProjectID     *int64  `json:"inv_project_id"`
	JobCostProjectID *int64  `json:"job_cost_project_id"`
}

func registerContractRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.contract_read", auth.AccessRead)).Get("/contracts", listContracts(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Post("/contracts", createContract(pool))
	registerContractMilestoneRoutes(r, pool)
}

func listContracts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, contract_no, partner_id, title, start_date::text, end_date::text,
			  total_amount::float8, status, inv_project_id, job_cost_project_id
			from public.fin_contracts
			where tenant_id = $1
			order by start_date desc, contract_no`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list contracts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Contract
		for rows.Next() {
			var row Contract
			if err := rows.Scan(&row.ID, &row.ContractNo, &row.PartnerID, &row.Title, &row.StartDate, &row.EndDate, &row.TotalAmount, &row.Status, &row.InvProjectID, &row.JobCostProjectID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read contracts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Contract{}
		}
		response.OK(w, out, "OK")
	}
}

func createContract(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body contractBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		contractNo := strings.TrimSpace(body.ContractNo)
		title := strings.TrimSpace(body.Title)
		if contractNo == "" || title == "" || body.PartnerID <= 0 {
			response.Validation(w, map[string]string{"contract_no": "Contract number, title, and partner are required."})
			return
		}
		startDate := strings.TrimSpace(body.StartDate)
		if startDate == "" {
			startDate = time.Now().Format("2006-01-02")
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "active"
		}
		var endDate any
		if body.EndDate != nil && strings.TrimSpace(*body.EndDate) != "" {
			endDate = strings.TrimSpace(*body.EndDate)
		}
		if err := validateContractProjects(r.Context(), pool, tu.TenantID, body.InvProjectID, body.JobCostProjectID); err != nil {
			response.Validation(w, err)
			return
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_contracts (
			  tenant_id, contract_no, partner_id, title, start_date, end_date, total_amount, status,
			  inv_project_id, job_cost_project_id, created_by_user_id
			)
			values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9, $10, $11)
			returning id`,
			tu.TenantID, contractNo, body.PartnerID, title, startDate, endDate, body.TotalAmount, status,
			body.InvProjectID, body.JobCostProjectID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create contract.", "ERR_INTERNAL")
			return
		}
		row := Contract{
			ID: id, ContractNo: contractNo, PartnerID: body.PartnerID, Title: title,
			StartDate: startDate, EndDate: body.EndDate, TotalAmount: body.TotalAmount, Status: status,
			InvProjectID: body.InvProjectID, JobCostProjectID: body.JobCostProjectID,
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.contract.create", "fin_contract", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func validateContractProjects(ctx context.Context, pool *pgxpool.Pool, tenantID int64, invProjectID, jobCostProjectID *int64) map[string]string {
	errs := map[string]string{}
	if invProjectID != nil && *invProjectID > 0 {
		var ok bool
		_ = pool.QueryRow(ctx, `
			select exists(select 1 from public.inv_projects where id = $1 and tenant_id = $2 and deleted_at is null)`,
			*invProjectID, tenantID).Scan(&ok)
		if !ok {
			errs["inv_project_id"] = "Inventory project not found."
		}
	}
	if jobCostProjectID != nil && *jobCostProjectID > 0 {
		var ok bool
		_ = pool.QueryRow(ctx, `
			select exists(select 1 from public.job_cost_projects where id = $1 and tenant_id = $2)`,
			*jobCostProjectID, tenantID).Scan(&ok)
		if !ok {
			errs["job_cost_project_id"] = "Job cost project not found."
		}
	}
	if len(errs) == 0 {
		return nil
	}
	return errs
}
