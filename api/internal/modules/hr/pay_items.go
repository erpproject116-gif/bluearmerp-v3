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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type PayItemType struct {
	ID           int64   `json:"id"`
	ItemCode     string  `json:"item_code"`
	ItemName     string  `json:"item_name"`
	ItemKind     string  `json:"item_kind"`
	IsTaxable    bool    `json:"is_taxable"`
	IncludeInSSS bool    `json:"include_in_sss"`
	IsSystem     bool    `json:"is_system"`
	IsActive     bool    `json:"is_active"`
	DefaultAmt   float64 `json:"default_amount"`
	SortOrder    int     `json:"sort_order"`
	Notes        *string `json:"notes,omitempty"`
}

type EmployeePayItem struct {
	ID            int64   `json:"id"`
	EmployeeID    int64   `json:"employee_id"`
	PayItemTypeID int64   `json:"pay_item_type_id"`
	ItemCode      string  `json:"item_code,omitempty"`
	ItemName      string  `json:"item_name,omitempty"`
	ItemKind      string  `json:"item_kind,omitempty"`
	Amount        float64 `json:"amount"`
	EffectiveFrom string  `json:"effective_from"`
	EffectiveTo   *string `json:"effective_to,omitempty"`
	IsActive      bool    `json:"is_active"`
	Notes         *string `json:"notes,omitempty"`
}

func registerPayItemRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessRead)).Get("/pay-item-types", listPayItemTypes(pool))
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessWrite)).Post("/pay-item-types", createPayItemType(pool))
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessWrite)).Patch("/pay-item-types/{id}", patchPayItemType(pool))

	r.With(auth.RequirePermission("hr.pay_items", auth.AccessRead)).Get("/employees/{id}/pay-items", listEmployeePayItems(pool))
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessWrite)).Post("/employees/{id}/pay-items", createEmployeePayItem(pool))
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessWrite)).Patch("/employee-pay-items/{id}", patchEmployeePayItem(pool))
	r.With(auth.RequirePermission("hr.pay_items", auth.AccessWrite)).Delete("/employee-pay-items/{id}", deleteEmployeePayItem(pool))
}

func listPayItemTypes(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sort_order", map[string]string{
			"sort_order": "t.sort_order", "item_code": "t.item_code", "item_name": "t.item_name",
		})
		offset := httputil.Offset(p)
		where := "t.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if kind := strings.TrimSpace(r.URL.Query().Get("kind")); kind != "" {
			where += fmt.Sprintf(" and t.item_kind = $%d", n)
			args = append(args, kind)
			n++
		}
		if r.URL.Query().Get("active") == "1" {
			where += " and t.is_active"
		}
		q := fmt.Sprintf(`
			select t.id, t.item_code, t.item_name, t.item_kind, t.is_taxable, t.include_in_sss,
			  t.is_system, t.is_active, t.default_amount::float8, t.sort_order, t.notes,
			  count(*) over()
			from public.hr_pay_item_types t
			where %s order by t.sort_order, t.item_code
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list pay item types.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []PayItemType
		var total int64
		for rows.Next() {
			var row PayItemType
			if err := rows.Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.ItemKind, &row.IsTaxable, &row.IncludeInSSS,
				&row.IsSystem, &row.IsActive, &row.DefaultAmt, &row.SortOrder, &row.Notes, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pay item type.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []PayItemType{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createPayItemType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			ItemCode     string  `json:"item_code"`
			ItemName     string  `json:"item_name"`
			ItemKind     string  `json:"item_kind"`
			IsTaxable    *bool   `json:"is_taxable"`
			IncludeInSSS *bool   `json:"include_in_sss"`
			DefaultAmt   float64 `json:"default_amount"`
			SortOrder    int     `json:"sort_order"`
			Notes        *string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.ToUpper(strings.TrimSpace(body.ItemCode))
		name := strings.TrimSpace(body.ItemName)
		kind := strings.TrimSpace(body.ItemKind)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"item_code": "Code and name are required."})
			return
		}
		if kind != "earning" && kind != "deduction" {
			response.Validation(w, map[string]string{"item_kind": "Must be earning or deduction."})
			return
		}
		taxable := true
		if body.IsTaxable != nil {
			taxable = *body.IsTaxable
		}
		incSSS := false
		if body.IncludeInSSS != nil {
			incSSS = *body.IncludeInSSS
		}
		sort := body.SortOrder
		if sort == 0 {
			sort = 100
		}
		var row PayItemType
		err := pool.QueryRow(r.Context(), `
			insert into public.hr_pay_item_types
			  (tenant_id, item_code, item_name, item_kind, is_taxable, include_in_sss, default_amount, sort_order, notes)
			values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
			returning id, item_code, item_name, item_kind, is_taxable, include_in_sss, is_system, is_active,
			  default_amount::float8, sort_order, notes`,
			tu.TenantID, code, name, kind, taxable, incSSS, body.DefaultAmt, sort, body.Notes,
		).Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.ItemKind, &row.IsTaxable, &row.IncludeInSSS,
			&row.IsSystem, &row.IsActive, &row.DefaultAmt, &row.SortOrder, &row.Notes)
		if err != nil {
			if strings.Contains(err.Error(), "unique") {
				response.Validation(w, map[string]string{"item_code": "Code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create pay item type.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "hr.pay_item_type.create", "hr_pay_item_type", &row.ID, nil, body)
		response.OK(w, row, "Pay item type created.")
	}
}

func patchPayItemType(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			ItemName     *string  `json:"item_name"`
			IsTaxable    *bool    `json:"is_taxable"`
			IncludeInSSS *bool    `json:"include_in_sss"`
			IsActive     *bool    `json:"is_active"`
			DefaultAmt   *float64 `json:"default_amount"`
			SortOrder    *int     `json:"sort_order"`
			Notes        *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var row PayItemType
		err = pool.QueryRow(r.Context(), `
			update public.hr_pay_item_types set
			  item_name = coalesce($3, item_name),
			  is_taxable = coalesce($4, is_taxable),
			  include_in_sss = coalesce($5, include_in_sss),
			  is_active = coalesce($6, is_active),
			  default_amount = coalesce($7, default_amount),
			  sort_order = coalesce($8, sort_order),
			  notes = coalesce($9, notes),
			  updated_at = now()
			where id = $1 and tenant_id = $2
			returning id, item_code, item_name, item_kind, is_taxable, include_in_sss, is_system, is_active,
			  default_amount::float8, sort_order, notes`,
			id, tu.TenantID, body.ItemName, body.IsTaxable, body.IncludeInSSS, body.IsActive, body.DefaultAmt, body.SortOrder, body.Notes,
		).Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.ItemKind, &row.IsTaxable, &row.IncludeInSSS,
			&row.IsSystem, &row.IsActive, &row.DefaultAmt, &row.SortOrder, &row.Notes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pay item type not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "Pay item type updated.")
	}
}

func listEmployeePayItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid employee id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select epi.id, epi.employee_id, epi.pay_item_type_id, t.item_code, t.item_name, t.item_kind,
			  epi.amount::float8, epi.effective_from::text, epi.effective_to::text, epi.is_active, epi.notes
			from public.hr_employee_pay_items epi
			join public.hr_pay_item_types t on t.id = epi.pay_item_type_id
			where epi.tenant_id = $1 and epi.employee_id = $2
			order by t.item_kind, t.sort_order, t.item_code`, tu.TenantID, empID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list employee pay items.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []EmployeePayItem
		for rows.Next() {
			var row EmployeePayItem
			var effTo *string
			if err := rows.Scan(&row.ID, &row.EmployeeID, &row.PayItemTypeID, &row.ItemCode, &row.ItemName, &row.ItemKind,
				&row.Amount, &row.EffectiveFrom, &effTo, &row.IsActive, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read employee pay item.", "ERR_INTERNAL")
				return
			}
			row.EffectiveTo = effTo
			out = append(out, row)
		}
		if out == nil {
			out = []EmployeePayItem{}
		}
		response.OK(w, out, "OK")
	}
}

func createEmployeePayItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		empID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || empID <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid employee id."})
			return
		}
		var body struct {
			PayItemTypeID int64   `json:"pay_item_type_id"`
			Amount        float64 `json:"amount"`
			EffectiveFrom string  `json:"effective_from"`
			EffectiveTo   *string `json:"effective_to"`
			Notes         *string `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.PayItemTypeID <= 0 {
			response.Validation(w, map[string]string{"pay_item_type_id": "Required."})
			return
		}
		effFrom := strings.TrimSpace(body.EffectiveFrom)
		if effFrom == "" {
			effFrom = time.Now().Format("2006-01-02")
		}
		var row EmployeePayItem
		var effTo *string
		err = pool.QueryRow(r.Context(), `
			insert into public.hr_employee_pay_items
			  (tenant_id, employee_id, pay_item_type_id, amount, effective_from, effective_to, notes)
			values ($1,$2,$3,$4,$5::date,$6::date,$7)
			returning id, employee_id, pay_item_type_id, amount::float8, effective_from::text, effective_to::text, is_active, notes`,
			tu.TenantID, empID, body.PayItemTypeID, body.Amount, effFrom, body.EffectiveTo, body.Notes,
		).Scan(&row.ID, &row.EmployeeID, &row.PayItemTypeID, &row.Amount, &row.EffectiveFrom, &effTo, &row.IsActive, &row.Notes)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to assign pay item.", "ERR_INTERNAL")
			return
		}
		row.EffectiveTo = effTo
		_ = pool.QueryRow(r.Context(), `
			select item_code, item_name, item_kind from public.hr_pay_item_types where id=$1`, body.PayItemTypeID,
		).Scan(&row.ItemCode, &row.ItemName, &row.ItemKind)
		response.OK(w, row, "Pay item assigned.")
	}
}

func patchEmployeePayItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			Amount      *float64 `json:"amount"`
			EffectiveTo *string  `json:"effective_to"`
			IsActive    *bool    `json:"is_active"`
			Notes       *string  `json:"notes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var row EmployeePayItem
		var effTo *string
		err = pool.QueryRow(r.Context(), `
			update public.hr_employee_pay_items set
			  amount = coalesce($3, amount),
			  effective_to = coalesce($4::date, effective_to),
			  is_active = coalesce($5, is_active),
			  notes = coalesce($6, notes),
			  updated_at = now()
			where id = $1 and tenant_id = $2
			returning id, employee_id, pay_item_type_id, amount::float8, effective_from::text, effective_to::text, is_active, notes`,
			id, tu.TenantID, body.Amount, body.EffectiveTo, body.IsActive, body.Notes,
		).Scan(&row.ID, &row.EmployeeID, &row.PayItemTypeID, &row.Amount, &row.EffectiveFrom, &effTo, &row.IsActive, &row.Notes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Employee pay item not found.", "ERR_NOT_FOUND")
			return
		}
		row.EffectiveTo = effTo
		response.OK(w, row, "Updated.")
	}
}

func deleteEmployeePayItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.hr_employee_pay_items where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Employee pay item not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
