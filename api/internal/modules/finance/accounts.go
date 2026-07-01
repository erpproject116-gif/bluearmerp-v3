package finance

import (
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

type finAccount struct {
	ID          int64  `json:"id"`
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id,omitempty"`
	ParentCode  string `json:"parent_code,omitempty"`
	ParentName  string `json:"parent_name,omitempty"`
	IsGroup     bool   `json:"is_group"`
	IsActive    bool   `json:"is_active"`
	SortOrder   int    `json:"sort_order"`
	ChildCount  int64  `json:"child_count"`
}

type finAccountBody struct {
	AccountCode string `json:"account_code"`
	AccountName string `json:"account_name"`
	AccountType string `json:"account_type"`
	ParentID    *int64 `json:"parent_id"`
	IsGroup     *bool  `json:"is_group"`
	IsActive    *bool  `json:"is_active"`
	SortOrder   *int   `json:"sort_order"`
}

var allowedAccountTypes = map[string]struct{}{
	"asset":     {},
	"liability": {},
	"equity":    {},
	"income":    {},
	"expense":   {},
}

func registerAccountRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/accounts", listAccounts(pool))
	r.Post("/accounts", createAccount(pool))
	r.Get("/accounts/{id}", getAccount(pool))
	r.Patch("/accounts/{id}", updateAccount(pool))
	r.Delete("/accounts/{id}", deleteAccount(pool))
}

func listAccounts(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"account_code": "a.account_code",
		"account_name": "a.account_name",
		"account_type": "a.account_type",
		"sort_order":   "a.sort_order",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "sort_order", allowed)
		offset := httputil.Offset(p)
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		accountType := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("account_type")))
		status := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("status")))

		where := "a.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q != "" {
			where += fmt.Sprintf(" and (a.account_code ilike $%d or a.account_name ilike $%d)", n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if accountType != "" {
			where += fmt.Sprintf(" and a.account_type = $%d", n)
			args = append(args, accountType)
			n++
		}
		switch status {
		case "active":
			where += " and a.is_active = true"
		case "inactive":
			where += " and a.is_active = false"
		}

		countQ := fmt.Sprintf(`select count(*) from public.fin_accounts a where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count accounts.", "ERR_INTERNAL")
			return
		}

		listQ := fmt.Sprintf(`
			select a.id, a.account_code, a.account_name, a.account_type, a.parent_id,
			  coalesce(p.account_code, ''), coalesce(p.account_name, ''), a.is_group, a.is_active, a.sort_order,
			  coalesce((select count(*) from public.fin_accounts c where c.parent_id = a.id and c.tenant_id = a.tenant_id), 0)
			from public.fin_accounts a
			left join public.fin_accounts p on p.id = a.parent_id and p.tenant_id = a.tenant_id
			where %s
			order by %s %s, a.account_code asc
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), listQ, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load accounts.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []finAccount
		for rows.Next() {
			var row finAccount
			if err := rows.Scan(
				&row.ID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.ParentID,
				&row.ParentCode, &row.ParentName, &row.IsGroup, &row.IsActive, &row.SortOrder, &row.ChildCount,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read accounts.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []finAccount{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body finAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		cleaned, errs := validateAccountBody(r, pool, tu.TenantID, body, nil)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_accounts (
			  tenant_id, account_code, account_name, account_type, parent_id, is_group, is_active, sort_order
			) values ($1,$2,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, cleaned.AccountCode, cleaned.AccountName, cleaned.AccountType,
			cleaned.ParentID, cleaned.IsGroup, cleaned.IsActive, cleaned.SortOrder,
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"account_code": "Account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create account.", "ERR_INTERNAL")
			return
		}

		created, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Account created but failed to load record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.create", "fin_account", &id, nil, body)
		response.OK(w, created, "Created.")
	}
}

func getAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}
		row, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func updateAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}
		var body finAccountBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		existing, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		cleaned, errs := validateAccountBody(r, pool, tu.TenantID, body, &existing)
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.fin_accounts
			set account_code = $1,
			  account_name = $2,
			  account_type = $3,
			  parent_id = $4,
			  is_group = $5,
			  is_active = $6,
			  sort_order = $7
			where id = $8 and tenant_id = $9`,
			cleaned.AccountCode, cleaned.AccountName, cleaned.AccountType, cleaned.ParentID,
			cleaned.IsGroup, cleaned.IsActive, cleaned.SortOrder, id, tu.TenantID,
		)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"account_code": "Account code already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to update account.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}

		updated, err := fetchAccount(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Account updated but failed to load record.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.update", "fin_account", &id, nil, body)
		response.OK(w, updated, "Updated.")
	}
}

func deleteAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid account id."})
			return
		}

		var childCount int64
		if err := pool.QueryRow(r.Context(), `
			select count(*) from public.fin_accounts
			where tenant_id = $1 and parent_id = $2`, tu.TenantID, id).Scan(&childCount); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate account deletion.", "ERR_INTERNAL")
			return
		}
		if childCount > 0 {
			response.Validation(w, map[string]string{"id": "Cannot delete account with child accounts."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			delete from public.fin_accounts where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "foreign key") {
				response.Validation(w, map[string]string{"id": "Account is in use and cannot be deleted."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to delete account.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Account not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.account.delete", "fin_account", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

type normalizedFinAccount struct {
	AccountCode string
	AccountName string
	AccountType string
	ParentID    *int64
	IsGroup     bool
	IsActive    bool
	SortOrder   int
}

func validateAccountBody(r *http.Request, pool *pgxpool.Pool, tenantID int64, body finAccountBody, existing *finAccount) (normalizedFinAccount, map[string]string) {
	errs := map[string]string{}
	out := normalizedFinAccount{}

	out.AccountCode = strings.TrimSpace(body.AccountCode)
	out.AccountName = strings.TrimSpace(body.AccountName)
	out.AccountType = strings.ToLower(strings.TrimSpace(body.AccountType))
	if existing != nil {
		if out.AccountCode == "" {
			out.AccountCode = existing.AccountCode
		}
		if out.AccountName == "" {
			out.AccountName = existing.AccountName
		}
		if out.AccountType == "" {
			out.AccountType = existing.AccountType
		}
	}
	if out.AccountCode == "" {
		errs["account_code"] = "Account code is required."
	}
	if out.AccountName == "" {
		errs["account_name"] = "Account name is required."
	}
	if _, ok := allowedAccountTypes[out.AccountType]; !ok {
		errs["account_type"] = "Account type must be one of: asset, liability, equity, income, expense."
	}

	out.ParentID = body.ParentID
	if existing != nil && body.ParentID == nil {
		out.ParentID = existing.ParentID
	}
	out.IsGroup = false
	if body.IsGroup != nil {
		out.IsGroup = *body.IsGroup
	} else if existing != nil {
		out.IsGroup = existing.IsGroup
	}
	out.IsActive = true
	if body.IsActive != nil {
		out.IsActive = *body.IsActive
	} else if existing != nil {
		out.IsActive = existing.IsActive
	}
	out.SortOrder = 0
	if body.SortOrder != nil {
		out.SortOrder = *body.SortOrder
	} else if existing != nil {
		out.SortOrder = existing.SortOrder
	}
	if out.SortOrder < 0 {
		errs["sort_order"] = "Sort order cannot be negative."
	}

	if out.ParentID != nil {
		if existing != nil && *out.ParentID == existing.ID {
			errs["parent_id"] = "Account cannot be its own parent."
		} else {
			var parentExists bool
			if err := pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.fin_accounts where id = $1 and tenant_id = $2
				)`, *out.ParentID, tenantID).Scan(&parentExists); err != nil || !parentExists {
				errs["parent_id"] = "Parent account not found."
			}
		}
	}
	return out, errs
}

func fetchAccount(r *http.Request, pool *pgxpool.Pool, tenantID, id int64) (finAccount, error) {
	var row finAccount
	err := pool.QueryRow(r.Context(), `
		select a.id, a.account_code, a.account_name, a.account_type, a.parent_id,
		  coalesce(p.account_code, ''), coalesce(p.account_name, ''), a.is_group, a.is_active, a.sort_order,
		  coalesce((select count(*) from public.fin_accounts c where c.parent_id = a.id and c.tenant_id = a.tenant_id), 0)
		from public.fin_accounts a
		left join public.fin_accounts p on p.id = a.parent_id and p.tenant_id = a.tenant_id
		where a.id = $1 and a.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.AccountCode, &row.AccountName, &row.AccountType, &row.ParentID,
		&row.ParentCode, &row.ParentName, &row.IsGroup, &row.IsActive, &row.SortOrder, &row.ChildCount,
	)
	return row, err
}
