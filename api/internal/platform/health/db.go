package health

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// DBHandler reports whether the API can read the same Postgres data as Supabase SQL Editor.
func DBHandler(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		var usersTotal, usersLinked int
		if err := pool.QueryRow(ctx, `select count(*)::int from public.users`).Scan(&usersTotal); err != nil {
			response.Err(w, http.StatusServiceUnavailable, "DB unreachable: "+err.Error(), "ERR_DB")
			return
		}
		_ = pool.QueryRow(ctx, `
			select count(*)::int from public.users
			where auth_user_id is not null and status = 'active'`).Scan(&usersLinked)

		var tenantRolesTable bool
		_ = pool.QueryRow(ctx, `
			select exists (
			  select 1 from information_schema.tables
			  where table_schema = 'public' and table_name = 'tenant_roles'
			)`).Scan(&tenantRolesTable)

		var johnActive int
		_ = pool.QueryRow(ctx, `
			select count(*)::int
			from public.users u
			join public.tenants t on t.id = u.tenant_id
			left join public.tenant_roles tr
			  on tr.tenant_id = u.tenant_id and tr.role_code = u.tenant_role and tr.is_active = true
			left join public.platform_users pu on pu.auth_user_id = u.auth_user_id
			where u.auth_user_id = '400b6912-fa01-46e2-9192-abc514741c22'::uuid
			  and u.status = 'active'
			  and t.status not in ('suspended', 'cancelled')`).Scan(&johnActive)

		response.OK(w, map[string]any{
			"supabase_project_ref": config.ProjectRefFromURL(cfg.SupabaseURL),
			"users_total":          usersTotal,
			"users_linked_active":  usersLinked,
			"tenant_roles_table":   tenantRolesTable,
			"auth_me_query_john":   johnActive,
		}, "OK")
	}
}
