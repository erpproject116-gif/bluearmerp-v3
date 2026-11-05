package hr

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerClientRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/clients", listHRClients(pool))
	r.Get("/sales-customers", listSalesCustomers(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/clients", createHRClient(pool))
	r.With(auth.RequirePermission("hr.employees", auth.AccessWrite)).Post("/clients/{id}/sites", createClientSite(pool))
}

type clientPerson struct {
	EmployeeID   int64  `json:"employee_id"`
	EmployeeName string `json:"employee_name"`
	StartDate    string `json:"start_date"`
}

type clientSite struct {
	ID           int64          `json:"id"`
	SiteName     string         `json:"site_name"`
	IndustryID   int64          `json:"industry_id"`
	IndustryName string         `json:"industry_name"`
	People       []clientPerson `json:"people"`
}

type hrClient struct {
	ID          int64        `json:"id"`
	Name        string       `json:"name"`
	PartnerID   int64        `json:"partner_id"`
	PartnerCode string       `json:"partner_code"`
	PartnerName string       `json:"partner_name"`
	Sites       []clientSite `json:"sites"`
}

func listHRClients(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select c.id, c.name, c.partner_id, p.partner_code, p.company_name,
			  coalesce((
			    select json_agg(json_build_object(
			      'id', s.id,
			      'site_name', s.site_name,
			      'industry_id', s.industry_id,
			      'industry_name', ind.name,
			      'people', coalesce((
			        select json_agg(json_build_object(
			          'employee_id', e.id,
			          'employee_name', e.full_name,
			          'start_date', a.start_date::text
			        ) order by e.full_name)
			        from public.hr_assignments a
			        join public.hr_employees e on e.id = a.employee_id and e.tenant_id = a.tenant_id
			        where a.site_id = s.id and a.tenant_id = s.tenant_id and a.end_date is null
			      ), '[]'::json)
			    ) order by s.site_name)
			    from public.hr_client_sites s
			    join public.hr_applicant_segments ind
			      on ind.id = s.industry_id and ind.tenant_id = s.tenant_id and ind.kind = 'industry'
			    where s.client_id = c.id and s.tenant_id = c.tenant_id
			  ), '[]'::json)
			from public.hr_clients c
			join public.inv_partners p on p.id = c.partner_id and p.tenant_id = c.tenant_id
			where c.tenant_id = $1
			order by c.name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load clients.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []hrClient{}
		for rows.Next() {
			var row hrClient
			var sites []byte
			if err := rows.Scan(&row.ID, &row.Name, &row.PartnerID, &row.PartnerCode, &row.PartnerName, &sites); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load clients.", "ERR_INTERNAL")
				return
			}
			row.PartnerCode = strings.TrimSpace(row.PartnerCode)
			row.Sites = []clientSite{}
			if err := json.Unmarshal(sites, &row.Sites); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load clients.", "ERR_INTERNAL")
				return
			}
			for i := range row.Sites {
				if row.Sites[i].People == nil {
					row.Sites[i].People = []clientPerson{}
				}
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func listSalesCustomers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, partner_code, company_name
			from public.inv_partners
			where tenant_id = $1 and deleted_at is null and status = 'active'
			  and partner_kind in ('customer', 'both')
			order by company_name
			limit 300`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales customers.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id int64
			var code, name string
			if err := rows.Scan(&id, &code, &name); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load sales customers.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"id": id, "partner_code": strings.TrimSpace(code), "company_name": name})
		}
		response.OK(w, out, "OK")
	}
}

type clientBody struct {
	PartnerID  int64  `json:"partner_id"`
	Name       string `json:"name"`
	SiteName   string `json:"site_name"`
	IndustryID int64  `json:"industry_id"`
	EmployeeID int64  `json:"employee_id"`
	StartDate  string `json:"start_date"`
}

func createHRClient(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body clientBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		body.Name = strings.TrimSpace(body.Name)
		body.SiteName = strings.TrimSpace(body.SiteName)
		if body.SiteName == "" || body.IndustryID == 0 {
			response.Validation(w, map[string]string{"site_name": "Enter a site name and an industry."})
			return
		}
		if body.PartnerID == 0 && body.Name == "" {
			response.Validation(w, map[string]string{"name": "Choose a sales customer or enter a new client name."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the client.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		partnerID := body.PartnerID
		name := body.Name
		if partnerID > 0 {
			err = tx.QueryRow(r.Context(), `
				select id, company_name from public.inv_partners
				where id = $1 and tenant_id = $2 and deleted_at is null and status = 'active'
				  and partner_kind in ('customer', 'both')`, partnerID, tu.TenantID).Scan(&partnerID, &name)
			if errors.Is(err, pgx.ErrNoRows) {
				response.Validation(w, map[string]string{"partner_id": "Choose an active sales customer."})
				return
			}
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save the client.", "ERR_INTERNAL")
				return
			}
		} else {
			var code string
			if err = tx.QueryRow(r.Context(), `select public.allocate_tenant_code($1, 'partner')`, tu.TenantID).Scan(&code); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save the client.", "ERR_INTERNAL")
				return
			}
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_partners (tenant_id, partner_code, partner_kind, company_name, status)
				values ($1, $2, 'customer', $3, 'active') returning id`, tu.TenantID, code, name).Scan(&partnerID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save the sales customer.", "ERR_INTERNAL")
				return
			}
		}
		if err = requireIndustry(r, tx, tu.TenantID, body.IndustryID); err != nil {
			writeClientErr(w, err)
			return
		}
		var clientID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.hr_clients (tenant_id, name, partner_id)
			values ($1, $2, $3) returning id`, tu.TenantID, name, partnerID).Scan(&clientID)
		if err != nil {
			writeClientErr(w, err)
			return
		}
		if err = insertClientSite(r, tx, tu.TenantID, clientID, body); err != nil {
			writeClientErr(w, err)
			return
		}
		if err = tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the client.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": clientID}, "Created.")
	}
}

func createClientSite(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		clientID, err := parseID(chi.URLParam(r, "id"))
		if err != nil {
			response.Err(w, http.StatusBadRequest, "Client not found.", "ERR_BAD_REQUEST")
			return
		}
		var body clientBody
		if err = json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Err(w, http.StatusBadRequest, "Invalid JSON.", "ERR_BAD_REQUEST")
			return
		}
		body.SiteName = strings.TrimSpace(body.SiteName)
		if body.SiteName == "" || body.IndustryID == 0 {
			response.Validation(w, map[string]string{"site_name": "Enter a site name and an industry."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the site.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var exists int64
		err = tx.QueryRow(r.Context(), `select id from public.hr_clients where id = $1 and tenant_id = $2`, clientID, tu.TenantID).Scan(&exists)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, "Client not found.", "ERR_NOT_FOUND")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the site.", "ERR_INTERNAL")
			return
		}
		if err = requireIndustry(r, tx, tu.TenantID, body.IndustryID); err != nil {
			writeClientErr(w, err)
			return
		}
		if err = insertClientSite(r, tx, tu.TenantID, clientID, body); err != nil {
			writeClientErr(w, err)
			return
		}
		if err = tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the site.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"client_id": clientID}, "Created.")
	}
}

func requireIndustry(r *http.Request, tx pgx.Tx, tenantID, industryID int64) error {
	var id int64
	err := tx.QueryRow(r.Context(), `
		select id from public.hr_applicant_segments
		where id = $1 and tenant_id = $2 and kind = 'industry'`, industryID, tenantID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return errClientIndustry
	}
	return err
}

var errClientIndustry = errors.New("industry")
var errClientEmployee = errors.New("employee")

func insertClientSite(r *http.Request, tx pgx.Tx, tenantID, clientID int64, body clientBody) error {
	var siteID int64
	if err := tx.QueryRow(r.Context(), `
		insert into public.hr_client_sites (tenant_id, client_id, site_name, industry_id)
		values ($1, $2, $3, $4) returning id`, tenantID, clientID, body.SiteName, body.IndustryID).Scan(&siteID); err != nil {
		return err
	}
	if body.EmployeeID == 0 {
		return nil
	}
	var employeeID int64
	err := tx.QueryRow(r.Context(), `
		select id from public.hr_employees where id = $1 and tenant_id = $2`, body.EmployeeID, tenantID).Scan(&employeeID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errClientEmployee
	}
	if err != nil {
		return err
	}
	start := strings.TrimSpace(body.StartDate)
	if start == "" {
		start = time.Now().Format("2006-01-02")
	}
	_, err = tx.Exec(r.Context(), `
		insert into public.hr_assignments (tenant_id, employee_id, site_id, start_date)
		values ($1, $2, $3, $4::date)`, tenantID, employeeID, siteID, start)
	return err
}

func writeClientErr(w http.ResponseWriter, err error) {
	if errors.Is(err, errClientIndustry) {
		response.Validation(w, map[string]string{"industry_id": "Choose an industry."})
		return
	}
	if errors.Is(err, errClientEmployee) {
		response.Validation(w, map[string]string{"employee_id": "Choose an employee."})
		return
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		if strings.Contains(pgErr.ConstraintName, "partner") {
			response.Err(w, http.StatusConflict, "This sales customer is already an HR client.", "ERR_CONFLICT")
			return
		}
		response.Err(w, http.StatusConflict, "This employee already has an open site.", "ERR_CONFLICT")
		return
	}
	response.Err(w, http.StatusInternalServerError, "Failed to save the client.", "ERR_INTERNAL")
}
