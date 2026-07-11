package dashscope

import (
	"context"
	"testing"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

func TestNormalizeBaseURL_apiV1ToCompatible(t *testing.T) {
	got := NormalizeBaseURL("https://ws-ad7upimxrblamew2.ap-southeast-1.maas.aliyuncs.com/api/v1")
	want := "https://ws-ad7upimxrblamew2.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestNormalizeBaseURL_emptyUsesDefault(t *testing.T) {
	if NormalizeBaseURL("") != DefaultBaseURL {
		t.Fatal("expected default base URL")
	}
}

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
