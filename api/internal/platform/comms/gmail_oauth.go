package comms

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const oauthStateTTL = 15 * time.Minute

type oauthStatePayload struct {
	TenantID int64  `json:"tenant_id"`
	UserID   int64  `json:"user_id"`
	Exp      int64  `json:"exp"`
	Nonce    string `json:"nonce"`
}

func oauthConfig(cfg GmailConfig) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     cfg.ClientID,
		ClientSecret: cfg.ClientSecret,
		RedirectURL:  cfg.RedirectURI,
		Scopes:       cfg.OAuthScopes(),
		Endpoint:     google.Endpoint,
	}
}

func signOAuthState(cfg GmailConfig, tenantID, userID int64) (string, error) {
	if !cfg.OAuthConfigured() {
		return "", fmt.Errorf("Google OAuth is not configured")
	}
	payload := oauthStatePayload{
		TenantID: tenantID,
		UserID:   userID,
		Exp:      time.Now().Add(oauthStateTTL).Unix(),
		Nonce:    fmt.Sprintf("%d", time.Now().UnixNano()),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	body := base64.RawURLEncoding.EncodeToString(raw)
	mac := hmac.New(sha256.New, []byte(cfg.ClientSecret))
	mac.Write([]byte(body))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return body + "." + sig, nil
}

func verifyOAuthState(cfg GmailConfig, state string) (oauthStatePayload, error) {
	parts := strings.Split(state, ".")
	if len(parts) != 2 {
		return oauthStatePayload{}, fmt.Errorf("invalid OAuth state")
	}
	mac := hmac.New(sha256.New, []byte(cfg.ClientSecret))
	mac.Write([]byte(parts[0]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[1])) {
		return oauthStatePayload{}, fmt.Errorf("invalid OAuth state signature")
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return oauthStatePayload{}, fmt.Errorf("invalid OAuth state payload")
	}
	var payload oauthStatePayload
	if err := json.Unmarshal(raw, &payload); err != nil {
		return oauthStatePayload{}, err
	}
	if time.Now().Unix() > payload.Exp {
		return oauthStatePayload{}, fmt.Errorf("OAuth state expired")
	}
	return payload, nil
}

func buildGmailAuthURL(cfg GmailConfig, tenantID, userID int64) (string, error) {
	state, err := signOAuthState(cfg, tenantID, userID)
	if err != nil {
		return "", err
	}
	return oauthConfig(cfg).AuthCodeURL(state, oauth2.AccessTypeOffline, oauth2.ApprovalForce), nil
}

func exchangeGmailCode(ctx context.Context, cfg GmailConfig, code string) (*oauth2.Token, string, error) {
	tok, err := oauthConfig(cfg).Exchange(ctx, code)
	if err != nil {
		return nil, "", err
	}
	email, err := fetchGoogleEmail(ctx, tok.AccessToken)
	if err != nil {
		return tok, "", err
	}
	return tok, email, nil
}

func fetchGoogleEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("userinfo: %s", strings.TrimSpace(string(body)))
	}
	var info struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return "", err
	}
	email := strings.TrimSpace(info.Email)
	if email == "" {
		return "", fmt.Errorf("Google account email not available")
	}
	return email, nil
}

func refreshAccessToken(ctx context.Context, cfg GmailConfig, refreshToken string) (*oauth2.Token, error) {
	src := oauthConfig(cfg).TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	return src.Token()
}

func ensureAccessToken(ctx context.Context, pool *pgxpool.Pool, cfg GmailConfig, row gmailConnectionRow) (string, error) {
	if row.AccessToken != nil && row.TokenExpiresAt != nil && time.Now().Add(2*time.Minute).Before(*row.TokenExpiresAt) {
		return *row.AccessToken, nil
	}
	if strings.TrimSpace(row.RefreshToken) == "" {
		return "", fmt.Errorf("Gmail refresh token missing")
	}
	tok, err := refreshAccessToken(ctx, cfg, row.RefreshToken)
	if err != nil {
		return "", err
	}
	var exp *time.Time
	if !tok.Expiry.IsZero() {
		t := tok.Expiry.UTC()
		exp = &t
	}
	_ = updateConnectionTokens(ctx, pool, row.ID, tok.AccessToken, exp)
	return tok.AccessToken, nil
}
