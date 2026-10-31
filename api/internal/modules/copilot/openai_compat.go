package copilot

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// registerOpenAICompatRoutes exposes a narrow OpenAI-compatible surface for Open WebUI
// (and similar) to call Baiko Ask. Writes never auto-post; action drafts are returned as text.
func registerOpenAICompatRoutes(cr chi.Router, pool *pgxpool.Pool) {
	cr.Get("/openai/v1/models", openaiListModels())
	cr.Post("/openai/v1/chat/completions", openaiChatCompletions(pool))
}

func openaiListModels() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeOpenAIJSON(w, http.StatusOK, map[string]any{
			"object": "list",
			"data": []map[string]any{
				{"id": "baiko", "object": "model", "owned_by": "bluearm"},
			},
		})
	}
}

type openaiChatReq struct {
	Model    string `json:"model"`
	Stream   bool   `json:"stream"`
	Messages []struct {
		Role    string `json:"role"`
		Content any    `json:"content"`
	} `json:"messages"`
}

func openaiChatCompletions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			writeOpenAIJSON(w, http.StatusUnauthorized, map[string]any{"error": map[string]any{"message": "unauthorized"}})
			return
		}
		var body openaiChatReq
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeOpenAIJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]any{"message": "invalid json"}})
			return
		}
		query := lastUserMessage(body.Messages)
		if query == "" {
			writeOpenAIJSON(w, http.StatusBadRequest, map[string]any{"error": map[string]any{"message": "messages required"}})
			return
		}
		if body.Stream {
			writeOpenAIJSON(w, http.StatusBadRequest, map[string]any{
				"error": map[string]any{"message": "stream=true not supported; set stream:false for Baiko"},
			})
			return
		}
		res, err := RunAsk(r.Context(), pool, tu, query, "/app/baiko", nil)
		if err != nil {
			status := http.StatusInternalServerError
			msg := err.Error()
			if errors.Is(err, ErrCopilotDisabled) {
				status = http.StatusServiceUnavailable
			} else if errors.Is(err, ErrCopilotRate) || errors.Is(err, ErrCopilotCap) {
				status = http.StatusTooManyRequests
			}
			writeOpenAIJSON(w, status, map[string]any{"error": map[string]any{"message": msg}})
			return
		}
		content := res.Message
		if res.ActionDraft != nil {
			content += "\n\n[Approve required in Bluearm Baiko — no silent write]\n" + res.ActionDraft.Summary
		}
		writeOpenAIJSON(w, http.StatusOK, map[string]any{
			"id":     "baiko-ask",
			"object": "chat.completion",
			"model":  "baiko",
			"choices": []map[string]any{
				{"index": 0, "finish_reason": "stop", "message": map[string]any{"role": "assistant", "content": content}},
			},
			"usage":   map[string]any{"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
			"bluearm": map[string]any{"mode": res.Mode, "used_ai": res.UsedAI, "deep_links": res.DeepLinks},
		})
	}
}

func lastUserMessage(msgs []struct {
	Role    string `json:"role"`
	Content any    `json:"content"`
}) string {
	for i := len(msgs) - 1; i >= 0; i-- {
		if !strings.EqualFold(msgs[i].Role, "user") {
			continue
		}
		switch v := msgs[i].Content.(type) {
		case string:
			return strings.TrimSpace(v)
		case []any:
			var b strings.Builder
			for _, part := range v {
				m, _ := part.(map[string]any)
				if m == nil {
					continue
				}
				if t, _ := m["type"].(string); t == "text" {
					if s, _ := m["text"].(string); s != "" {
						b.WriteString(s)
					}
				}
			}
			return strings.TrimSpace(b.String())
		}
	}
	return ""
}

func writeOpenAIJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
