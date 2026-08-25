package auth

import "fmt"

// CanViewAllCRM reports whether the user may see all tenant CRM/commercial records.
func (tu TenantUser) CanViewAllCRM() bool {
	if tu.hasOwnerCapability() {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("crm.reports_customer_quotations", AccessRead)
	}
	return tu.canViewAllCrmRole
}

// CanViewCrmAnalytics reports whether the user may access CRM analytics reports and tenant-wide KPIs.
func (tu TenantUser) CanViewCrmAnalytics() bool {
	if tu.hasOwnerCapability() {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("crm.reports_customer_quotations", AccessRead)
	}
	return tu.canViewCrmAnalyticsRole
}

// CanManageSalesTeam reports whether the user may assign work to sales team members.
func (tu TenantUser) CanManageSalesTeam() bool {
	if tu.hasOwnerCapability() {
		return true
	}
	if tu.permissions != nil {
		return tu.HasPermission("user_management.users", AccessWrite)
	}
	return tu.canManageSalesTeamRole || tu.CanManageUsers()
}

// CanAccessPicRecord reports whether a scoped user may view or edit a PIC-owned record.
func (tu TenantUser) CanAccessPicRecord(picUserID, createdByUserID *int64) bool {
	if tu.CanViewAllCRM() {
		return true
	}
	if picUserID != nil && *picUserID == tu.AppUserID {
		return true
	}
	if createdByUserID != nil && *createdByUserID == tu.AppUserID {
		return true
	}
	return false
}

// PicOrCreatedScopeSQL appends AND (pic = user OR created_by = user) for table alias.
func (tu TenantUser) PicOrCreatedScopeSQL(alias string, argIdx int, args *[]any) (string, int) {
	if tu.CanViewAllCRM() {
		return "", argIdx
	}
	frag := fmt.Sprintf(" and (%s.pic_user_id = $%d or %s.created_by_user_id = $%d)", alias, argIdx, alias, argIdx+1)
	*args = append(*args, tu.AppUserID, tu.AppUserID)
	return frag, argIdx + 2
}

// PicScopeSQL appends AND pic_column = user for scoped users.
func (tu TenantUser) PicScopeSQL(column string, argIdx int, args *[]any) (string, int) {
	if tu.CanViewAllCRM() {
		return "", argIdx
	}
	frag := fmt.Sprintf(" and %s = $%d", column, argIdx)
	*args = append(*args, tu.AppUserID)
	return frag, argIdx + 1
}
