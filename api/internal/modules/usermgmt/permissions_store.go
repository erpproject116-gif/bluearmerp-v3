package usermgmt

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

var errInvalidAccessLevel = errors.New("invalid access level")

func validAccessLevel(level string) bool {
	return level == "deny" || level == "read" || level == "write"
}

func loadRolePermissions(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string) (map[string]string, error) {
	rows, err := pool.Query(ctx, `
		select pr.permission_code, coalesce(trp.access_level, 'deny')
		from public.permission_registry pr
		left join public.tenant_role_permissions trp
		  on trp.tenant_id = $1 and trp.role_code = $2 and trp.permission_code = pr.permission_code
		order by pr.sort_order`, tenantID, roleCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var code, lvl string
		if err := rows.Scan(&code, &lvl); err != nil {
			return nil, err
		}
		out[code] = lvl
	}
	return out, rows.Err()
}

func loadUserOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) (map[string]string, error) {
	rows, err := pool.Query(ctx, `
		select permission_code, access_level
		from public.user_permission_overrides
		where tenant_id = $1 and user_id = $2`, tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var code, lvl string
		if err := rows.Scan(&code, &lvl); err != nil {
			return nil, err
		}
		out[code] = lvl
	}
	return out, rows.Err()
}

func mergePermissions(rolePerms, overrides map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range rolePerms {
		out[k] = v
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

func saveRolePermissions(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string, perms map[string]string) error {
	if perms == nil {
		perms = map[string]string{}
	}
	for _, lvl := range perms {
		if !validAccessLevel(lvl) {
			return errInvalidAccessLevel
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `select permission_code from public.permission_registry`)
	if err != nil {
		return err
	}
	var codes []string
	for rows.Next() {
		var code string
		if err := rows.Scan(&code); err != nil {
			rows.Close()
			return err
		}
		codes = append(codes, code)
	}
	rows.Close()

	for _, code := range codes {
		lvl := perms[code]
		if lvl == "" {
			lvl = "deny"
		}
		_, err := tx.Exec(ctx, `
			insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, role_code, permission_code)
			do update set access_level = excluded.access_level`,
			tenantID, roleCode, code, lvl)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func saveUserOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, overrides map[string]string) error {
	if overrides == nil {
		overrides = map[string]string{}
	}
	for _, lvl := range overrides {
		if lvl != "" && !validAccessLevel(lvl) {
			return errInvalidAccessLevel
		}
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		delete from public.user_permission_overrides where tenant_id = $1 and user_id = $2`,
		tenantID, userID); err != nil {
		return err
	}
	for code, lvl := range overrides {
		if lvl == "" {
			continue
		}
		var exists bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from public.permission_registry where permission_code = $1)`, code).
			Scan(&exists); err != nil {
			return err
		}
		if !exists {
			continue
		}
		if _, err := tx.Exec(ctx, `
			insert into public.user_permission_overrides (tenant_id, user_id, permission_code, access_level)
			values ($1, $2, $3, $4)`,
			tenantID, userID, code, lvl); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
