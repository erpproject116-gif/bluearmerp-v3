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
	Stream         bool              `json:"stream,omitempty"`
}

// Usage is token accounting from the provider when available.
type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// ChatResult is a non-streaming completion with optional usage.
type ChatResult struct {
	Content string
	Usage   Usage
	Model   string
}

// StreamChunk is one SSE delta from a streaming chat completion.
type StreamChunk struct {
	Delta string
	Done  bool
	Usage *Usage
}

// Client calls a chat-completions-compatible LLM API (DashScope, etc.).
type Client interface {
	ChatCompletion(ctx context.Context, req ChatRequest) (string, error)
	Enabled() bool
}

// UsageClient returns token usage when the provider supplies it.
type UsageClient interface {
	Client
	ChatCompletionWithUsage(ctx context.Context, req ChatRequest) (ChatResult, error)
}

// StreamClient streams chat completions over SSE.
type StreamClient interface {
	Client
	ChatCompletionStream(ctx context.Context, req ChatRequest, onChunk func(StreamChunk) error) (ChatResult, error)
}
