package comms

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type syncResult struct {
	ConnectionsProcessed int `json:"connections_processed"`
	MessagesUpserted     int `json:"messages_upserted"`
	StubMode             bool `json:"stub_mode"`
	Skipped              int `json:"skipped"`
}

// SyncAllGmailConnections runs incremental sync for active tenant connections.
func SyncAllGmailConnections(ctx context.Context, pool *pgxpool.Pool, cfg GmailConfig, tenantID int64) (syncResult, error) {
	var result syncResult
	result.StubMode = cfg.StubMode

	if cfg.StubMode {
		return runStubGmailSync(ctx, pool, tenantID)
	}

	rows, err := pool.Query(ctx, `
		select id, tenant_id, user_id, google_email, refresh_token, access_token, token_expires_at,
		  history_id, last_sync_at, sync_status, sync_error, status
		from public.com_gmail_connections
		where tenant_id = $1 and status = 'active'`, tenantID)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var row gmailConnectionRow
		var lastSync *time.Time
		var tokenExp *time.Time
		if err := rows.Scan(&row.ID, &row.TenantID, &row.UserID, &row.GoogleEmail, &row.RefreshToken,
			&row.AccessToken, &tokenExp, &row.HistoryID, &lastSync, &row.SyncStatus, &row.SyncError, &row.Status); err != nil {
			return result, err
		}
		row.TokenExpiresAt = tokenExp
		row.LastSyncAt = lastSync
		result.ConnectionsProcessed++
		n, syncErr := syncGmailConnection(ctx, pool, cfg, row)
		result.MessagesUpserted += n
		if syncErr != nil {
			errMsg := syncErr.Error()
			_ = updateConnectionSyncState(ctx, pool, row.ID, row.HistoryID, "error", &errMsg)
			continue
		}
		_ = updateConnectionSyncState(ctx, pool, row.ID, row.HistoryID, "idle", nil)
	}
	return result, rows.Err()
}

func runStubGmailSync(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (syncResult, error) {
	var result syncResult
	result.StubMode = true
	rows, err := pool.Query(ctx, `
		select id, user_id, google_email
		from public.com_gmail_connections
		where tenant_id = $1 and status = 'active'`, tenantID)
	if err != nil {
		return result, err
	}
	defer rows.Close()

	for rows.Next() {
		var connID, userID int64
		var email string
		if err := rows.Scan(&connID, &userID, &email); err != nil {
			return result, err
		}
		result.ConnectionsProcessed++
		stubID := fmt.Sprintf("stub-%d-%d", tenantID, connID)
		n, err := upsertMailMessage(ctx, pool, insertMailMessageParams{
			TenantID:       tenantID,
			ConnectionID:   &connID,
			OwnerUserID:    &userID,
			GmailMessageID: stubID,
			GmailThreadID:  strPtr(stubID + "-thread"),
			Direction:      "inbound",
			FromAddr:       "stub@example.com",
			ToAddrs:        []string{email},
			Subject:        "[STUB] Gmail sync — configure GOOGLE_CLIENT_ID to sync real mail",
			Snippet:        "COMMS_GMAIL_STUB is active; no real Gmail API calls were made.",
			BodyText:       "Enable Google OAuth env vars and disable COMMS_GMAIL_STUB to sync live Gmail.",
			InternalDate:   time.Now().UTC(),
			IsStub:         true,
		})
		if err != nil {
			result.Skipped++
			continue
		}
		if n > 0 {
			result.MessagesUpserted++
		}
		_ = updateConnectionSyncState(ctx, pool, connID, nil, "idle", nil)
	}
	return result, rows.Err()
}

func syncGmailConnection(ctx context.Context, pool *pgxpool.Pool, cfg GmailConfig, row gmailConnectionRow) (int, error) {
	_ = updateConnectionSyncState(ctx, pool, row.ID, row.HistoryID, "syncing", nil)
	accessToken, err := ensureAccessToken(ctx, pool, cfg, row)
	if err != nil {
		return 0, err
	}

	if row.HistoryID != nil && strings.TrimSpace(*row.HistoryID) != "" {
		return syncGmailHistory(ctx, pool, accessToken, row)
	}
	return syncGmailInitial(ctx, pool, accessToken, row)
}

func syncGmailInitial(ctx context.Context, pool *pgxpool.Pool, accessToken string, row gmailConnectionRow) (int, error) {
	profile, err := gmailGetProfile(ctx, accessToken)
	if err != nil {
		return 0, err
	}
	if profile.HistoryID != "" {
		hid := profile.HistoryID
		row.HistoryID = &hid
	}

	listURL := "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50&labelIds=INBOX"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, listURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("gmail list: %s", strings.TrimSpace(string(body)))
	}
	var listed struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(body, &listed); err != nil {
		return 0, err
	}

	upserted := 0
	for _, m := range listed.Messages {
		n, err := fetchAndStoreGmailMessage(ctx, pool, accessToken, row, m.ID)
		if err != nil {
			continue
		}
		upserted += n
	}
	return upserted, nil
}

func syncGmailHistory(ctx context.Context, pool *pgxpool.Pool, accessToken string, row gmailConnectionRow) (int, error) {
	startHistoryID := strings.TrimSpace(*row.HistoryID)
	listURL := fmt.Sprintf("https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=%s&historyTypes=messageAdded", startHistoryID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, listURL, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusNotFound {
		return syncGmailInitial(ctx, pool, accessToken, row)
	}
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("gmail history: %s", strings.TrimSpace(string(body)))
	}
	var hist struct {
		HistoryID string `json:"historyId"`
		History   []struct {
			MessagesAdded []struct {
				Message struct {
					ID string `json:"id"`
				} `json:"message"`
			} `json:"messagesAdded"`
		} `json:"history"`
	}
	if err := json.Unmarshal(body, &hist); err != nil {
		return 0, err
	}
	if hist.HistoryID != "" {
		hid := hist.HistoryID
		row.HistoryID = &hid
	}

	upserted := 0
	seen := map[string]bool{}
	for _, h := range hist.History {
		for _, added := range h.MessagesAdded {
			id := added.Message.ID
			if id == "" || seen[id] {
				continue
			}
			seen[id] = true
			n, err := fetchAndStoreGmailMessage(ctx, pool, accessToken, row, id)
			if err != nil {
				continue
			}
			upserted += n
		}
	}
	return upserted, nil
}

func gmailGetProfile(ctx context.Context, accessToken string) (struct{ HistoryID string }, error) {
	var profile struct{ HistoryID string }
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://gmail.googleapis.com/gmail/v1/users/me/profile", nil)
	if err != nil {
		return profile, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return profile, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return profile, fmt.Errorf("gmail profile: %s", strings.TrimSpace(string(body)))
	}
	err = json.Unmarshal(body, &profile)
	return profile, err
}

func fetchAndStoreGmailMessage(ctx context.Context, pool *pgxpool.Pool, accessToken string, row gmailConnectionRow, messageID string) (int, error) {
	url := fmt.Sprintf("https://gmail.googleapis.com/gmail/v1/users/me/messages/%s?format=full", messageID)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return 0, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("gmail get message: %s", strings.TrimSpace(string(body)))
	}
	var gm struct {
		ID           string   `json:"id"`
		ThreadID     string   `json:"threadId"`
		InternalDate string   `json:"internalDate"`
		Snippet      string   `json:"snippet"`
		LabelIds     []string `json:"labelIds"`
		Payload      struct {
			Headers []struct {
				Name  string `json:"name"`
				Value string `json:"value"`
			} `json:"headers"`
			Body struct {
				Data string `json:"data"`
			} `json:"body"`
			Parts []struct {
				MimeType string `json:"mimeType"`
				Body     struct {
					Data string `json:"data"`
				} `json:"body"`
			} `json:"parts"`
		} `json:"payload"`
	}
	if err := json.Unmarshal(body, &gm); err != nil {
		return 0, err
	}

	from := headerValue(gm.Payload.Headers, "From")
	to := parseHeaderAddrs(headerValue(gm.Payload.Headers, "To"))
	cc := parseHeaderAddrs(headerValue(gm.Payload.Headers, "Cc"))
	subject := headerValue(gm.Payload.Headers, "Subject")
	bodyText := extractGmailBody(gm.Payload.Body.Data, gm.Payload.Parts)

	direction := "inbound"
	for _, label := range gm.LabelIds {
		if label == "SENT" {
			direction = "outbound"
			break
		}
	}

	var internalDate time.Time
	if ms, err := strconv.ParseInt(gm.InternalDate, 10, 64); err == nil {
		internalDate = time.UnixMilli(ms).UTC()
	} else {
		internalDate = time.Now().UTC()
	}

	connID := row.ID
	ownerID := row.UserID
	params := insertMailMessageParams{
		TenantID:       row.TenantID,
		ConnectionID:   &connID,
		OwnerUserID:    &ownerID,
		GmailMessageID: gm.ID,
		GmailThreadID:  strPtr(gm.ThreadID),
		Direction:      direction,
		FromAddr:       from,
		ToAddrs:        to,
		CcAddrs:        cc,
		Subject:        subject,
		Snippet:        gm.Snippet,
		BodyText:       bodyText,
		InternalDate:   internalDate,
	}
	if err := linkMailToSentAndDoc(ctx, pool, &params); err != nil {
		return 0, err
	}
	return upsertMailMessage(ctx, pool, params)
}

func headerValue(headers []struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}, name string) string {
	for _, h := range headers {
		if strings.EqualFold(h.Name, name) {
			return strings.TrimSpace(h.Value)
		}
	}
	return ""
}

func parseHeaderAddrs(raw string) []string {
	raw = strings.ReplaceAll(raw, ";", ",")
	parts := strings.Split(raw, ",")
	var out []string
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func extractGmailBody(bodyData string, parts []struct {
	MimeType string `json:"mimeType"`
	Body     struct {
		Data string `json:"data"`
	} `json:"body"`
}) string {
	if bodyData != "" {
		if decoded, err := base64.RawURLEncoding.DecodeString(bodyData); err == nil {
			return string(decoded)
		}
	}
	for _, p := range parts {
		if strings.HasPrefix(p.MimeType, "text/plain") && p.Body.Data != "" {
			if decoded, err := base64.RawURLEncoding.DecodeString(p.Body.Data); err == nil {
				return string(decoded)
			}
		}
	}
	for _, p := range parts {
		if strings.HasPrefix(p.MimeType, "text/html") && p.Body.Data != "" {
			if decoded, err := base64.RawURLEncoding.DecodeString(p.Body.Data); err == nil {
				return string(decoded)
			}
		}
	}
	return ""
}

func linkMailToSentAndDoc(ctx context.Context, pool *pgxpool.Pool, p *insertMailMessageParams) error {
	var sentID *int64
	var docType *string
	var docID *int64
	err := pool.QueryRow(ctx, `
		select id, doc_type, doc_id
		from public.com_sent_messages
		where tenant_id = $1 and gmail_message_id = $2
		limit 1`, p.TenantID, p.GmailMessageID).
		Scan(&sentID, &docType, &docID)
	if err == nil {
		p.SentMessageID = sentID
		p.LinkedDocType = docType
		p.LinkedDocID = docID
		return nil
	}
	if err != pgx.ErrNoRows {
		return err
	}
	if p.GmailThreadID == nil {
		return nil
	}
	err = pool.QueryRow(ctx, `
		select id, doc_type, doc_id
		from public.com_sent_messages
		where tenant_id = $1 and gmail_thread_id = $2
		order by created_at desc
		limit 1`, p.TenantID, *p.GmailThreadID).
		Scan(&sentID, &docType, &docID)
	if err == nil {
		p.SentMessageID = sentID
		p.LinkedDocType = docType
		p.LinkedDocID = docID
	}
	return nil
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
