package openrouter

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const DefaultBaseURL = "https://openrouter.ai/api/v1"

// Client calls the OpenRouter chat completions API.
type Client struct {
	APIKey     string
	HTTPClient *http.Client
	BaseURL    string
	Referer    string
	Title      string
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

type ContentPart struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL *struct {
		URL string `json:"url"`
	} `json:"image_url,omitempty"`
}

type Message struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

type ChatRequest struct {
	Model          string            `json:"model"`
	Messages       []Message         `json:"messages"`
	Temperature    float64           `json:"temperature,omitempty"`
	MaxTokens      int               `json:"max_tokens,omitempty"`
	ResponseFormat map[string]string `json:"response_format,omitempty"`
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
func (c Client) ChatCompletion(ctx context.Context, req ChatRequest) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("OPENROUTER_API_KEY not configured")
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

	base := strings.TrimRight(c.BaseURL, "/")
	if base == "" {
		base = DefaultBaseURL
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	if ref := strings.TrimSpace(c.Referer); ref != "" {
		httpReq.Header.Set("HTTP-Referer", ref)
	}
	if title := strings.TrimSpace(c.Title); title != "" {
		httpReq.Header.Set("X-Title", title)
	}

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
		return "", fmt.Errorf("openrouter HTTP %d: %s", res.StatusCode, msg)
	}

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return "", fmt.Errorf("openrouter response decode: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return "", fmt.Errorf("openrouter: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return "", fmt.Errorf("openrouter returned empty completion")
	}
	return parsed.Choices[0].Message.Content, nil
}
