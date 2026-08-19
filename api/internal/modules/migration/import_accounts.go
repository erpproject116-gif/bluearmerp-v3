package migration

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var accountCanonical = []string{
	"account_code", "account_name", "account_type", "is_group", "is_active", "sort_order",
}
var accountRequired = []string{"account_code", "account_name", "account_type"}

func importAccountsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedAccountsHandler(pool, false)
}

func previewAccountsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedAccountsHandler(pool, true)
}

func mappedAccountsHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "accounts", accountRequired, accountCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}
		for i, row := range rows {
			rowNum := i + 2
			code := strings.TrimSpace(row["account_code"])
			name := strings.TrimSpace(row["account_name"])
			acctType := strings.ToLower(strings.TrimSpace(row["account_type"]))
			if code == "" || name == "" {
				failRow(&result, rowNum, "account_code and account_name are required")
				continue
			}
			switch acctType {
			case "asset", "liability", "equity", "income", "expense":
			default:
				failRow(&result, rowNum, "account_type must be asset, liability, equity, income, or expense")
				continue
			}
			isGroup := parseBoolDefault(row["is_group"], false)
			isActive := parseBoolDefault(row["is_active"], true)
			sortOrder := 0
			if v := strings.TrimSpace(row["sort_order"]); v != "" {
				n, e := strconv.Atoi(v)
				if e != nil {
					failRow(&result, rowNum, "invalid sort_order")
					continue
				}
				sortOrder = n
			}

			var existingID int64
			err := pool.QueryRow(r.Context(), `
				select id from public.fin_accounts
				where tenant_id = $1 and account_code = $2 and deleted_at is null`,
				tu.TenantID, code).Scan(&existingID)
			if err == nil && existingID > 0 {
				if dry {
					result.Updated++
					continue
				}
				_, err = pool.Exec(r.Context(), `
					update public.fin_accounts set
					  account_name = $2, account_type = $3, is_group = $4, is_active = $5,
					  sort_order = $6, updated_at = now()
					where id = $1`,
					existingID, name, acctType, isGroup, isActive, sortOrder)
				if err != nil {
					failRow(&result, rowNum, err.Error())
					continue
				}
				result.Updated++
				continue
			}
			if dry {
				result.Created++
				continue
			}
			_, err = pool.Exec(r.Context(), `
				insert into public.fin_accounts (
				  tenant_id, account_code, account_name, account_type, is_group, is_active, sort_order
				) values ($1,$2,$3,$4,$5,$6,$7)`,
				tu.TenantID, code, name, acctType, isGroup, isActive, sortOrder)
			if err != nil {
				failRow(&result, rowNum, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, dry)
	}
}
