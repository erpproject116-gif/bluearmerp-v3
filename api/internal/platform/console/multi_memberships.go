package console

import (
	"net/http"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// listMultiMemberships returns grandfathered emails with more than one active customer tenant.
func (s *service) listMultiMemberships(w http.ResponseWriter, r *http.Request) {
	rows, err := auth.ListMultiMembershipEmails(r.Context(), s.pool, 200)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load multi-memberships.", "ERR_INTERNAL")
		return
	}
	response.OK(w, map[string]any{
		"rows":   rows,
		"count":  len(rows),
		"policy": "one_email_one_customer_business",
		"note":   "Read-only. Existing multi-memberships are grandfathered; new second links are blocked.",
	}, "OK")
}
