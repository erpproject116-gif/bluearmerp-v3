package dashscope

import (
	"bufio"
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
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Code    any    `json:"code"`
	} `json:"error"`
}

func (c Client) httpClient() *http.Client {
	if c.HTTPClient != nil {
		return c.HTTPClient
	}
	return &http.Client{Timeout: 120 * time.Second}
}

func (c Client) postChat(ctx context.Context, req llm.ChatRequest) (*http.Response, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("DASHSCOPE_API_KEY not configured")
	}
	if strings.TrimSpace(req.Model) == "" {
		return nil, fmt.Errorf("model is required")
	}
	if len(req.Messages) == 0 {
		return nil, fmt.Errorf("messages are required")
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	base := NormalizeBaseURL(c.BaseURL)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Authorization", "Bearer "+c.APIKey)
	httpReq.Header.Set("Content-Type", "application/json")
	if req.Stream {
		httpReq.Header.Set("Accept", "text/event-stream")
	}

	return c.httpClient().Do(httpReq)
}

func parseUsage(u *struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}) llm.Usage {
	if u == nil {
		return llm.Usage{}
	}
	total := u.TotalTokens
	if total == 0 {
		total = u.PromptTokens + u.CompletionTokens
	}
	return llm.Usage{
		PromptTokens:     u.PromptTokens,
		CompletionTokens: u.CompletionTokens,
		TotalTokens:      total,
	}
}

// ChatCompletion sends a chat request and returns the assistant message text.
func (c Client) ChatCompletion(ctx context.Context, req llm.ChatRequest) (string, error) {
	res, err := c.ChatCompletionWithUsage(ctx, req)
	if err != nil {
		return "", err
	}
	return res.Content, nil
}

// ChatCompletionWithUsage returns content and token usage when provided.
func (c Client) ChatCompletionWithUsage(ctx context.Context, req llm.ChatRequest) (llm.ChatResult, error) {
	req.Stream = false
	httpRes, err := c.postChat(ctx, req)
	if err != nil {
		return llm.ChatResult{}, err
	}
	defer httpRes.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(httpRes.Body, 8<<20))
	if err != nil {
		return llm.ChatResult{}, err
	}
	base := NormalizeBaseURL(c.BaseURL)
	if httpRes.StatusCode < 200 || httpRes.StatusCode >= 300 {
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 240 {
			msg = msg[:240] + "…"
		}
		return llm.ChatResult{}, fmt.Errorf("dashscope HTTP %d at %s/chat/completions: %s", httpRes.StatusCode, base, msg)
	}

	var parsed chatResponse
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return llm.ChatResult{}, fmt.Errorf("dashscope response decode: %w", err)
	}
	if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
		return llm.ChatResult{}, fmt.Errorf("dashscope: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return llm.ChatResult{}, fmt.Errorf("dashscope returned empty completion")
	}
	model := parsed.Model
	if model == "" {
		model = req.Model
	}
	return llm.ChatResult{
		Content: parsed.Choices[0].Message.Content,
		Usage:   parseUsage(parsed.Usage),
		Model:   model,
	}, nil
}

// ChatCompletionStream streams SSE deltas; onChunk may be nil.
func (c Client) ChatCompletionStream(ctx context.Context, req llm.ChatRequest, onChunk func(llm.StreamChunk) error) (llm.ChatResult, error) {
	req.Stream = true
	httpRes, err := c.postChat(ctx, req)
	if err != nil {
		return llm.ChatResult{}, err
	}
	defer httpRes.Body.Close()

	base := NormalizeBaseURL(c.BaseURL)
	if httpRes.StatusCode < 200 || httpRes.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(httpRes.Body, 1<<20))
		msg := strings.TrimSpace(string(raw))
		if len(msg) > 240 {
			msg = msg[:240] + "…"
		}
		return llm.ChatResult{}, fmt.Errorf("dashscope HTTP %d at %s/chat/completions: %s", httpRes.StatusCode, base, msg)
	}

	var (
		content strings.Builder
		usage   llm.Usage
		model   = req.Model
	)

	scanner := bufio.NewScanner(httpRes.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		payload := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if payload == "" {
			continue
		}
		if payload == "[DONE]" {
			chunk := llm.StreamChunk{Done: true, Usage: &usage}
			if onChunk != nil {
				if err := onChunk(chunk); err != nil {
					return llm.ChatResult{}, err
				}
			}
			break
		}
		var parsed chatResponse
		if err := json.Unmarshal([]byte(payload), &parsed); err != nil {
			continue
		}
		if parsed.Error != nil && strings.TrimSpace(parsed.Error.Message) != "" {
			return llm.ChatResult{}, fmt.Errorf("dashscope: %s", parsed.Error.Message)
		}
		if parsed.Model != "" {
			model = parsed.Model
		}
		if parsed.Usage != nil {
			usage = parseUsage(parsed.Usage)
		}
		delta := ""
		if len(parsed.Choices) > 0 {
			delta = parsed.Choices[0].Delta.Content
			if delta == "" {
				delta = parsed.Choices[0].Message.Content
			}
		}
		if delta != "" {
			content.WriteString(delta)
			if onChunk != nil {
				if err := onChunk(llm.StreamChunk{Delta: delta}); err != nil {
					return llm.ChatResult{}, err
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return llm.ChatResult{}, err
	}
	out := strings.TrimSpace(content.String())
	if out == "" {
		return llm.ChatResult{}, fmt.Errorf("dashscope returned empty stream completion")
	}
	return llm.ChatResult{Content: out, Usage: usage, Model: model}, nil
}
