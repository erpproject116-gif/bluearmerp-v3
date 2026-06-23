package auth

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func currentAuthRevision(ctx context.Context, pool *pgxpool.Pool, authUserID string) (int64, error) {
	var rev int64
	err := pool.QueryRow(ctx, `
		select auth_revision from public.users
		where auth_user_id = $1::uuid and status = 'active'`, authUserID).Scan(&rev)
	return rev, err
}

func bumpUserRevisionTx(ctx context.Context, tx pgx.Tx, userID int64) error {
	_, err := tx.Exec(ctx, `
		update public.users set auth_revision = auth_revision + 1, updated_at = now()
		where id = $1`, userID)
	return err
}

func bumpTenantRoleRevisionTx(ctx context.Context, tx pgx.Tx, tenantID int64, roleCode string) error {
	_, err := tx.Exec(ctx, `
		update public.users set auth_revision = auth_revision + 1, updated_at = now()
		where tenant_id = $1 and tenant_role = $2 and status = 'active'`,
		tenantID, roleCode)
	return err
}

func bumpGroupMembersRevisionTx(ctx context.Context, tx pgx.Tx, tenantID, groupID int64) error {
	_, err := tx.Exec(ctx, `
		update public.users u set auth_revision = auth_revision + 1, updated_at = now()
		from public.tenant_user_group_members m
		where m.user_id = u.id and m.tenant_id = $1 and m.group_id = $2 and u.status = 'active'`,
		tenantID, groupID)
	return err
}

// BumpUserRevision increments revision and invalidates cache for one app user.
func BumpUserRevision(ctx context.Context, pool *pgxpool.Pool, userID int64) error {
	var authID *string
	err := pool.QueryRow(ctx, `
		update public.users set auth_revision = auth_revision + 1, updated_at = now()
		where id = $1
		returning auth_user_id::text`, userID).Scan(&authID)
	if err != nil {
		return err
	}
	if authID != nil {
		InvalidateUser(*authID)
	}
	return nil
}

// InvalidateUserByAppUserID clears cache for an app user id (after revision already bumped in DB).
func InvalidateUserByAppUserID(ctx context.Context, pool *pgxpool.Pool, appUserID int64) error {
	var authID *string
	err := pool.QueryRow(ctx, `
		select auth_user_id::text from public.users where id = $1`, appUserID).Scan(&authID)
	if err != nil {
		return err
	}
	if authID != nil {
		InvalidateUser(*authID)
	}
	return nil
}

// InvalidateUsersByTenantRole clears cache for all users with a tenant role.
func InvalidateUsersByTenantRole(ctx context.Context, pool *pgxpool.Pool, tenantID int64, roleCode string) error {
	rows, err := pool.Query(ctx, `
		select auth_user_id::text from public.users
		where tenant_id = $1 and tenant_role = $2 and auth_user_id is not null`,
		tenantID, roleCode)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var authID string
		if err := rows.Scan(&authID); err != nil {
			return err
		}
		InvalidateUser(authID)
	}
	return rows.Err()
}

// InvalidateGroupMembers clears cache for all members of a group.
func InvalidateGroupMembers(ctx context.Context, pool *pgxpool.Pool, tenantID, groupID int64) error {
	rows, err := pool.Query(ctx, `
		select u.auth_user_id::text
		from public.tenant_user_group_members m
		join public.users u on u.id = m.user_id
		where m.tenant_id = $1 and m.group_id = $2 and u.auth_user_id is not null`,
		tenantID, groupID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var authID string
		if err := rows.Scan(&authID); err != nil {
			return err
		}
		InvalidateUser(authID)
	}
	return rows.Err()
}
