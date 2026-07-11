package llm

import "context"

// ContentPart is an OpenAI-compatible multimodal message part.
type ContentPart struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL *struct {
		URL string `json:"url"`
	} `json:"image_url,omitempty"`
}

// Message is a chat completion message.
type Message struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}

// ChatRequest is an OpenAI-compatible chat completion request.
type ChatRequest struct {
	Model          string            `json:"model"`
	Messages       []Message         `json:"messages"`
	Temperature    float64           `json:"temperature,omitempty"`
	MaxTokens      int               `json:"max_tokens,omitempty"`
	ResponseFormat map[string]string `json:"response_format,omitempty"`
}

// Client calls a chat-completions-compatible LLM API (DashScope, etc.).
type Client interface {
	ChatCompletion(ctx context.Context, req ChatRequest) (string, error)
	Enabled() bool
}
