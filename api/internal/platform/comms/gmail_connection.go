package comms

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// GmailConnection is a row from com_gmail_connections.
type GmailConnection struct {
	ID             int64   `json:"id"`
	TenantID       int64   `json:"tenant_id"`
	UserID         int64   `json:"user_id"`
	GoogleEmail    string  `json:"google_email"`
	HistoryID      *string `json:"history_id,omitempty"`
	LastSyncAt     *string `json:"last_sync_at,omitempty"`
	SyncStatus     string  `json:"sync_status"`
	SyncError      *string `json:"sync_error,omitempty"`
	Status         string  `json:"status"`
	StubMode       bool    `json:"stub_mode,omitempty"`
	OAuthConfigured bool   `json:"oauth_configured"`
}

type gmailConnectionRow struct {
	ID              int64
	TenantID        int64
	UserID          int64
	GoogleEmail     string
	RefreshToken    string
	AccessToken     *string
	TokenExpiresAt  *time.Time
	HistoryID       *string
	LastSyncAt      *time.Time
	SyncStatus      string
	SyncError       *string
	Status          string
}

func loadGmailConnectionForUser(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) (gmailConnectionRow, error) {
	var row gmailConnectionRow
	var lastSync *time.Time
	var tokenExp *time.Time
	err := pool.QueryRow(ctx, `
		select id, tenant_id, user_id, google_email, refresh_token, access_token, token_expires_at,
		  history_id, last_sync_at, sync_status, sync_error, status
		from public.com_gmail_connections
		where tenant_id = $1 and user_id = $2 and status = 'active'`, tenantID, userID).
		Scan(&row.ID, &row.TenantID, &row.UserID, &row.GoogleEmail, &row.RefreshToken,
			&row.AccessToken, &tokenExp, &row.HistoryID, &lastSync, &row.SyncStatus, &row.SyncError, &row.Status)
	row.TokenExpiresAt = tokenExp
	row.LastSyncAt = lastSync
	if err == pgx.ErrNoRows {
		return gmailConnectionRow{}, err
	}
	return row, err
}

// FirstActiveGmailUserID returns any user in the tenant with an active Gmail connection.
func FirstActiveGmailUserID(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (int64, error) {
	var userID int64
	err := pool.QueryRow(ctx, `
		select user_id from public.com_gmail_connections
		where tenant_id = $1 and status = 'active'
		order by updated_at desc nulls last, id desc
		limit 1`, tenantID).Scan(&userID)
	if err == pgx.ErrNoRows {
		return 0, err
	}
	return userID, err
}

// SendHTMLViaGmail sends an HTML email using a connected Gmail account (no attachments).
func SendHTMLViaGmail(ctx context.Context, pool *pgxpool.Pool, tenantID, senderUserID int64, to []string, subject, htmlBody string) error {
	cfg := LoadGmailConfig()
	_, _, err := SendViaGmail(ctx, pool, cfg, tenantID, senderUserID, to, nil, subject, htmlBody, nil)
	return err
}

func connectionToPublic(row gmailConnectionRow, cfg GmailConfig) GmailConnection {
	out := GmailConnection{
		ID:              row.ID,
		TenantID:        row.TenantID,
		UserID:          row.UserID,
		GoogleEmail:     row.GoogleEmail,
		HistoryID:       row.HistoryID,
		SyncStatus:      row.SyncStatus,
		SyncError:       row.SyncError,
		Status:          row.Status,
		StubMode:        cfg.StubMode,
		OAuthConfigured: cfg.OAuthConfigured(),
	}
	if row.LastSyncAt != nil {
		s := row.LastSyncAt.UTC().Format(time.RFC3339)
		out.LastSyncAt = &s
	}
	return out
}

func upsertGmailConnection(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64, googleEmail, refreshToken, accessToken string, expiresAt *time.Time) error {
	_, err := pool.Exec(ctx, `
		insert into public.com_gmail_connections
		  (tenant_id, user_id, google_email, refresh_token, access_token, token_expires_at, status, sync_status, updated_at)
		values ($1, $2, $3, $4, $5, $6, 'active', 'idle', now())
		on conflict (tenant_id, user_id) do update set
		  google_email = excluded.google_email,
		  refresh_token = excluded.refresh_token,
		  access_token = excluded.access_token,
		  token_expires_at = excluded.token_expires_at,
		  status = 'active',
		  sync_status = 'idle',
		  sync_error = null,
		  updated_at = now()`, tenantID, userID, googleEmail, refreshToken, nullIfEmpty(accessToken), expiresAt)
	return err
}

func revokeGmailConnection(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) error {
	_, err := pool.Exec(ctx, `
		update public.com_gmail_connections
		set status = 'revoked', updated_at = now()
		where tenant_id = $1 and user_id = $2`, tenantID, userID)
	return err
}

func updateConnectionTokens(ctx context.Context, pool *pgxpool.Pool, id int64, accessToken string, expiresAt *time.Time) error {
	_, err := pool.Exec(ctx, `
		update public.com_gmail_connections
		set access_token = $1, token_expires_at = $2, updated_at = now()
		where id = $3`, nullIfEmpty(accessToken), expiresAt, id)
	return err
}

func updateConnectionSyncState(ctx context.Context, pool *pgxpool.Pool, id int64, historyID *string, syncStatus string, syncErr *string) error {
	_, err := pool.Exec(ctx, `
		update public.com_gmail_connections
		set history_id = coalesce($1, history_id),
		  last_sync_at = case when $2::text = 'idle' then now() else last_sync_at end,
		  sync_status = $2::text,
		  sync_error = $3,
		  updated_at = now()
		where id = $4`, historyID, syncStatus, syncErr, id)
	return err
}

func nullIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
