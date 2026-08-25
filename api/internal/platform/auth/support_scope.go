package auth

// CanManageAllSupportTickets reports whether the user may view and manage every tenant ticket.
// IT desk staff are granted support.tickets_assign write; platform superadmins and tenant owners bypass.
func (tu TenantUser) CanManageAllSupportTickets() bool {
	if tu.hasOwnerCapability() || tu.IsStoreAdmin {
		return true
	}
	return tu.HasPermission("support.tickets_assign", AccessWrite)
}

// CanAccessSupportTicket reports whether the user may view or interact with a ticket row.
func (tu TenantUser) CanAccessSupportTicket(createdByUserID *int64) bool {
	if tu.CanManageAllSupportTickets() {
		return true
	}
	if createdByUserID != nil && *createdByUserID == tu.AppUserID {
		return true
	}
	return false
}
