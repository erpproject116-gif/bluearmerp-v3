// Package supabaseadmin calls Supabase Auth Admin APIs with the service role key.
package supabaseadmin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// GeneratePasswordLink returns an action URL so the user can set or reset their password.
// type "recovery" for existing auth users; "invite" when they have no auth account yet.
func GeneratePasswordLink(ctx context.Context, email, linkType, redirectTo string) (string, error) {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("SUPABASE_URL")), "/")
	key := strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY"))
	if base == "" || key == "" {
		return "", fmt.Errorf("supabase admin not configured")
	}
	email = strings.TrimSpace(strings.ToLower(email))
	if email == "" {
		return "", fmt.Errorf("email required")
	}
	linkType = strings.TrimSpace(linkType)
	if linkType == "" {
		linkType = "recovery"
	}
	body := map[string]any{
		"type":  linkType,
		"email": email,
	}
	if redirectTo != "" {
		body["options"] = map[string]any{"redirect_to": redirectTo}
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/auth/v1/admin/generate_link", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", key)
	req.Header.Set("Authorization", "Bearer "+key)

	client := &http.Client{Timeout: 20 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("supabase generate_link %d: %s", res.StatusCode, strings.TrimSpace(string(respBody)))
	}
	var parsed struct {
		ActionLink string `json:"action_link"`
		Properties struct {
			ActionLink string `json:"action_link"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	link := strings.TrimSpace(parsed.ActionLink)
	if link == "" {
		link = strings.TrimSpace(parsed.Properties.ActionLink)
	}
	if link == "" {
		return "", fmt.Errorf("supabase generate_link returned no action_link")
	}
	return link, nil
}
