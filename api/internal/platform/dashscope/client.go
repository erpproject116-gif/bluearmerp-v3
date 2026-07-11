package dashscope

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

// DefaultBaseURL is the legacy international DashScope endpoint.
// Singapore workspace keys should set DASHSCOPE_BASE_URL to your Model Studio workspace URL:
// https://{workspace-id}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1
const DefaultBaseURL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"

// NormalizeBaseURL fixes common Model Studio console URLs (e.g. .../api/v1 → .../compatible-mode/v1).
func NormalizeBaseURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return DefaultBaseURL
	}
	raw = strings.TrimRight(raw, "/")
	if strings.HasSuffix(raw, "/api/v1") {
		raw = strings.TrimSuffix(raw, "/api/v1") + "/compatible-mode/v1"
	}
	return raw
}

// Client calls Alibaba Cloud DashScope (Qwen) chat completions API.
type Client struct {
	APIKey     string
	HTTPClient *http.Client
	BaseURL    string
}

func NewClient(apiKey string) Client {
	return Client{
		APIKey: strings.TrimSpace(apiKey),
		HTTPClient: &http.Client{
			Timeout: 120 * time.Second,
		},
		BaseURL: DefaultBaseURL,
	}
}

func (c Client) Enabled() bool {
	return c.APIKey != ""
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error"`
}

// ChatCompletion sends a chat request and returns the assistant message text.
func (c Client) ChatCompletion(ctx context.Context, req llm.ChatRequest) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("DASHSCOPE_API_KEY not configured")
	}
	if strings.TrimSpace(req.Model) == "" {
		return "", fmt.Errorf("model is required")
	}
	if len(req.Messages) == 0 {
		return "", fmt.Errorf("messages are required")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return "", err
	}

	base := NormalizeBaseURL(c.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := c.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 120 * time.Second}
	}
	res, err := client.Do(httpReq)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if err != nil {
		return "", err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 240 {
			msg = msg[:240] + "…"
		}
		return "", fmt.Errorf("dashscope HTTP %d at %s/chat/completions: %s", res.StatusCode, base, msg)
	}

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("dashscope response decode: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return "", fmt.Errorf("dashscope: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("dashscope returned empty completion")
	}
	return parsed.Choices[0].Message.Content, nil
}
