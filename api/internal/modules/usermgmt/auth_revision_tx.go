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
