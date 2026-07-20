package migration

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/csvmap"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var accountCanonical = []string{
	"account_code", "account_name", "account_type", "is_group", "is_active", "sort_order",
}
var accountRequired = []string{"account_code", "account_name", "account_type"}

func importAccountsMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, colMap, err := csvmap.ReadUpload(r, csvmap.DefaultMaxBytes, func(profileID int64) (map[string]string, error) {
			m, e := loadProfileColumnMap(r.Context(), pool, tu.TenantID, profileID, "accounts")
			if e == errKindMismatch {
				return nil, fmt.Errorf("import profile kind does not match accounts")
			}
			return m, e
		})
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		remapped, err := csvmap.Remap(records, colMap, accountRequired, accountCanonical)
		if err != nil {
			response.Validation(w, map[string]string{"column_map": err.Error()})
			return
		}
		rows := csvmap.RowsToMaps(remapped)
		if len(rows) > csvmap.DefaultMaxRows {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", csvmap.DefaultMaxRows)})
			return
		}

		result := importResult{}
		for i, row := range rows {
			rowNum := i + 2
			code := strings.TrimSpace(row["account_code"])
			name := strings.TrimSpace(row["account_name"])
			acctType := strings.ToLower(strings.TrimSpace(row["account_type"]))
			if code == "" || name == "" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "account_code and account_name are required"})
				continue
			}
			switch acctType {
			case "asset", "liability", "equity", "income", "expense":
			default:
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "account_type must be asset, liability, equity, income, or expense"})
				continue
			}
			isGroup := parseBoolDefault(row["is_group"], false)
			isActive := parseBoolDefault(row["is_active"], true)
			sortOrder := 0
			if v := strings.TrimSpace(row["sort_order"]); v != "" {
				n, e := strconv.Atoi(v)
				if e != nil {
					result.Failed++
					result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "invalid sort_order"})
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
				_, err = pool.Exec(r.Context(), `
					update public.fin_accounts set
					  account_name = $2, account_type = $3, is_group = $4, is_active = $5,
					  sort_order = $6, updated_at = now()
					where id = $1`,
					existingID, name, acctType, isGroup, isActive, sortOrder)
				if err != nil {
					result.Failed++
					result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: err.Error()})
					continue
				}
				result.Updated++
				continue
			}

			_, err = pool.Exec(r.Context(), `
				insert into public.fin_accounts (
				  tenant_id, account_code, account_name, account_type, is_group, is_active, sort_order
				) values ($1,$2,$3,$4,$5,$6,$7)`,
				tu.TenantID, code, name, acctType, isGroup, isActive, sortOrder)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: err.Error()})
				continue
			}
			result.Created++
		}
		response.OK(w, result, "Import finished.")
	}
}
