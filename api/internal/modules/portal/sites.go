package portal

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func listPortalSites(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pu, ok := FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Portal token required.", "ERR_UNAUTHORIZED")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select s.site_name, c.name
			from public.hr_client_sites s
			join public.hr_clients c on c.id = s.client_id and c.tenant_id = s.tenant_id
			where s.tenant_id = $1 and c.partner_id = $2
			order by s.site_name`, pu.TenantID, pu.PartnerID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sites.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var site, client string
			if err := rows.Scan(&site, &client); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load sites.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{"site_name": site, "client_name": client})
		}
		response.OK(w, out, "OK")
	}
}
