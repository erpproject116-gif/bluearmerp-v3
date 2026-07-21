package comms

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// RegisterRoutes mounts communications endpoints under /comms.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/comms", func(cr chi.Router) {
		cr.With(auth.RequirePermission("comms.read", auth.AccessRead)).Get("/sent-messages", listSentMessages(pool))
		cr.With(auth.RequirePermission("comms.read", auth.AccessRead)).Get("/doc-emails", listDocEmails(pool))
		cr.With(auth.RequirePermission("comms.send", auth.AccessRead)).Get("/email-signature", getEmailSignature(pool))
		cr.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Put("/email-signature", putEmailSignature(pool))
		cr.With(auth.RequirePermission("comms.inbox", auth.AccessRead)).Get("/inbox", listInbox(pool))
		cr.With(auth.RequirePermission("comms.admin", auth.AccessRead)).Get("/gmail/status", getGmailStatus(pool))
		cr.With(auth.RequirePermission("comms.admin", auth.AccessWrite)).Get("/gmail/connect", startGmailConnect(pool))
		cr.With(auth.RequirePermission("comms.admin", auth.AccessWrite)).Post("/gmail/disconnect", disconnectGmail(pool))
		cr.With(auth.RequirePermission("comms.admin", auth.AccessWrite)).Post("/gmail/sync", triggerGmailSync(pool))
		cr.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/send-report-email", sendReportEmail(pool))
	})
}

// RegisterPublicRoutes mounts unauthenticated OAuth callback.
func RegisterPublicRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Get("/comms/gmail/callback", gmailOAuthCallback(pool, cfg))
}

// RegisterJobRoutes mounts the Gmail incremental sync cron endpoint.
func RegisterJobRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	r.Post("/platform/jobs/gmail-sync", gmailSyncJob(pool, cfg))
}

func listSentMessages(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := r.URL.Query()
		page := 1
		if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
			page = v
		}
		pageSize := 25
		if v, err := strconv.Atoi(q.Get("pageSize")); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
		docType := q.Get("doc_type")
		channel := q.Get("channel")

		result, err := ListSentMessages(r.Context(), pool, ListSentMessagesParams{
			TenantID: tu.TenantID,
			Page:     page,
			PageSize: pageSize,
			DocType:  docType,
			Channel:  channel,
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sent messages.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, result.Rows, page, pageSize, result.Total)
	}
}

func listDocEmails(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := r.URL.Query()
		docType := strings.TrimSpace(q.Get("doc_type"))
		docID, err := strconv.ParseInt(q.Get("doc_id"), 10, 64)
		if docType == "" || err != nil || docID <= 0 {
			response.Validation(w, map[string]string{"doc_type": "doc_type and doc_id are required."})
			return
		}
		rows, err := ListDocEmails(r.Context(), pool, tu.TenantID, docType, docID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load document emails.", "ERR_INTERNAL")
			return
		}
		response.OK(w, rows, "OK")
	}
}

func listInbox(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := r.URL.Query()
		page := 1
		if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
			page = v
		}
		pageSize := 25
		if v, err := strconv.Atoi(q.Get("pageSize")); err == nil && v > 0 && v <= 100 {
			pageSize = v
		}
		result, err := ListInboxMessages(r.Context(), pool, ListInboxParams{
			TenantID: tu.TenantID,
			User:     tu,
			Page:     page,
			PageSize: pageSize,
			Q:        strings.TrimSpace(q.Get("q")),
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list inbox messages.", "ERR_INTERNAL")
			return
		}
		response.OKList(w, result.Rows, page, pageSize, result.Total)
	}
}

func getGmailStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		cfg := LoadGmailConfig()
		row, err := loadGmailConnectionForUser(r.Context(), pool, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.OK(w, GmailConnection{
				StubMode:        cfg.StubMode,
				OAuthConfigured: cfg.OAuthConfigured(),
				Status:          "disconnected",
			}, "Not connected.")
			return
		}
		response.OK(w, connectionToPublic(row, cfg), "OK")
	}
}

func startGmailConnect(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		cfg := LoadGmailConfig()
		if cfg.StubMode {
			stubRefresh := fmt.Sprintf("stub-refresh-%d-%d", tu.TenantID, tu.AppUserID)
			if err := upsertGmailConnection(r.Context(), pool, tu.TenantID, tu.AppUserID, tu.Email, stubRefresh, "", nil); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to create stub Gmail connection.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"stub":    true,
				"message": "Gmail OAuth not configured (COMMS_GMAIL_STUB). Stub connection saved; sync will insert placeholder messages only.",
			}, "Stub Gmail connected.")
			return
		}
		url, err := buildGmailAuthURL(cfg, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, err.Error(), "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]string{"auth_url": url}, "Redirect user to auth_url.")
	}
}

func disconnectGmail(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := revokeGmailConnection(r.Context(), pool, tu.TenantID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to disconnect Gmail.", "ERR_INTERNAL")
			return
		}
		response.OK(w, nil, "Gmail disconnected.")
	}
}

func triggerGmailSync(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		cfg := LoadGmailConfig()
		result, err := SyncAllGmailConnections(r.Context(), pool, cfg, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Gmail sync failed.", "ERR_INTERNAL")
			return
		}
		msg := "Gmail sync completed."
		if result.StubMode {
			msg = "Stub Gmail sync completed (COMMS_GMAIL_STUB)."
		}
		response.OK(w, result, msg)
	}
}

func gmailOAuthCallback(pool *pgxpool.Pool, appCfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := LoadGmailConfig()
		frontend := strings.TrimSpace(appCfg.CORSOrigin)
		if idx := strings.Index(frontend, ","); idx > 0 {
			frontend = strings.TrimSpace(frontend[:idx])
		}
		settingsURL := strings.TrimRight(frontend, "/") + "/app/comms/settings"

		if errMsg := r.URL.Query().Get("error"); errMsg != "" {
			http.Redirect(w, r, settingsURL+"?gmail_error="+urlQueryEscape(errMsg), http.StatusFound)
			return
		}
		code := strings.TrimSpace(r.URL.Query().Get("code"))
		state := strings.TrimSpace(r.URL.Query().Get("state"))
		if code == "" || state == "" {
			http.Redirect(w, r, settingsURL+"?gmail_error=missing_code", http.StatusFound)
			return
		}
		payload, err := verifyOAuthState(cfg, state)
		if err != nil {
			http.Redirect(w, r, settingsURL+"?gmail_error=invalid_state", http.StatusFound)
			return
		}
		tok, email, err := exchangeGmailCode(r.Context(), cfg, code)
		if err != nil {
			log.Printf("comms gmail callback: %v", err)
			http.Redirect(w, r, settingsURL+"?gmail_error=token_exchange", http.StatusFound)
			return
		}
		var exp *time.Time
		if !tok.Expiry.IsZero() {
			t := tok.Expiry.UTC()
			exp = &t
		}
		refresh := tok.RefreshToken
		if refresh == "" {
			http.Redirect(w, r, settingsURL+"?gmail_error=missing_refresh_token", http.StatusFound)
			return
		}
		if err := upsertGmailConnection(r.Context(), pool, payload.TenantID, payload.UserID, email, refresh, tok.AccessToken, exp); err != nil {
			http.Redirect(w, r, settingsURL+"?gmail_error=save_failed", http.StatusFound)
			return
		}
		http.Redirect(w, r, settingsURL+"?gmail_connected=1", http.StatusFound)
	}
}

func gmailSyncJob(pool *pgxpool.Pool, cfg config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		secret := strings.TrimSpace(os.Getenv("PLATFORM_JOB_SECRET"))
		if secret == "" {
			secret = strings.TrimSpace(cfg.PlatformJobSecret)
		}
		if secret == "" {
			response.Err(w, http.StatusServiceUnavailable, "Platform job secret not configured.", "ERR_UNAVAILABLE")
			return
		}
		if strings.TrimSpace(r.Header.Get("X-Platform-Job-Secret")) != secret {
			response.Err(w, http.StatusUnauthorized, "Invalid job secret.", "ERR_UNAUTHORIZED")
			return
		}

		gmailCfg := LoadGmailConfig()
		tenantRows, err := pool.Query(r.Context(), `
			select distinct tenant_id from public.com_gmail_connections where status = 'active'`)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list Gmail connections.", "ERR_INTERNAL")
			return
		}
		defer tenantRows.Close()

		type tenantSync struct {
			TenantID             int64 `json:"tenant_id"`
			ConnectionsProcessed int   `json:"connections_processed"`
			MessagesUpserted     int   `json:"messages_upserted"`
			StubMode             bool  `json:"stub_mode"`
		}
		var results []tenantSync
		for tenantRows.Next() {
			var tenantID int64
			if err := tenantRows.Scan(&tenantID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read tenant.", "ERR_INTERNAL")
				return
			}
			syncRes, syncErr := SyncAllGmailConnections(r.Context(), pool, gmailCfg, tenantID)
			if syncErr != nil {
				log.Printf("comms gmail-sync tenant=%d: %v", tenantID, syncErr)
				continue
			}
			results = append(results, tenantSync{
				TenantID:             tenantID,
				ConnectionsProcessed: syncRes.ConnectionsProcessed,
				MessagesUpserted:     syncRes.MessagesUpserted,
				StubMode:             syncRes.StubMode,
			})
		}
		response.OK(w, results, "Gmail sync job completed.")
	}
}

func urlQueryEscape(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, " ", "+"), "&", "%26")
}

// SyncTenantGmail is used by tests and manual triggers.
func SyncTenantGmail(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (syncResult, error) {
	return SyncAllGmailConnections(ctx, pool, LoadGmailConfig(), tenantID)
}
