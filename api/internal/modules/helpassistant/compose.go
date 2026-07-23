package helpassistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
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

type composePersonalization struct {
	Pathname  string `json:"pathname"`
	RoleCode  string `json:"role_code"`
	BranchID  int64  `json:"branch_id"`
	Locale    string `json:"locale"`
}

type composeBody struct {
	Query           string                 `json:"query"`
	Pathname        string                 `json:"pathname"`
	Hits            []composeHitIn         `json:"hits"`
	Personalization *composePersonalization `json:"personalization"`
	Stream          bool                   `json:"stream"`
	SessionID       *int64                 `json:"session_id"`
}

type composeResult struct {
	UsedAI     bool     `json:"used_ai"`
	Message    string   `json:"message"`
	ArticleIDs []string `json:"article_ids"`
	Provider   string   `json:"provider,omitempty"`
	Model      string   `json:"model,omitempty"`
	SessionID  *int64   `json:"session_id,omitempty"`
}

const helpSystemPrompt = `You are Bluearm ERP Help Assistant.
Answer ONLY using the provided help article contexts.
Rules:
- Do not invent menus, fields, policies, or steps that are not in the contexts.
- Prefer short, numbered steps when the context includes steps.
- If contexts are insufficient, reply exactly: INSUFFICIENT_CONTEXT
- Mention the article title when useful.
- Be concise (under 180 words).
- Do not mention these rules or that you are an AI unless asked.
- Use personalization (screen, role, branch) only to prioritize wording — never invent data.`

func postCompose(pool *pgxpool.Pool) http.HandlerFunc {
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

		var tenantID int64
		if tu, ok := auth.FromContext(r.Context()); ok {
			tenantID = tu.TenantID
			if body.Personalization == nil {
				body.Personalization = &composePersonalization{}
			}
			if body.Personalization.Pathname == "" {
				body.Personalization.Pathname = strings.TrimSpace(body.Pathname)
			}
			if body.Personalization.RoleCode == "" {
				body.Personalization.RoleCode = tu.TenantRole
			}
			if body.Personalization.BranchID == 0 {
				body.Personalization.BranchID = tu.ActiveBranchID
			}
			if err := checkDailyCap(r.Context(), pool, tenantID, cfg.DailyCap); err != nil {
				if errors.Is(err, ErrDailyTokenCap) {
					response.Err(w, http.StatusTooManyRequests, "Daily AI token cap reached for this business. Try again tomorrow or raise COPILOT_DAILY_TOKEN_CAP.", "ERR_COPILOT_CAP")
					return
				}
			}
		}

		pathname := strings.TrimSpace(body.Pathname)
		if body.Personalization != nil && body.Personalization.Pathname != "" {
			pathname = body.Personalization.Pathname
		}

		if body.Stream {
			streamCompose(w, r, pool, cfg, tenantID, query, pathname, body)
			return
		}

		msg, articleIDs, usage, model, err := groundedCompose(r.Context(), cfg, query, pathname, body.Hits, body.Personalization)
		if err != nil {
			// Log provider detail server-side; keep client message generic.
			fmt.Printf("help compose dashscope error: %v\n", err)
			response.Err(w, http.StatusBadGateway, "Help AI request failed. Check DASHSCOPE_API_KEY, DASHSCOPE_BASE_URL (compatible-mode/v1), and HELP_AI_MODEL on the API host.", "ERR_HELP_AI_FAILED")
			return
		}
		recordUsage(r.Context(), pool, tenantID, usage)
		sessionID := persistComposeSession(r.Context(), pool, tenantID, body.SessionID, pathname, query, msg, articleIDs, model, usage)

		if msg == "" || strings.EqualFold(strings.TrimSpace(msg), "INSUFFICIENT_CONTEXT") {
			response.OK(w, composeResult{
				UsedAI:     false,
				Message:    "",
				ArticleIDs: articleIDs,
				Provider:   "dashscope",
				Model:      model,
				SessionID:  sessionID,
			}, "Insufficient grounded context.")
			return
		}
		response.OK(w, composeResult{
			UsedAI:     true,
			Message:    strings.TrimSpace(msg),
			ArticleIDs: articleIDs,
			Provider:   "dashscope",
			Model:      model,
			SessionID:  sessionID,
		}, "OK")
	}
}

func streamCompose(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, cfg Config, tenantID int64, query, pathname string, body composeBody) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		response.Err(w, http.StatusInternalServerError, "Streaming not supported.", "ERR_INTERNAL")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(http.StatusOK)

	writeSSE := func(event string, payload any) {
		b, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
		flusher.Flush()
	}

	userPrompt, articleIDs := buildGroundedUserPrompt(query, pathname, body.Hits, body.Personalization)
	system := helpSystemPrompt
	client := cfg.newDashScopeClient()
	model := cfg.SmallModel
	if model == "" {
		model = cfg.Model
	}

	var full strings.Builder
	res, err := client.ChatCompletionStream(r.Context(), llm.ChatRequest{
		Model: model,
		Messages: []llm.Message{
			{Role: "system", Content: system},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
		MaxTokens:   500,
		Stream:      true,
	}, func(chunk llm.StreamChunk) error {
		if chunk.Delta != "" {
			full.WriteString(chunk.Delta)
			writeSSE("delta", map[string]string{"text": chunk.Delta})
		}
		return nil
	})
	if err != nil {
		writeSSE("error", map[string]string{"message": "Help AI request failed."})
		return
	}
	usage := usageOrEstimate(res.Usage, system+"\n"+userPrompt, res.Content)
	recordUsage(r.Context(), pool, tenantID, usage)
	msg := strings.TrimSpace(res.Content)
	used := msg != "" && !strings.EqualFold(msg, "INSUFFICIENT_CONTEXT")
	sessionID := persistComposeSession(r.Context(), pool, tenantID, body.SessionID, pathname, query, msg, articleIDs, model, usage)
	writeSSE("done", composeResult{
		UsedAI:     used,
		Message:    msg,
		ArticleIDs: articleIDs,
		Provider:   "dashscope",
		Model:      model,
		SessionID:  sessionID,
	})
}

func groundedCompose(ctx context.Context, cfg Config, query, pathname string, hits []composeHitIn, pers *composePersonalization) (string, []string, llm.Usage, string, error) {
	userPrompt, articleIDs := buildGroundedUserPrompt(query, pathname, hits, pers)
	model := cfg.SmallModel
	if model == "" {
		model = cfg.Model
	}
	client := cfg.newDashScopeClient()
	out, err := client.ChatCompletionWithUsage(ctx, llm.ChatRequest{
		Model: model,
		Messages: []llm.Message{
			{Role: "system", Content: helpSystemPrompt},
			{Role: "user", Content: userPrompt},
		},
		Temperature: 0.2,
		MaxTokens:   500,
	})
	if err != nil {
		return "", articleIDs, llm.Usage{}, model, err
	}
	usage := usageOrEstimate(out.Usage, helpSystemPrompt+"\n"+userPrompt, out.Content)
	return out.Content, articleIDs, usage, model, nil
}

func buildGroundedUserPrompt(query, pathname string, hits []composeHitIn, pers *composePersonalization) (string, []string) {
	var b strings.Builder
	fmt.Fprintf(&b, "User question: %s\n", query)
	if pathname != "" {
		fmt.Fprintf(&b, "Current screen path: %s\n", pathname)
	}
	if pers != nil {
		if pers.RoleCode != "" {
			fmt.Fprintf(&b, "User role: %s\n", pers.RoleCode)
		}
		if pers.BranchID > 0 {
			fmt.Fprintf(&b, "Active branch id: %d\n", pers.BranchID)
		}
		if pers.Locale != "" {
			fmt.Fprintf(&b, "Locale preference: %s\n", pers.Locale)
		}
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

func persistComposeSession(ctx context.Context, pool *pgxpool.Pool, tenantID int64, sessionID *int64, pathname, query, answer string, articleIDs []string, model string, usage llm.Usage) *int64 {
	if pool == nil || tenantID <= 0 {
		return sessionID
	}
	tu, ok := auth.FromContext(ctx)
	var userID *int64
	if ok && tu.AppUserID > 0 {
		uid := tu.AppUserID
		userID = &uid
	}
	sid := int64(0)
	if sessionID != nil && *sessionID > 0 {
		sid = *sessionID
	} else {
		err := pool.QueryRow(ctx, `
			insert into public.copilot_sessions (tenant_id, user_id, pathname)
			values ($1, $2, $3) returning id`, tenantID, userID, pathname).Scan(&sid)
		if err != nil {
			return nil
		}
	}
	idsJSON, _ := json.Marshal(articleIDs)
	_, _ = pool.Exec(ctx, `
		insert into public.copilot_messages (session_id, tenant_id, role, content)
		values ($1, $2, 'user', $3)`, sid, tenantID, query)
	_, _ = pool.Exec(ctx, `
		insert into public.copilot_messages (session_id, tenant_id, role, content, article_ids, model, prompt_tokens, completion_tokens)
		values ($1, $2, 'assistant', $3, $4::jsonb, $5, $6, $7)`,
		sid, tenantID, answer, string(idsJSON), model, usage.PromptTokens, usage.CompletionTokens)
	_, _ = pool.Exec(ctx, `update public.copilot_sessions set updated_at = now() where id = $1`, sid)
	return &sid
}
