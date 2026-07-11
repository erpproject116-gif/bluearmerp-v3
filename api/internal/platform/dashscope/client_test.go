package dashscope

import (
	"context"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

func TestClient_Enabled(t *testing.T) {
	if NewClient("").Enabled() {
		t.Fatal("expected disabled without API key")
	}
	if !NewClient("sk-test").Enabled() {
		t.Fatal("expected enabled with API key")
	}
}

func TestClient_ChatCompletion_requiresKey(t *testing.T) {
	_, err := NewClient("").ChatCompletion(context.Background(), llm.ChatRequest{
		Model:    "qwen-vl-plus",
		Messages: []llm.Message{{Role: "user", Content: "hi"}},
	})
	if err == nil {
		t.Fatal("expected error without API key")
	}
}

func TestClient_ChatCompletion_requiresModel(t *testing.T) {
	_, err := NewClient("sk-test").ChatCompletion(context.Background(), llm.ChatRequest{
		Messages: []llm.Message{{Role: "user", Content: "hi"}},
	})
	if err == nil {
		t.Fatal("expected error without model")
	}
}
