package migration

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var partnerCanonical = []string{
	"partner_code", "company_name", "partner_kind", "ceo_name", "phone", "mobile", "email", "address", "tin", "status",
}
var partnerRequired = []string{"company_name", "partner_kind"}

func importPartnersMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedPartnersHandler(pool, false)
}

func previewPartnersMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedPartnersHandler(pool, true)
}

func mappedPartnersHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "partners", partnerRequired, partnerCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}
		for i, row := range rows {
			rowNum := i + 2
			name := strings.TrimSpace(row["company_name"])
			kind := strings.ToLower(strings.TrimSpace(row["partner_kind"]))
			if name == "" {
				failRow(&result, rowNum, "company_name is required")
				continue
			}
			if kind != "customer" && kind != "vendor" && kind != "both" {
				failRow(&result, rowNum, "partner_kind must be customer, vendor, or both")
				continue
			}
			status := strings.ToLower(strings.TrimSpace(row["status"]))
			if status == "" {
				status = "active"
			}
			if status != "active" && status != "inactive" {
				failRow(&result, rowNum, "status must be active or inactive")
				continue
			}

			existingID, matchErr := lookupPartner(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["partner_code"]), "", strings.TrimSpace(row["tin"]), kind)
			if existingID == 0 {
				existingID, matchErr = lookupPartner(r.Context(), pool, tu.TenantID, "", name, "", kind)
			}
			if matchErr != "" && !strings.HasPrefix(matchErr, "unmatched") {
				failRow(&result, rowNum, matchErr)
				continue
			}
			if existingID > 0 {
				if dry {
					result.Updated++
					continue
				}
				_, err := pool.Exec(r.Context(), `
					update public.inv_partners set
					  partner_kind = $2, company_name = $3, ceo_name = $4,
					  phone = $5, mobile = $6, email = $7, address = $8, tin = $9, status = $10, updated_at = now()
					where id = $1 and tenant_id = $11`,
					existingID, kind, name, nullIfEmpty(row["ceo_name"]),
					nullIfEmpty(row["phone"]), nullIfEmpty(row["mobile"]), nullIfEmpty(row["email"]),
					nullIfEmpty(row["address"]), nullIfEmpty(row["tin"]), status, tu.TenantID)
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
			partnerCode, codeErr := resolveEntityCode(r.Context(), pool, tu.TenantID, "partner", strings.TrimSpace(row["partner_code"]))
			if codeErr != nil {
				failRow(&result, rowNum, codeErr.Error())
				continue
			}
			var id int64
			err := pool.QueryRow(r.Context(), `
				insert into public.inv_partners (
				  tenant_id, partner_code, partner_kind, company_name, ceo_name,
				  phone, mobile, email, address, tin, status
				) values (
				  $1, $2, $3, $4, $5,
				  $6, $7, $8, $9, $10, $11
				) returning id`,
				tu.TenantID, partnerCode, kind, name, nullIfEmpty(row["ceo_name"]),
				nullIfEmpty(row["phone"]), nullIfEmpty(row["mobile"]), nullIfEmpty(row["email"]),
				nullIfEmpty(row["address"]), nullIfEmpty(row["tin"]), status,
			).Scan(&id)
			if err != nil {
				failRow(&result, rowNum, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, dry)
	}
}
