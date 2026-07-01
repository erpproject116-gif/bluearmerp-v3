package crm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Lead struct {
	ID          int64   `json:"id"`
	LeadName    string  `json:"lead_name"`
	CompanyName string  `json:"company_name,omitempty"`
	Email       string  `json:"email,omitempty"`
	Phone       string  `json:"phone,omitempty"`
	Source      string  `json:"source"`
	Status      string  `json:"status"`
	PartnerID   *int64  `json:"partner_id,omitempty"`
	PicUserID   *int64  `json:"pic_user_id,omitempty"`
	PicName     string  `json:"pic_name"`
	Notes       *string `json:"notes,omitempty"`
}

type Opportunity struct {
	ID                int64    `json:"id"`
	LeadID            *int64   `json:"lead_id,omitempty"`
	LeadName          string   `json:"lead_name,omitempty"`
	PartnerID         *int64   `json:"partner_id,omitempty"`
	PartnerName       string   `json:"partner_name,omitempty"`
	Title             string   `json:"title"`
	Stage             string   `json:"stage"`
	ExpectedValue     *float64 `json:"expected_value,omitempty"`
	ExpectedCloseDate *string  `json:"expected_close_date,omitempty"`
	Probability       *int     `json:"probability,omitempty"`
	QuotationID       *int64   `json:"quotation_id,omitempty"`
	PicUserID         *int64   `json:"pic_user_id,omitempty"`
	PicName           string   `json:"pic_name"`
	Notes             *string  `json:"notes,omitempty"`
}

type leadBody struct {
	LeadName    string  `json:"lead_name"`
	CompanyName *string `json:"company_name"`
	Email       *string `json:"email"`
	Phone       *string `json:"phone"`
	Source      string  `json:"source"`
	Status      string  `json:"status"`
	PartnerID   *int64  `json:"partner_id"`
	PicUserID   *int64  `json:"pic_user_id"`
	PicName     string  `json:"pic_name"`
	Notes       *string `json:"notes"`
}

type opportunityBody struct {
	LeadID            *int64   `json:"lead_id"`
	PartnerID         *int64   `json:"partner_id"`
	Title             string   `json:"title"`
	Stage             string   `json:"stage"`
	ExpectedValue     *float64 `json:"expected_value"`
	ExpectedCloseDate *string  `json:"expected_close_date"`
	Probability       *int     `json:"probability"`
	PicUserID         *int64   `json:"pic_user_id"`
	PicName           string   `json:"pic_name"`
	Notes             *string  `json:"notes"`
}

func registerLeadRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/leads", listLeads(pool))
	r.Post("/leads", createLead(pool))
	r.Get("/leads/{id}", getLead(pool))
	r.Patch("/leads/{id}", patchLead(pool))
	r.Post("/leads/{id}/convert-to-quotation", convertLeadToQuotation(pool))

	r.Get("/opportunities", listOpportunities(pool))
	r.Post("/opportunities", createOpportunity(pool))
	r.Get("/opportunities/{id}", getOpportunity(pool))
	r.Patch("/opportunities/{id}", patchOpportunity(pool))
}

func listLeads(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"lead_name": "l.lead_name", "status": "l.status", "updated_at": "l.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "updated_at", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)
		where := "l.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (l.lead_name ilike $%d or coalesce(l.company_name,'') ilike $%d or coalesce(l.email,'') ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if v := strings.TrimSpace(r.URL.Query().Get("status")); v != "" {
			where += fmt.Sprintf(" and l.status = $%d", n)
			args = append(args, v)
			n++
		}
		base := fmt.Sprintf(`select l.id, l.lead_name, coalesce(l.company_name,''), coalesce(l.email,''),
		  coalesce(l.phone,''), l.source, l.status, l.partner_id, l.pic_user_id, l.pic_name, l.notes,
		  count(*) over()
		  from public.crm_leads l where %s`, where)
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "l.updated_at"
		}
		q := fmt.Sprintf("%s order by %s %s limit $%d offset $%d", base, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list leads.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Lead
		var total int64
		for rows.Next() {
			var row Lead
			if err := rows.Scan(
				&row.ID, &row.LeadName, &row.CompanyName, &row.Email, &row.Phone,
				&row.Source, &row.Status, &row.PartnerID, &row.PicUserID, &row.PicName, &row.Notes, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read leads.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Lead{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createLead(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body leadBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.LeadName)
		if name == "" {
			response.Validation(w, map[string]string{"lead_name": "Lead name is required."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "new"
		}
		source := strings.TrimSpace(body.Source)
		if source == "" {
			source = "manual"
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.crm_leads (
			  tenant_id, lead_name, company_name, email, phone, source, status,
			  partner_id, pic_user_id, pic_name, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
			tu.TenantID, name, body.CompanyName, body.Email, body.Phone, source, status,
			body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName), body.Notes,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create lead.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.lead.create", "crm_lead", &id, nil, body)
		row, err := loadLead(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.OK(w, Lead{ID: id, LeadName: name, Status: status, Source: source}, "Created.")
			return
		}
		response.OK(w, row, "Created.")
	}
}

func getLead(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadLead(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Lead not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func patchLead(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body leadBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		name := strings.TrimSpace(body.LeadName)
		if name == "" {
			response.Validation(w, map[string]string{"lead_name": "Lead name is required."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.crm_leads set
			  lead_name=$3, company_name=$4, email=$5, phone=$6, source=$7, status=$8,
			  partner_id=$9, pic_user_id=$10, pic_name=$11, notes=$12, updated_at=now()
			where id=$1 and tenant_id=$2`,
			id, tu.TenantID, name, body.CompanyName, body.Email, body.Phone,
			strings.TrimSpace(body.Source), strings.TrimSpace(body.Status),
			body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName), body.Notes,
		)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Lead not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.lead.update", "crm_lead", &id, nil, body)
		row, _ := loadLead(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func convertLeadToQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		lead, err := loadLead(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Lead not found.", "ERR_NOT_FOUND")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert lead.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		partnerID := lead.PartnerID
		if partnerID == nil {
			companyName := strings.TrimSpace(lead.CompanyName)
			if companyName == "" {
				companyName = strings.TrimSpace(lead.LeadName)
			}
			var partnerCode string
			if err := tx.QueryRow(r.Context(), `select public.allocate_tenant_code($1, 'partner')`, tu.TenantID).Scan(&partnerCode); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to allocate partner code.", "ERR_INTERNAL")
				return
			}
			var createdPartnerID int64
			if err := tx.QueryRow(r.Context(), `
				insert into public.inv_partners (
				  tenant_id, partner_code, partner_kind, company_name, phone, email, status
				) values ($1,$2,'customer',$3,$4,$5,'active')
				returning id`,
				tu.TenantID, partnerCode, companyName, nullIfBlank(lead.Phone), nullIfBlank(lead.Email),
			).Scan(&createdPartnerID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create customer.", "ERR_INTERNAL")
				return
			}
			partnerID = &createdPartnerID
		}

		taxTypeID, err := firstActiveTaxTypeID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "No active transaction type found. Please configure one first."})
			return
		}
		currencyID, err := defaultCurrencyID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"currency_id": "No active currency found. Please configure one first."})
			return
		}
		locationID, err := firstActiveLocationID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"location_id": "No active location found. Please create one first."})
			return
		}

		orderDate := time.Now().UTC()
		var dateSeq int
		var referenceNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, reference_no from public.allocate_quotation_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &referenceNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate quotation number.", "ERR_INTERNAL")
			return
		}

		var quotationID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.quo_quotations (
			  tenant_id, order_date, date_seq, reference_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
			  location_id, progress_status, subtotal, tax_total, grand_total, created_by_user_id, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unconfirmed',0,0,0,$11,$12)
			returning id`,
			tu.TenantID, orderDate, dateSeq, referenceNo,
			taxTypeID, currencyID, *partnerID, lead.PicUserID, strings.TrimSpace(lead.PicName),
			locationID, tu.AppUserID, noteFromLead(lead),
		).Scan(&quotationID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create quotation.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.crm_leads set
			  status='converted', partner_id=$3, updated_at=now()
			where id=$1 and tenant_id=$2`,
			lead.ID, tu.TenantID, *partnerID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to mark lead as converted.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.crm_opportunities set quotation_id=$3, updated_at=now()
			where tenant_id=$1 and lead_id=$2 and quotation_id is null`,
			tu.TenantID, lead.ID, quotationID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link opportunity quotation.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert lead.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.lead.convert", "crm_lead", &lead.ID, nil, map[string]any{
			"lead_id":      lead.ID,
			"partner_id":   *partnerID,
			"quotation_id": quotationID,
		})

		response.OK(w, map[string]any{
			"lead_id":       lead.ID,
			"partner_id":    *partnerID,
			"quotation_id":  quotationID,
			"redirect_to":   "/app/quotation/quotations",
			"lead_status":   "converted",
			"message":       "Lead converted and draft quotation created.",
			"reference_no":  referenceNo,
			"date_sequence": dateSeq,
		}, "Converted.")
	}
}

func firstActiveTaxTypeID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id
		from public.quo_tax_types
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by sort_order asc, id asc
		limit 1`, tenantID).Scan(&id)
	return id, err
}

func defaultCurrencyID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id
		from public.quo_currencies
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by is_default desc, id asc
		limit 1`, tenantID).Scan(&id)
	return id, err
}

func firstActiveLocationID(ctx context.Context, tx pgx.Tx, tenantID int64) (int64, error) {
	var id int64
	err := tx.QueryRow(ctx, `
		select id
		from public.inv_locations
		where tenant_id = $1 and status = 'active' and deleted_at is null
		order by location_code asc, id asc
		limit 1`, tenantID).Scan(&id)
	return id, err
}

func nullIfBlank(v string) *string {
	s := strings.TrimSpace(v)
	if s == "" {
		return nil
	}
	return &s
}

func noteFromLead(lead Lead) *string {
	var parts []string
	if n := strings.TrimSpace(lead.NotesOrEmpty()); n != "" {
		parts = append(parts, n)
	}
	parts = append(parts, fmt.Sprintf("Converted from CRM lead #%d (%s).", lead.ID, strings.TrimSpace(lead.LeadName)))
	out := strings.TrimSpace(strings.Join(parts, "\n"))
	if out == "" {
		return nil
	}
	return &out
}

func (l Lead) NotesOrEmpty() string {
	if l.Notes == nil {
		return ""
	}
	return *l.Notes
}

func loadLead(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Lead, error) {
	var row Lead
	err := pool.QueryRow(ctx, `
		select id, lead_name, coalesce(company_name,''), coalesce(email,''), coalesce(phone,''),
		  source, status, partner_id, pic_user_id, pic_name, notes
		from public.crm_leads where id=$1 and tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.LeadName, &row.CompanyName, &row.Email, &row.Phone,
		&row.Source, &row.Status, &row.PartnerID, &row.PicUserID, &row.PicName, &row.Notes,
	)
	return row, err
}

func listOpportunities(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"title": "o.title", "stage": "o.stage", "expected_close_date": "o.expected_close_date",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "expected_close_date", allowed)
		offset := httputil.Offset(p)
		where := "o.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (o.title ilike $%d or coalesce(l.lead_name,'') ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if v := strings.TrimSpace(r.URL.Query().Get("stage")); v != "" {
			where += fmt.Sprintf(" and o.stage = $%d", n)
			args = append(args, v)
			n++
		}
		base := fmt.Sprintf(`select o.id, o.lead_id, coalesce(l.lead_name,''), o.partner_id, coalesce(p.company_name,''),
		  o.title, o.stage, o.expected_value, o.expected_close_date, o.probability, o.quotation_id,
		  o.pic_user_id, o.pic_name, o.notes, count(*) over()
		  from public.crm_opportunities o
		  left join public.crm_leads l on l.id = o.lead_id
		  left join public.inv_partners p on p.id = o.partner_id
		  where %s`, where)
		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "o.expected_close_date"
		}
		q := fmt.Sprintf("%s order by %s %s nulls last limit $%d offset $%d", base, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list opportunities.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Opportunity
		var total int64
		for rows.Next() {
			var row Opportunity
			var closeDate *time.Time
			if err := rows.Scan(
				&row.ID, &row.LeadID, &row.LeadName, &row.PartnerID, &row.PartnerName,
				&row.Title, &row.Stage, &row.ExpectedValue, &closeDate, &row.Probability, &row.QuotationID,
				&row.PicUserID, &row.PicName, &row.Notes, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read opportunities.", "ERR_INTERNAL")
				return
			}
			row.ExpectedCloseDate = datePtrToStr(closeDate)
			out = append(out, row)
		}
		if out == nil {
			out = []Opportunity{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createOpportunity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body opportunityBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		stage := strings.TrimSpace(body.Stage)
		if stage == "" {
			stage = "prospect"
		}
		var closeDate *time.Time
		if body.ExpectedCloseDate != nil && strings.TrimSpace(*body.ExpectedCloseDate) != "" {
			t, err := parseDate(*body.ExpectedCloseDate)
			if err != nil {
				response.Validation(w, map[string]string{"expected_close_date": "Use YYYY-MM-DD."})
				return
			}
			closeDate = &t
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.crm_opportunities (
			  tenant_id, lead_id, partner_id, title, stage, expected_value,
			  expected_close_date, probability, pic_user_id, pic_name, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
			tu.TenantID, body.LeadID, body.PartnerID, title, stage, body.ExpectedValue,
			closeDate, body.Probability, body.PicUserID, strings.TrimSpace(body.PicName), body.Notes,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create opportunity.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.opportunity.create", "crm_opportunity", &id, nil, body)
		row, _ := loadOpportunity(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func getOpportunity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadOpportunity(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Opportunity not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func patchOpportunity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body opportunityBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		var closeDate *time.Time
		if body.ExpectedCloseDate != nil && strings.TrimSpace(*body.ExpectedCloseDate) != "" {
			t, err := parseDate(*body.ExpectedCloseDate)
			if err != nil {
				response.Validation(w, map[string]string{"expected_close_date": "Use YYYY-MM-DD."})
				return
			}
			closeDate = &t
		}
		tag, err := pool.Exec(r.Context(), `
			update public.crm_opportunities set
			  lead_id=$3, partner_id=$4, title=$5, stage=$6, expected_value=$7,
			  expected_close_date=$8, probability=$9, pic_user_id=$10, pic_name=$11, notes=$12, updated_at=now()
			where id=$1 and tenant_id=$2`,
			id, tu.TenantID, body.LeadID, body.PartnerID, title, strings.TrimSpace(body.Stage),
			body.ExpectedValue, closeDate, body.Probability, body.PicUserID,
			strings.TrimSpace(body.PicName), body.Notes,
		)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Opportunity not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.opportunity.update", "crm_opportunity", &id, nil, body)
		row, _ := loadOpportunity(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func loadOpportunity(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Opportunity, error) {
	var row Opportunity
	var closeDate *time.Time
	err := pool.QueryRow(ctx, `
		select o.id, o.lead_id, coalesce(l.lead_name,''), o.partner_id, coalesce(p.company_name,''),
		  o.title, o.stage, o.expected_value, o.expected_close_date, o.probability, o.quotation_id,
		  o.pic_user_id, o.pic_name, o.notes
		from public.crm_opportunities o
		left join public.crm_leads l on l.id = o.lead_id
		left join public.inv_partners p on p.id = o.partner_id
		where o.id=$1 and o.tenant_id=$2`, id, tenantID).Scan(
		&row.ID, &row.LeadID, &row.LeadName, &row.PartnerID, &row.PartnerName,
		&row.Title, &row.Stage, &row.ExpectedValue, &closeDate, &row.Probability, &row.QuotationID,
		&row.PicUserID, &row.PicName, &row.Notes,
	)
	row.ExpectedCloseDate = datePtrToStr(closeDate)
	return row, err
}
