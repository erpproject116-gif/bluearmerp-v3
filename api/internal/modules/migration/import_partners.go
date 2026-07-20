package migration

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/csvmap"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var partnerCanonical = []string{
	"company_name", "partner_kind", "ceo_name", "phone", "mobile", "email", "address", "tin", "status",
}
var partnerRequired = []string{"company_name", "partner_kind"}

func importPartnersMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		records, colMap, err := csvmap.ReadUpload(r, csvmap.DefaultMaxBytes, func(profileID int64) (map[string]string, error) {
			m, e := loadProfileColumnMap(r.Context(), pool, tu.TenantID, profileID, "partners")
			if e == errKindMismatch {
				return nil, fmt.Errorf("import profile kind does not match partners")
			}
			return m, e
		})
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}
		remapped, err := csvmap.Remap(records, colMap, partnerRequired, partnerCanonical)
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
			name := strings.TrimSpace(row["company_name"])
			kind := strings.ToLower(strings.TrimSpace(row["partner_kind"]))
			if name == "" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "company_name is required"})
				continue
			}
			if kind != "customer" && kind != "vendor" && kind != "both" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "partner_kind must be customer, vendor, or both"})
				continue
			}
			status := strings.ToLower(strings.TrimSpace(row["status"]))
			if status == "" {
				status = "active"
			}
			if status != "active" && status != "inactive" {
				result.Failed++
				result.RowErrors = append(result.RowErrors, importRowError{Row: rowNum, Message: "status must be active or inactive"})
				continue
			}

			var id int64
			err := pool.QueryRow(r.Context(), `
				insert into public.inv_partners (
				  tenant_id, partner_code, partner_kind, company_name, ceo_name,
				  phone, mobile, email, address, tin, status
				) values (
				  $1, public.allocate_tenant_code($1, 'partner'), $2, $3, $4,
				  $5, $6, $7, $8, $9, $10
				) returning id`,
				tu.TenantID, kind, name, nullIfEmpty(row["ceo_name"]),
				nullIfEmpty(row["phone"]), nullIfEmpty(row["mobile"]), nullIfEmpty(row["email"]),
				nullIfEmpty(row["address"]), nullIfEmpty(row["tin"]), status,
			).Scan(&id)
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
