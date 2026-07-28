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
	perms, _, _, err := loadRolePermissionsFull(ctx, pool, tenantID, roleCode)
	return perms, err
}

func loadRolePermissionsFull(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string) (map[string]string, map[string]bool, map[string]bool, error) {
	rows, err := pool.Query(ctx, `
		select pr.permission_code, coalesce(trp.access_level, 'deny'),
		  coalesce(trp.can_submit, false), coalesce(trp.can_cancel, false)
		from public.permission_registry pr
		left join public.tenant_role_permissions trp
		  on trp.tenant_id = $1 and trp.role_code = $2 and trp.permission_code = pr.permission_code
		order by pr.sort_order`, tenantID, roleCode)
	if err != nil {
		return nil, nil, nil, err
	}
	defer rows.Close()
	out := map[string]string{}
	submit := map[string]bool{}
	cancel := map[string]bool{}
	for rows.Next() {
		var code, lvl string
		var canSubmit, canCancel bool
		if err := rows.Scan(&code, &lvl, &canSubmit, &canCancel); err != nil {
			return nil, nil, nil, err
		}
		out[code] = lvl
		if canSubmit {
			submit[code] = true
		}
		if canCancel {
			cancel[code] = true
		}
	}
	return out, submit, cancel, rows.Err()
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

func accessRank(level string) int {
	switch level {
	case "write":
		return 2
	case "read":
		return 1
	default:
		return 0
	}
}

func mergeAccessHighest(current, next string) string {
	if accessRank(next) > accessRank(current) {
		return next
	}
	return current
}

// computeEffectivePermissions mirrors runtime auth: role + groups (highest wins), then overrides replace.
func computeEffectivePermissions(rolePerms, groupPerms, overrides map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range rolePerms {
		out[k] = v
	}
	for k, v := range groupPerms {
		out[k] = mergeAccessHighest(out[k], v)
	}
	for k, v := range overrides {
		out[k] = v
	}
	return out
}

func loadMergedGroupPermissions(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) (map[string]string, []string, error) {
	nameRows, err := pool.Query(ctx, `
		select g.group_name
		from public.tenant_user_group_members gm
		join public.tenant_user_groups g on g.id = gm.group_id and g.is_active = true
		where gm.tenant_id = $1 and gm.user_id = $2
		order by g.group_name`, tenantID, userID)
	if err != nil {
		return nil, nil, err
	}
	var names []string
	for nameRows.Next() {
		var name string
		if err := nameRows.Scan(&name); err != nil {
			nameRows.Close()
			return nil, nil, err
		}
		names = append(names, name)
	}
	nameRows.Close()
	if err := nameRows.Err(); err != nil {
		return nil, nil, err
	}

	rows, err := pool.Query(ctx, `
		select gp.permission_code, gp.access_level
		from public.tenant_user_group_members gm
		join public.tenant_user_group_permissions gp
		  on gp.group_id = gm.group_id and gp.tenant_id = gm.tenant_id
		join public.tenant_user_groups g on g.id = gm.group_id and g.is_active = true
		where gm.tenant_id = $1 and gm.user_id = $2`, tenantID, userID)
	if err != nil {
		return nil, names, err
	}
	defer rows.Close()
	out := map[string]string{}
	for rows.Next() {
		var code, lvl string
		if err := rows.Scan(&code, &lvl); err != nil {
			return nil, names, err
		}
		out[code] = mergeAccessHighest(out[code], lvl)
	}
	if names == nil {
		names = []string{}
	}
	return out, names, rows.Err()
}

func saveRolePermissions(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string, perms map[string]string, canSubmit, canCancel map[string]bool) error {
	if perms == nil {
		perms = map[string]string{}
	}
	if canSubmit == nil {
		canSubmit = map[string]bool{}
	}
	if canCancel == nil {
		canCancel = map[string]bool{}
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
			insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level, can_submit, can_cancel)
			values ($1, $2, $3, $4, $5, $6)
			on conflict (tenant_id, role_code, permission_code)
			do update set access_level = excluded.access_level,
			  can_submit = excluded.can_submit,
			  can_cancel = excluded.can_cancel`,
			tenantID, roleCode, code, lvl, canSubmit[code], canCancel[code])
		if err != nil {
			return err
		}
	}
	if err := bumpTenantRoleRevisionTx(ctx, tx, tenantID, roleCode); err != nil {
		return err
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
	if err := bumpUserRevisionTx(ctx, tx, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func loadGroupPermissions(ctx context.Context, pool *pgxpool.Pool, tenantID, groupID int64) (map[string]string, error) {
	rows, err := pool.Query(ctx, `
		select pr.permission_code, coalesce(gp.access_level, 'deny')
		from public.permission_registry pr
		left join public.tenant_user_group_permissions gp
		  on gp.tenant_id = $1 and gp.group_id = $2 and gp.permission_code = pr.permission_code
		order by pr.sort_order`, tenantID, groupID)
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

func saveGroupPermissions(ctx context.Context, pool *pgxpool.Pool, tenantID, groupID int64, perms map[string]string) error {
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
			insert into public.tenant_user_group_permissions (tenant_id, group_id, permission_code, access_level)
			values ($1, $2, $3, $4)
			on conflict (group_id, permission_code) do update set access_level = excluded.access_level`,
			tenantID, groupID, code, lvl)
		if err != nil {
			return err
		}
	}
	if err := bumpGroupMembersRevisionTx(ctx, tx, tenantID, groupID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func saveGroupMembers(ctx context.Context, pool *pgxpool.Pool, tenantID, groupID int64, userIDs []int64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `delete from public.tenant_user_group_members where group_id = $1 and tenant_id = $2`, groupID, tenantID); err != nil {
		return err
	}
	for _, uid := range userIDs {
		if uid <= 0 {
			continue
		}
		var ok bool
		if err := tx.QueryRow(ctx, `select exists(select 1 from public.users where id = $1 and tenant_id = $2)`, uid, tenantID).Scan(&ok); err != nil || !ok {
			continue
		}
		if _, err := tx.Exec(ctx, `
			insert into public.tenant_user_group_members (tenant_id, group_id, user_id)
			values ($1, $2, $3) on conflict do nothing`, tenantID, groupID, uid); err != nil {
			return err
		}
	}
	if err := bumpGroupMembersRevisionTx(ctx, tx, tenantID, groupID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func saveUserGroups(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, groupIDs []int64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `delete from public.tenant_user_group_members where tenant_id = $1 and user_id = $2`, tenantID, userID); err != nil {
		return err
	}
	for _, gid := range groupIDs {
		if gid <= 0 {
			continue
		}
		var ok bool
		if err := tx.QueryRow(ctx, `select exists(select 1 from public.tenant_user_groups where id = $1 and tenant_id = $2)`, gid, tenantID).Scan(&ok); err != nil || !ok {
			continue
		}
		if _, err := tx.Exec(ctx, `
			insert into public.tenant_user_group_members (tenant_id, group_id, user_id)
			values ($1, $2, $3) on conflict do nothing`, tenantID, gid, userID); err != nil {
			return err
		}
	}
	if err := bumpUserRevisionTx(ctx, tx, userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func loadUserGroupIDs(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) ([]int64, error) {
	rows, err := pool.Query(ctx, `
		select group_id from public.tenant_user_group_members
		where tenant_id = $1 and user_id = $2 order by group_id`, tenantID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}
