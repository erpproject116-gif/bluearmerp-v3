package console

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/billing"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts Platform Command Center endpoints.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	r.Group(func(cr chi.Router) {
		cr.Use(requirePlatformAccess)
		cr.Use(platformAuditMiddleware(pool))

		// Legacy + command overview
		cr.With(requirePlatformPermission("platform.command.read")).Get("/platform/console/command", svc.commandOverview)

		// Customers (existing + projections)
		cr.With(requirePlatformPermission("platform.customers.read")).Get("/platform/console/customers", svc.listCustomers)
		cr.With(requirePlatformPermission("platform.customers.read")).Get("/platform/console/customers/{id}", svc.getCustomer)
		cr.With(requirePlatformPermission("platform.customers.read")).Get("/platform/console/customers/{id}/overview", svc.customerOverview)
		cr.With(requirePlatformPermission("platform.users.read")).Get("/platform/console/customers/{id}/users", svc.customerUsers)
		cr.With(requirePlatformPermission("platform.tickets.read")).Get("/platform/console/customers/{id}/tickets", svc.customerTickets)
		cr.With(requirePlatformPermission("platform.onboarding.read")).Get("/platform/console/customers/{id}/onboarding", svc.customerOnboarding)
		cr.With(requirePlatformPermission("platform.activity.read")).Get("/platform/console/customers/{id}/activity", svc.customerActivity)
		cr.With(requirePlatformPermission("platform.activity.read")).Get("/platform/console/customers/{id}/changes", svc.customerChanges)
		cr.With(requirePlatformPermission("platform.followups.read")).Get("/platform/console/customers/{id}/follow-ups", svc.listCustomerFollowUps)
		cr.With(requirePlatformPermission("platform.customers.write")).Post("/platform/console/customers", svc.createCustomer)
		cr.With(requirePlatformPermission("platform.provisioning.write")).Post("/platform/console/customers/provision", svc.provisionCustomer)
		cr.With(requirePlatformPermission("platform.provisioning.write")).Post("/platform/console/customers/{id}/approve", svc.approveCustomer)
		cr.With(requirePlatformPermission("platform.provisioning.write")).Post("/platform/console/customers/{id}/reject", svc.rejectCustomer)
		cr.With(requirePlatformPermission("platform.customers.write")).Patch("/platform/console/customers/{id}", svc.patchCustomer)
		cr.With(requirePlatformPermission("platform.billing.write")).Post("/platform/console/customers/{id}/subscriptions", svc.createSubscription)
		cr.With(requirePlatformPermission("platform.billing.write")).Post("/platform/console/customers/{id}/extend-trial", svc.extendTrial)
		cr.With(requirePlatformPermission("platform.billing.write")).Post("/platform/console/customers/{id}/convert-demo", svc.convertDemo)
		cr.With(requirePlatformPermission("platform.customers.write")).Post("/platform/console/customers/{id}/resend-invites", svc.resendTenantInvites)
		cr.With(requirePlatformPermission("platform.followups.write")).Post("/platform/console/customers/{id}/quick-follow-up", svc.quickFollowUp)
		cr.With(requirePlatformPermission("platform.onboarding.read")).Get("/platform/console/customers/{id}/playbook", svc.customerPlaybook)
		cr.With(requirePlatformPermission("platform.followups.write")).Patch("/platform/console/customers/{id}/playbook/{code}", svc.patchCustomerPlaybookStep)
		cr.With(requirePlatformPermission("platform.billing.write")).Post("/platform/console/subscriptions/{id}/invoices", svc.createInvoice)
		cr.With(requirePlatformPermission("platform.billing.write")).Post("/platform/console/invoices/{id}/mark-paid", svc.markInvoicePaid)

		// Analytics / engagement
		cr.With(requirePlatformPermission("platform.analytics.read")).Get("/platform/console/analytics", svc.analyticsOverview)
		cr.With(requirePlatformPermission("platform.analytics.read")).Get("/platform/console/customers/{id}/engagement", svc.customerEngagement)
		cr.With(requirePlatformPermission("platform.analytics.read")).Get("/platform/console/customers/{id}/sessions/{sessionId}", svc.customerSessionDetail)

		// Tickets / onboarding / follow-ups
		cr.With(requirePlatformPermission("platform.tickets.read")).Get("/platform/console/tickets", svc.listTickets)
		cr.With(requirePlatformPermission("platform.tickets.read")).Get("/platform/console/tickets/export", svc.exportTickets)
		cr.With(requirePlatformPermission("platform.tickets.read")).Get("/platform/console/tickets/{id}", svc.getTicket)
		cr.With(requirePlatformPermission("platform.tickets.write")).Post("/platform/console/tickets/{id}/internal-notes", svc.addTicketInternalNote)
		cr.With(requirePlatformPermission("platform.tickets.write")).Patch("/platform/console/tickets/{id}", svc.patchTicket)
		cr.With(requirePlatformPermission("platform.onboarding.read")).Get("/platform/console/onboarding", svc.listOnboarding)
		cr.With(requirePlatformPermission("platform.followups.read")).Get("/platform/console/follow-ups", svc.listFollowUps)
		cr.With(requirePlatformPermission("platform.followups.write")).Post("/platform/console/follow-ups", svc.createFollowUp)
		cr.With(requirePlatformPermission("platform.followups.write")).Patch("/platform/console/follow-ups/{id}", svc.patchFollowUp)

		// History / access logs
		cr.With(requirePlatformPermission("platform.access_logs.read")).Get("/platform/console/access-logs", svc.listAccessLogs)
		cr.With(requirePlatformPermission("platform.access_logs.read")).Get("/platform/console/history", svc.listAccessLogs)
		cr.With(requirePlatformPermission("platform.access_logs.read")).Get("/platform/console/change-logs", svc.listPlatformChangeLogs)

		// Staff invites
		cr.With(requirePlatformPermission("platform.staff.manage")).Get("/platform/console/staff", svc.listStaff)
		cr.With(requirePlatformPermission("platform.staff.manage")).Get("/platform/console/staff/invites", svc.listStaffInvites)
		cr.With(requirePlatformPermission("platform.staff.manage")).Post("/platform/console/staff/invites", svc.createStaffInvite)
		cr.With(requirePlatformPermission("platform.staff.manage")).Post("/platform/console/staff/invites/{id}/revoke", svc.revokeStaffInvite)
		cr.With(requirePlatformPermission("platform.staff.manage")).Patch("/platform/console/staff/{id}", svc.patchStaff)

		// Plans
		cr.With(requirePlatformPermission("platform.plans.read")).Get("/platform/console/plans", svc.listPlans)
		billing.RegisterConsoleRoutes(cr, pool, cfg)
		cr.With(requirePlatformPermission("platform.plans.read")).Get("/platform/console/plans/{id}", svc.getPlan)
		cr.With(requirePlatformPermission("platform.plans.write")).Post("/platform/console/plans", svc.createPlan)
		cr.With(requirePlatformPermission("platform.plans.write")).Patch("/platform/console/plans/{id}", svc.patchPlan)
	})
}

type service struct {
	pool *pgxpool.Pool
	cfg  config.Config
}

// Deprecated name kept for any external references; prefer requirePlatformAccess.
func requirePlatformSuperadmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok || !tu.CanAccessPlatformCommand() {
			response.Err(w, http.StatusForbidden, "Platform Command Center access required.", "ERR_FORBIDDEN")
			return
		}
		next.ServeHTTP(w, r)
	})
}
