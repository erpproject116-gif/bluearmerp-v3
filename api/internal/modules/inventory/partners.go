package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Partner struct {
	ID                 int64          `json:"id"`
	PartnerCode        string         `json:"partner_code"`
	PartnerKind        string         `json:"partner_kind"`
	CompanyName        string         `json:"company_name"`
	CeoName            *string        `json:"ceo_name"`
	Phone              *string        `json:"phone"`
	Mobile             *string        `json:"mobile"`
	Email              *string        `json:"email"`
	Address            *string        `json:"address"`
	Status             string         `json:"status"`
	CreditLimit        *float64       `json:"credit_limit,omitempty"`
	CreditLimitOnHold  bool           `json:"credit_limit_on_hold"`
	DefaultPriceListID *int64         `json:"default_price_list_id,omitempty"`
	CustomValues       map[string]any `json:"custom_values,omitempty"`
}

type partnerBody struct {
	PartnerKind        string         `json:"partner_kind"`
	CompanyName        string         `json:"company_name"`
	CeoName            *string        `json:"ceo_name"`
	Phone              *string        `json:"phone"`
	Mobile             *string        `json:"mobile"`
	Email              *string        `json:"email"`
	Address            *string        `json:"address"`
	Status             string         `json:"status"`
	CreditLimit        *float64       `json:"credit_limit"`
	CreditLimitOnHold  *bool          `json:"credit_limit_on_hold"`
	DefaultPriceListID *int64         `json:"default_price_list_id"`
	CustomValues       map[string]any `json:"custom_values"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/inventory", func(ir chi.Router) {
		registerInventoryWorkspaceRoutes(ir, pool)
		registerPartnerRoutes(ir, pool)
		registerLocationRoutes(ir, pool)
		registerProjectRoutes(ir, pool)
		registerDepartmentRoutes(ir, pool)
		registerItemRoutes(ir, pool)
		registerItemSearchRoutes(ir, pool)
		registerRepairOrderRoutes(ir, pool)
		registerRepairOrderAttachmentRoutes(ir, pool)
		registerRepairRegistrationRoutes(ir, pool)
		registerStockMovementRoutes(ir, pool)
		registerStockEntryRoutes(ir, pool)
		registerSerialRoutes(ir, pool)
		registerReconciliationRoutes(ir, pool)
		registerInventoryReportRoutes(ir, pool)
		registerPriceListRoutes(ir, pool)
		registerProductBundleRoutes(ir, pool)
	})
}

func registerPartnerRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/partners/next-code", nextCodeHandler(pool, "partner"))
	r.Get("/partners", listPartners(pool))
	r.Post("/partners", createPartner(pool))
	r.Patch("/partners/{id}", updatePartner(pool))
	r.Delete("/partners/{id}", deletePartner(pool))
}

func listPartners(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"partner_code": "partner_code",
		"partner_kind": "partner_kind",
		"company_name": "company_name",
		"ceo_name":     "ceo_name",
		"phone":        "phone",
		"mobile":       "mobile",
		"email":        "email",
		"status":       "status",
		"created_at":   "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "partner_code", allowed)
		offset := httputil.Offset(p)

		where := "tenant_id = $1 and deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (company_name ilike $%d or partner_code ilike $%d or coalesce(email,'') ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "active" || p.Status == "inactive" {
			where += fmt.Sprintf(" and status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		order := "asc"
		if p.Order == "desc" {
			order = "desc"
		}
		q := fmt.Sprintf(`
			select id, partner_code, partner_kind, company_name, ceo_name, phone, mobile, email, address, status,
			  credit_limit::float8, coalesce(credit_limit_on_hold, false), default_price_list_id,
			       count(*) over() as total_count
			from public.inv_partners
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list partners.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []Partner
		var total int64
		for rows.Next() {
			var row Partner
			if err := rows.Scan(&row.ID, &row.PartnerCode, &row.PartnerKind, &row.CompanyName,
				&row.CeoName, &row.Phone, &row.Mobile, &row.Email, &row.Address, &row.Status,
				&row.CreditLimit, &row.CreditLimitOnHold, &row.DefaultPriceListID, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read partners.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Partner{}
		}
		ids := make([]int64, len(out))
		for i, row := range out {
			ids[i] = row.ID
		}
		mergeCustomValues(r.Context(), pool, tu.TenantID, entityPartner, ids, func(id int64, vals map[string]any) {
			for i := range out {
				if out[i].ID == id {
					out[i].CustomValues = vals
					return
				}
			}
		})
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createPartner(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body partnerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if err := validatePartner(body, true); err != nil {
			response.Validation(w, err)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create partner.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var code string
		if err := tx.QueryRow(r.Context(), `select public.allocate_tenant_code($1, 'partner')`, tu.TenantID).Scan(&code); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate code.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_partners
			  (tenant_id, partner_code, partner_kind, company_name, ceo_name, phone, mobile, email, address, status,
			   credit_limit, credit_limit_on_hold, default_price_list_id)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			returning id`,
			tu.TenantID, code, body.PartnerKind, strings.TrimSpace(body.CompanyName),
			body.CeoName, body.Phone, body.Mobile, body.Email, body.Address, defaultStatus(body.Status),
			body.CreditLimit, body.CreditLimitOnHold != nil && *body.CreditLimitOnHold, body.DefaultPriceListID).
			Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create partner.", "ERR_INTERNAL")
			return
		}

		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityPartner, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.partner.create", "inv_partner", &id, nil, body)
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save partner.", "ERR_INTERNAL")
			return
		}

		row, _ := getPartner(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func updatePartner(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body partnerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if err := validatePartner(body, false); err != nil {
			response.Validation(w, err)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update partner.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_partners set
			  partner_kind = $1, company_name = $2, ceo_name = $3, phone = $4, mobile = $5,
			  email = $6, address = $7, status = $8,
			  credit_limit = $9, credit_limit_on_hold = $10, default_price_list_id = $11, updated_at = now()
			where id = $12 and tenant_id = $13 and deleted_at is null`,
			body.PartnerKind, strings.TrimSpace(body.CompanyName), body.CeoName, body.Phone, body.Mobile,
			body.Email, body.Address, defaultStatus(body.Status),
			body.CreditLimit, body.CreditLimitOnHold != nil && *body.CreditLimitOnHold, body.DefaultPriceListID, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Partner not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityPartner, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save partner.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.partner.update", "inv_partner", &id, nil, body)
		row, _ := getPartner(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func deletePartner(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.inv_partners set deleted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Partner not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.partner.delete", "inv_partner", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func getPartner(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Partner, error) {
	var row Partner
	err := pool.QueryRow(ctx, `
		select id, partner_code, partner_kind, company_name, ceo_name, phone, mobile, email, address, status,
		  credit_limit::float8, coalesce(credit_limit_on_hold, false), default_price_list_id
		from public.inv_partners
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).
		Scan(&row.ID, &row.PartnerCode, &row.PartnerKind, &row.CompanyName,
			&row.CeoName, &row.Phone, &row.Mobile, &row.Email, &row.Address, &row.Status,
			&row.CreditLimit, &row.CreditLimitOnHold, &row.DefaultPriceListID)
	if err != nil {
		return row, err
	}
	row.CustomValues = attachCustom(ctx, pool, tenantID, entityPartner, id)
	return row, nil
}

func validatePartner(b partnerBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.CompanyName) == "" {
		errs["company_name"] = "Company name is required."
	}
	if b.PartnerKind != "" && b.PartnerKind != "customer" && b.PartnerKind != "vendor" && b.PartnerKind != "both" {
		errs["partner_kind"] = "Must be customer, vendor, or both."
	}
	if create && b.PartnerKind == "" {
		errs["partner_kind"] = "Kind is required."
	}
	if b.Status != "" && b.Status != "active" && b.Status != "inactive" {
		errs["status"] = "Must be active or inactive."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func nextCodeHandler(pool *pgxpool.Pool, entityType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var code string
		err := pool.QueryRow(r.Context(), `select public.preview_next_tenant_code($1, $2)`, tu.TenantID, entityType).Scan(&code)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview code.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]string{"next_code": code}, "OK")
	}
}

func defaultStatus(s string) string {
	if s == "inactive" {
		return "inactive"
	}
	return "active"
}
