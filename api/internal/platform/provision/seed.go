package provision

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

type sqlExecer interface {
	Exec(ctx context.Context, sql string, arguments ...any) (pgconn.CommandTag, error)
}

// SeedTenantDefaults creates system roles and permission rows required before inserting users.
func SeedTenantDefaults(ctx context.Context, db sqlExecer, tenantID int64) error {
	if tenantID <= 0 {
		return fmt.Errorf("invalid tenant id")
	}

	if _, err := db.Exec(ctx, `
		insert into public.tenant_roles (
		  tenant_id, role_code, role_name, description, is_system,
		  can_manage_users, can_manage_form_settings, sort_order
		)
		values
		  ($1, 'member', 'Sales Team',
		   'Sales team members see only their assigned quotations, sales, and warranty work.',
		   true, false, false, 10),
		  ($1, 'store_admin', 'Store Admin',
		   'Can manage users and form settings',
		   true, true, true, 20)
		on conflict (tenant_id, role_code) do nothing`, tenantID); err != nil {
		return fmt.Errorf("tenant roles: %w", err)
	}

	if _, err := db.Exec(ctx, `
		update public.tenant_roles
		set can_view_all_crm = true,
		    can_manage_sales_team = true,
		    can_view_crm_analytics = true,
		    updated_at = now()
		where tenant_id = $1 and role_code = 'store_admin'`, tenantID); err != nil {
		return fmt.Errorf("tenant roles crm flags: %w", err)
	}

	if _, err := db.Exec(ctx, `
		insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
		select $1, 'store_admin', pr.permission_code, 'write'
		from public.permission_registry pr
		on conflict (tenant_id, role_code, permission_code) do update
		  set access_level = excluded.access_level`, tenantID); err != nil {
		return fmt.Errorf("store_admin permissions: %w", err)
	}

	if _, err := db.Exec(ctx, `
		insert into public.tenant_role_permissions (tenant_id, role_code, permission_code, access_level)
		select $1, 'member', pr.permission_code,
		  case
		    when pr.module_code in ('user_management') or pr.permission_code like 'settings.%' then 'deny'
		    when pr.module_code = 'activity_logs' then 'deny'
		    when pr.module_code = 'finance' then 'deny'
		    when pr.permission_code in (
		      'crm.reports_customer_quotations', 'crm.reports_item_demand',
		      'crm.reports_conversion', 'crm.reports_low_stock', 'crm.settings_alert_rules'
		    ) then 'deny'
		    when pr.feature_key is null then 'read'
		    else 'read'
		  end
		from public.permission_registry pr
		on conflict (tenant_id, role_code, permission_code) do update
		  set access_level = excluded.access_level`, tenantID); err != nil {
		return fmt.Errorf("member permissions: %w", err)
	}

	return nil
}
