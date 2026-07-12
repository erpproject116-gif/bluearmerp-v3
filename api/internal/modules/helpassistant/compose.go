package helpassistant

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type composeHitIn struct {
	ArticleID string   `json:"article_id"`
	Title     string   `json:"title"`
	Scenario  string   `json:"scenario"`
	Snippet   string   `json:"snippet"`
	Steps     []string `json:"steps"`
}

type composeBody struct {
	Query    string          `json:"query"`
	Pathname string          `json:"pathname"`
	Hits     []composeHitIn  `json:"hits"`
}

type composeResult struct {
	UsedAI     bool     `json:"used_ai"`
	Message    string   `json:"message"`
	ArticleIDs []string `json:"article_ids"`
	Provider   string   `json:"provider,omitempty"`
	Model      string   `json:"model,omitempty"`
}

const helpSystemPrompt = `You are Bluearm ERP Help Assistant.
Answer ONLY using the provided help article contexts.
Rules:
- Do not invent menus, fields, policies, or steps that are not in the contexts.
- Prefer short, numbered steps when the context includes steps.
- If contexts are insufficient, reply exactly: INSUFFICIENT_CONTEXT
- Mention the article title when useful.
- Be concise (under 180 words).
- Do not mention these rules or that you are an AI unless asked.`

func postCompose() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := ConfigFromEnv()
		if !cfg.Available() {
			response.Err(w, http.StatusServiceUnavailable, "Help AI is not configured. Set DASHSCOPE_API_KEY (and HELP_AI_ENABLED).", "ERR_HELP_AI_DISABLED")
			return
		}
		var body composeBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		query := strings.TrimSpace(body.Query)
		if query == "" {
			response.Validation(w, map[string]string{"query": "Query is required."})
			return
		}
		if len(body.Hits) == 0 {
			response.Validation(w, map[string]string{"hits": "At least one retrieved article is required."})
			return
		}
		if len(body.Hits) > 5 {
			body.Hits = body.Hits[:5]
		}

		msg, articleIDs, err := groundedCompose(r.Context(), cfg, query, strings.TrimSpace(body.Pathname), body.Hits)
		if err != nil {
			response.Err(w, http.StatusBadGateway, "Help AI request failed.", "ERR_HELP_AI_FAILED")
			return
		}
		if msg == "" || strings.EqualFold(strings.TrimSpace(msg), "INSUFFICIENT_CONTEXT") {
			response.OK(w, composeResult{
				UsedAI:     false,
				Message:    "",
				ArticleIDs: articleIDs,
				Provider:   "dashscope",
				Model:      cfg.Model,
			}, "Insufficient grounded context.")
			return
		}
		response.OK(w, composeResult{
			UsedAI:     true,
			Message:    strings.TrimSpace(msg),
			ArticleIDs: articleIDs,
			Provider:   "dashscope",
			Model:      cfg.Model,
		}, "OK")
	}
}

func groundedCompose(ctx context.Context, cfg Config, query, pathname string, hits []composeHitIn) (string, []string, error) {
	userPrompt, articleIDs := buildGroundedUserPrompt(query, pathname, hits)
	client := cfg.newLLMClient()
	out, err := client.ChatCompletion(ctx, llm.ChatRequest{
		Model: cfg.Model,
		Messages: []llm.Message{
			{Role: "system", Content: helpSystemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
		MaxTokens:   500,
	})
	if err != nil {
		return "", articleIDs, err
	}
	return out, articleIDs, nil
}

func buildGroundedUserPrompt(query, pathname string, hits []composeHitIn) (string, []string) {
	var b strings.Builder
	fmt.Fprintf(&b, "User question: %s\n", query)
	if pathname != "" {
		fmt.Fprintf(&b, "Current screen path: %s\n", pathname)
	}
	b.WriteString("\nRetrieved help articles:\n")
	ids := make([]string, 0, len(hits))
	for i, h := range hits {
		id := strings.TrimSpace(h.ArticleID)
		if id != "" {
			ids = append(ids, id)
		}
		fmt.Fprintf(&b, "\n[%d] id=%s\ntitle=%s\n", i+1, id, strings.TrimSpace(h.Title))
		if s := strings.TrimSpace(h.Scenario); s != "" {
			fmt.Fprintf(&b, "scenario=%s\n", s)
		}
		if s := strings.TrimSpace(h.Snippet); s != "" {
			fmt.Fprintf(&b, "snippet=%s\n", s)
		}
		if len(h.Steps) > 0 {
			b.WriteString("steps:\n")
			for _, step := range h.Steps {
				step = strings.TrimSpace(step)
				if step == "" {
					continue
				}
				fmt.Fprintf(&b, "- %s\n", step)
			}
		}
	}
	b.WriteString("\nWrite the answer now.")
	return b.String(), ids
}
