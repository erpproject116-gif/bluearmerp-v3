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

type Contract struct {
	ID          int64   `json:"id"`
	ContractNo  string  `json:"contract_no"`
	PartnerID   int64   `json:"partner_id"`
	Title       string  `json:"title"`
	StartDate   string  `json:"start_date"`
	EndDate     *string `json:"end_date,omitempty"`
	TotalAmount float64 `json:"total_amount"`
	Status      string  `json:"status"`
}

type contractBody struct {
	ContractNo  string  `json:"contract_no"`
	PartnerID   int64   `json:"partner_id"`
	Title       string  `json:"title"`
	StartDate   string  `json:"start_date"`
	EndDate     *string `json:"end_date"`
	TotalAmount float64 `json:"total_amount"`
	Status      string  `json:"status"`
}

func registerContractRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.contract_read", auth.AccessRead)).Get("/contracts", listContracts(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Post("/contracts", createContract(pool))
}

func listContracts(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, contract_no, partner_id, title, start_date::text, end_date::text, total_amount::float8, status
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
			if err := rows.Scan(&row.ID, &row.ContractNo, &row.PartnerID, &row.Title, &row.StartDate, &row.EndDate, &row.TotalAmount, &row.Status); err != nil {
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
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_contracts (tenant_id, contract_no, partner_id, title, start_date, end_date, total_amount, status, created_by_user_id)
			values ($1, $2, $3, $4, $5::date, $6::date, $7, $8, $9)
			returning id`,
			tu.TenantID, contractNo, body.PartnerID, title, startDate, endDate, body.TotalAmount, status, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create contract.", "ERR_INTERNAL")
			return
		}
		row := Contract{ID: id, ContractNo: contractNo, PartnerID: body.PartnerID, Title: title, StartDate: startDate, EndDate: body.EndDate, TotalAmount: body.TotalAmount, Status: status}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.contract.create", "fin_contract", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}
