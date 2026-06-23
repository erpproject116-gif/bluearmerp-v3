package usermgmt

import (
	"context"

	"github.com/jackc/pgx/v5"
)

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
