package crm

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type salesTeamMember struct {
	ID         int64  `json:"id"`
	FullName   string `json:"full_name"`
	Email      string `json:"email"`
	TenantRole string `json:"tenant_role"`
}

func registerSalesTeamRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequireManageSalesTeam).Get("/sales-team/members", listSalesTeamMembers(pool))
}

func listSalesTeamMembers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select u.id, u.full_name, u.email, u.tenant_role
			from public.users u
			join public.tenant_roles tr
			  on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role and tr.is_active = true
			where u.tenant_id = $1 and u.status = 'active'
			  and tr.can_view_crm = true
			  and not tr.can_view_all_crm
			order by u.full_name, u.email`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales team.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []salesTeamMember
		for rows.Next() {
			var row salesTeamMember
			if err := rows.Scan(&row.ID, &row.FullName, &row.Email, &row.TenantRole); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales team.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []salesTeamMember{}
		}
		response.OK(w, out, "OK")
	}
}
