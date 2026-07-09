package finance

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ContractMilestone struct {
	ID               int64   `json:"id"`
	ContractID       int64   `json:"contract_id"`
	ContractNo       string  `json:"contract_no"`
	ContractTitle    string  `json:"contract_title"`
	PartnerID        int64   `json:"partner_id"`
	PartnerName      string  `json:"partner_name"`
	MilestoneNo      int     `json:"milestone_no"`
	Description      string  `json:"description"`
	DueDate          *string `json:"due_date,omitempty"`
	Amount           float64 `json:"amount"`
	BilledSaleID     *int64  `json:"billed_sale_id,omitempty"`
	SalesNo          string  `json:"sales_no,omitempty"`
	Status           string  `json:"status"`
	BillingStatus    string  `json:"billing_status"`
	InvProjectID     *int64  `json:"inv_project_id,omitempty"`
	JobCostProjectID *int64  `json:"job_cost_project_id,omitempty"`
}

type milestoneBody struct {
	MilestoneNo int     `json:"milestone_no"`
	Description string  `json:"description"`
	DueDate     *string `json:"due_date"`
	Amount      float64 `json:"amount"`
}

func registerContractMilestoneRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.contract_read", auth.AccessRead)).Get("/contracts/milestones/board", listMilestoneBoard(pool))
	r.With(auth.RequirePermission("finance.contract_read", auth.AccessRead)).Get("/contracts/{id}/milestones", listContractMilestones(pool))
	r.With(auth.RequirePermission("finance.contract_write", auth.AccessWrite)).Post("/contracts/{id}/milestones", createContractMilestone(pool))
}

func listMilestoneBoard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		contractID := int64(0)
		if v := strings.TrimSpace(r.URL.Query().Get("contract_id")); v != "" {
			if id, err := strconv.ParseInt(v, 10, 64); err == nil {
				contractID = id
			}
		}
		out, err := queryContractMilestones(r.Context(), pool, tu.TenantID, contractID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list milestones.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

func listContractMilestones(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		contractID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid contract id."})
			return
		}
		out, err := queryContractMilestones(r.Context(), pool, tu.TenantID, contractID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list milestones.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}

func queryContractMilestones(ctx context.Context, pool *pgxpool.Pool, tenantID, contractID int64) ([]ContractMilestone, error) {
	q := `
		select m.id, m.contract_id, c.contract_no, c.title, c.partner_id, p.company_name,
		  m.milestone_no, m.description, m.due_date::text, m.amount::float8,
		  m.billed_sale_id, coalesce(s.sales_no, ''), m.status,
		  case
		    when m.billed_sale_id is null then 'pending'
		    when coalesce(recv.received, 0) >= coalesce(s.grand_total, 0) - 0.0001 then 'collected'
		    else 'billed'
		  end,
		  c.inv_project_id, c.job_cost_project_id
		from public.fin_contract_milestones m
		join public.fin_contracts c on c.id = m.contract_id
		join public.inv_partners p on p.id = c.partner_id
		left join public.sa_sales s on s.id = m.billed_sale_id and s.deleted_at is null
		left join lateral (
		  select coalesce(sum(a.applied_amount), 0)::float8 as received
		  from public.fin_receipt_applications a
		  join public.fin_official_receipts r on r.id = a.official_receipt_id
		  where a.sales_id = s.id and r.deleted_at is null
		) recv on true
		where c.tenant_id = $1`
	args := []any{tenantID}
	if contractID > 0 {
		q += ` and c.id = $2`
		args = append(args, contractID)
	}
	q += ` order by coalesce(m.due_date, '9999-12-31'::date), c.contract_no, m.milestone_no`

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ContractMilestone
	for rows.Next() {
		var row ContractMilestone
		var dueDate *string
		if err := rows.Scan(
			&row.ID, &row.ContractID, &row.ContractNo, &row.ContractTitle, &row.PartnerID, &row.PartnerName,
			&row.MilestoneNo, &row.Description, &dueDate, &row.Amount,
			&row.BilledSaleID, &row.SalesNo, &row.Status, &row.BillingStatus,
			&row.InvProjectID, &row.JobCostProjectID,
		); err != nil {
			return nil, err
		}
		row.DueDate = dueDate
		out = append(out, row)
	}
	if out == nil {
		out = []ContractMilestone{}
	}
	return out, rows.Err()
}

func createContractMilestone(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		contractID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid contract id."})
			return
		}
		var body milestoneBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		desc := strings.TrimSpace(body.Description)
		if desc == "" {
			response.Validation(w, map[string]string{"description": "Description is required."})
			return
		}
		if body.Amount <= 0 {
			response.Validation(w, map[string]string{"amount": "Amount must be greater than zero."})
			return
		}

		var exists bool
		_ = pool.QueryRow(r.Context(), `
			select exists(select 1 from public.fin_contracts where id = $1 and tenant_id = $2)`, contractID, tu.TenantID).Scan(&exists)
		if !exists {
			response.Err(w, http.StatusNotFound, "Contract not found.", "ERR_NOT_FOUND")
			return
		}

		milestoneNo := body.MilestoneNo
		if milestoneNo <= 0 {
			_ = pool.QueryRow(r.Context(), `
				select coalesce(max(milestone_no), 0) + 1
				from public.fin_contract_milestones where contract_id = $1`, contractID).Scan(&milestoneNo)
		}

		var dueDate any
		if body.DueDate != nil && strings.TrimSpace(*body.DueDate) != "" {
			dueDate = strings.TrimSpace(*body.DueDate)
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_contract_milestones (contract_id, milestone_no, description, due_date, amount, status)
			values ($1, $2, $3, $4::date, $5, 'pending')
			returning id`,
			contractID, milestoneNo, desc, dueDate, body.Amount).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create milestone.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.contract_milestone.create", "fin_contract_milestone", &id, nil, body)
		row := ContractMilestone{
			ID: id, ContractID: contractID, MilestoneNo: milestoneNo, Description: desc,
			Amount: body.Amount, Status: "pending", BillingStatus: "pending",
		}
		if body.DueDate != nil {
			row.DueDate = body.DueDate
		}
		response.OK(w, row, "Created.")
	}
}
