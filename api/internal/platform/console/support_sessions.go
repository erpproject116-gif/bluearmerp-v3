package console

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/supportaccess"
)

func (s *service) startSupportSession(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		response.Err(w, http.StatusBadRequest, "Invalid customer id.", "ERR_VALIDATION")
		return
	}
	var body struct {
		Reason     string `json:"reason"`
		AccessMode string `json:"access_mode"`
		Stealth    *bool  `json:"stealth"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	sess, err := supportaccess.Start(r.Context(), s.pool, supportaccess.StartInput{
		CustomerID:     id,
		AuthUserID:     tu.AuthUserID,
		PlatformUserID: tu.PlatformUserID,
		Email:          tu.Email,
		AccessMode:     body.AccessMode,
		Reason:         body.Reason,
		Stealth:        body.Stealth,
	})
	if err != nil {
		msg := err.Error()
		code := "ERR_VALIDATION"
		status := http.StatusBadRequest
		switch {
		case strings.Contains(msg, "no workspace"):
			code = "ERR_NO_WORKSPACE"
		case strings.Contains(msg, "cannot be opened"):
			code = "ERR_WORKSPACE_INELIGIBLE"
		case strings.Contains(msg, "end your current"):
			code = "ERR_SUPPORT_SESSION_OPEN"
			status = http.StatusConflict
		}
		response.Err(w, status, msg, code)
		return
	}
	auth.InvalidateUser(tu.AuthUserID)
	cid, tid := sess.CustomerID, sess.TenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode:         "platform.support.session.start",
		EventKind:          "mutation",
		HTTPMethod:         r.Method,
		RoutePath:          r.URL.Path,
		PlatformCustomerID: &cid,
		TenantID:           &tid,
		TargetType:         "platform_support_session",
		TargetID:           &sess.ID,
		Summary:            "Opened support workspace session",
		Reason:             sess.Reason,
		Metadata: map[string]any{
			"access_mode": sess.AccessMode,
			"stealth":     sess.Stealth,
			"ends_at":     sess.EndsAt,
		},
	})
	response.OK(w, supportaccess.PublicMap(sess), "Support session started.")
}

func (s *service) extendSupportSession(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	sid, _ := strconv.ParseInt(chi.URLParam(r, "sessionId"), 10, 64)
	if sid <= 0 {
		response.Err(w, http.StatusBadRequest, "Invalid session id.", "ERR_VALIDATION")
		return
	}
	open, _ := supportaccess.OpenSessionForAuth(r.Context(), s.pool, tu.AuthUserID)
	if open == nil || open.ID != sid {
		response.Err(w, http.StatusForbidden, "Not your support session.", "ERR_FORBIDDEN")
		return
	}
	sess, err := supportaccess.ExtendSession(r.Context(), s.pool, sid)
	if err != nil {
		response.Err(w, http.StatusBadRequest, err.Error(), "ERR_VALIDATION")
		return
	}
	auth.InvalidateUser(tu.AuthUserID)
	cid, tid := sess.CustomerID, sess.TenantID
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode:         "platform.support.session.extend",
		EventKind:          "mutation",
		HTTPMethod:         r.Method,
		RoutePath:          r.URL.Path,
		PlatformCustomerID: &cid,
		TenantID:           &tid,
		TargetType:         "platform_support_session",
		TargetID:           &sess.ID,
		Summary:            "Extended support workspace session",
	})
	response.OK(w, supportaccess.PublicMap(sess), "Support session extended.")
}

func (s *service) endSupportSession(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	sid, _ := strconv.ParseInt(chi.URLParam(r, "sessionId"), 10, 64)
	if sid <= 0 {
		response.Err(w, http.StatusBadRequest, "Invalid session id.", "ERR_VALIDATION")
		return
	}
	open, _ := supportaccess.OpenSessionForAuth(r.Context(), s.pool, tu.AuthUserID)
	if open == nil || open.ID != sid {
		// Idempotent end if already closed and owned historically.
		s2, err := supportaccess.GetByID(r.Context(), s.pool, sid)
		if err != nil || s2.AuthUserID != tu.AuthUserID {
			response.Err(w, http.StatusForbidden, "Not your support session.", "ERR_FORBIDDEN")
			return
		}
		response.OK(w, supportaccess.PublicMap(s2), "Support session already ended.")
		return
	}
	cid, tid := open.CustomerID, open.TenantID
	if err := supportaccess.EndSession(r.Context(), s.pool, sid, supportaccess.EndedByUser); err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to end session.", "ERR_INTERNAL")
		return
	}
	auth.InvalidateUser(tu.AuthUserID)
	logPlatformAudit(r.Context(), s.pool, tu, platformAuditEntry{
		ActionCode:         "platform.support.session.end",
		EventKind:          "mutation",
		HTTPMethod:         r.Method,
		RoutePath:          r.URL.Path,
		PlatformCustomerID: &cid,
		TenantID:           &tid,
		TargetType:         "platform_support_session",
		TargetID:           &sid,
		Summary:            "Ended support workspace session",
	})
	sess, _ := supportaccess.GetByID(r.Context(), s.pool, sid)
	response.OK(w, supportaccess.PublicMap(sess), "Support session ended.")
}

func (s *service) listSupportSessions(w http.ResponseWriter, r *http.Request) {
	id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if id <= 0 {
		response.Err(w, http.StatusBadRequest, "Invalid customer id.", "ERR_VALIDATION")
		return
	}
	rows, err := supportaccess.ListForCustomer(r.Context(), s.pool, id, 50)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to list sessions.", "ERR_INTERNAL")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for i := range rows {
		out = append(out, supportaccess.PublicMap(&rows[i]))
	}
	response.OK(w, out, "")
}

func (s *service) getMineSupportSession(w http.ResponseWriter, r *http.Request) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
		return
	}
	open, err := supportaccess.OpenSessionForAuth(r.Context(), s.pool, tu.AuthUserID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load session.", "ERR_INTERNAL")
		return
	}
	if open == nil {
		response.OK(w, nil, "")
		return
	}
	response.OK(w, supportaccess.PublicMap(open), "")
}
