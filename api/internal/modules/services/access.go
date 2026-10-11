package services

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/tenantmodules"
)

func requireEnabled(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tu, ok := auth.FromContext(r.Context())
			if !ok {
				response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
				return
			}
			enabled, err := tenantmodules.Enabled(r.Context(), pool, tu.TenantID, "services")
			status, code := moduleAccessDecision(enabled, err)
			if status != 0 {
				msg := "Services is turned off for this workspace."
				if code == "ERR_INTERNAL" {
					msg = "Failed to check module access."
				}
				response.JSON(w, status, response.Envelope{
					Success: false,
					Message: msg,
					Code:    code,
					Data: map[string]any{
						"module_code": "services",
						"next":        "/app/user-management/tenant-modules",
					},
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func user(w http.ResponseWriter, r *http.Request) (auth.TenantUser, bool) {
	tu, ok := auth.FromContext(r.Context())
	if !ok {
		response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
	}
	return tu, ok
}

func pathID(w http.ResponseWriter, r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	if err != nil || id <= 0 {
		response.Validation(w, map[string]string{name: "Invalid id."})
		return 0, false
	}
	return id, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	if err := json.NewDecoder(r.Body).Decode(dst); err != nil {
		response.Validation(w, map[string]string{"body": "Invalid JSON."})
		return false
	}
	return true
}

func pageParams(r *http.Request) (page, per int) {
	page, _ = strconv.Atoi(r.URL.Query().Get("page"))
	per, _ = strconv.Atoi(r.URL.Query().Get("per_page"))
	if page < 1 {
		page = 1
	}
	if per < 1 || per > 100 {
		per = 25
	}
	return page, per
}

func conflict(w http.ResponseWriter) {
	response.Err(w, http.StatusConflict, "This record was updated by someone else. Reload and try again.", "ERR_CONFLICT")
}

func branchDenied(w http.ResponseWriter, err error) {
	status, msg, code := branchiso.HTTPStatus(err)
	response.Err(w, status, msg, code)
}

func assertLocation(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, locationID int64) error {
	return branchiso.AssertCommercialLocationAccess(ctx, pool, tu, locationID)
}

func parseDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Now().UTC(), nil
	}
	return time.Parse("2006-01-02", s)
}

func int64OrNil(p *int64) any {
	if p == nil || *p <= 0 {
		return nil
	}
	return *p
}

func scanVersion(err error, w http.ResponseWriter) bool {
	if err == nil {
		return true
	}
	if errorsIsNoRows(err) {
		conflict(w)
		return false
	}
	response.Err(w, http.StatusInternalServerError, "Failed to update the record.", "ERR_INTERNAL")
	return false
}

func errorsIsNoRows(err error) bool {
	return err == pgx.ErrNoRows
}
