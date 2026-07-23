package copilot

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type askBody struct {
	Query     string `json:"query"`
	Pathname  string `json:"pathname"`
	SessionID *int64 `json:"session_id"`
	Locale    string `json:"locale"`
}

type askResult struct {
	Mode        string          `json:"mode"` // docs | ops | action
	Message     string          `json:"message"`
	UsedAI      bool            `json:"used_ai"`
	ArticleIDs  []string        `json:"article_ids,omitempty"`
	Hits        []map[string]any `json:"hits,omitempty"`
	Tools       []toolResult    `json:"tools,omitempty"`
	ActionDraft *actionDraft    `json:"action_draft,omitempty"`
	DeepLinks   []deepLink      `json:"deep_links,omitempty"`
	Model       string          `json:"model,omitempty"`
	SessionID   *int64          `json:"session_id,omitempty"`
}

func classifyIntent(query string) string {
	q := strings.ToLower(query)
	actionHints := []string{"create recurring", "add recurring", "draft expense", "import rfq", "upload rfq", "rfq pdf"}
	for _, h := range actionHints {
		if strings.Contains(q, h) {
			return "action"
		}
	}
	opsHints := []string{
		"overdue", "cash", "receivable", "payable", "financial health", "how much",
		"stock", "inventory", "on hand", "find stock", "follow up", "follow-up", "pipeline",
		"what is due", "what's due", "ar aging", "cash flow",
	}
	for _, h := range opsHints {
		if strings.Contains(q, h) {
			return "ops"
		}
	}
	return "docs"
}

func toolsForQuery(query string) []struct {
	Name string
	Args map[string]any
} {
	q := strings.ToLower(query)
	var out []struct {
		Name string
		Args map[string]any
	}
	add := func(name string, args map[string]any) {
		out = append(out, struct {
			Name string
			Args map[string]any
		}{Name: name, Args: args})
	}
	if strings.Contains(q, "stock") || strings.Contains(q, "inventory") || strings.Contains(q, "on hand") {
		// crude item extract: last word-ish after "stock of" / "find"
		args := map[string]any{"q": extractStockQuery(query)}
		add("find_stock", args)
	}
	if strings.Contains(q, "overdue") || strings.Contains(q, "receivable") || strings.Contains(q, "ar aging") {
		add("list_overdue_ar", nil)
	}
	if strings.Contains(q, "cash") || strings.Contains(q, "financial") || strings.Contains(q, "payable") || strings.Contains(q, "pipeline") {
		add("get_financial_health", nil)
	}
	if strings.Contains(q, "follow") || strings.Contains(q, "crm") {
		add("crm_follow_ups", nil)
	}
	if len(out) == 0 {
		add("get_financial_health", nil)
	}
	return out
}

func extractStockQuery(query string) string {
	lower := strings.ToLower(query)
	for _, prefix := range []string{"find stock ", "stock of ", "inventory of ", "stock for ", "find "} {
		if i := strings.Index(lower, prefix); i >= 0 {
			return strings.TrimSpace(query[i+len(prefix):])
		}
	}
	return ""
}

func postAsk(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cfg := helpassistant.ConfigFromEnv()
		if !cfg.CopilotAvailable() {
			response.Err(w, http.StatusServiceUnavailable, "Copilot is not enabled.", "ERR_COPILOT_DISABLED")
			return
		}
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body askBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		query := strings.TrimSpace(body.Query)
		if query == "" {
			response.Validation(w, map[string]string{"query": "Query is required."})
			return
		}
		if err := helpassistant.CheckDailyCap(r.Context(), pool, tu.TenantID, cfg.DailyCap); err != nil {
			if errors.Is(err, helpassistant.ErrDailyTokenCap) {
				response.Err(w, http.StatusTooManyRequests, "Daily AI token cap reached.", "ERR_COPILOT_CAP")
				return
			}
		}

		mode := classifyIntent(query)
		pathname := strings.TrimSpace(body.Pathname)

		switch mode {
		case "docs":
			result := askDocs(r.Context(), pool, tu, cfg, query, pathname, body)
			response.OK(w, result, "OK")
		case "action":
			result := askAction(r.Context(), pool, tu, cfg, query, pathname, body)
			response.OK(w, result, "OK")
		default:
			result := askOps(r.Context(), pool, tu, cfg, query, pathname, body)
			response.OK(w, result, "OK")
		}
	}
}

func askDocs(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, cfg helpassistant.Config, query, pathname string, body askBody) askResult {
	overrides := helpassistant.LoadRankingOverrides(ctx, pool, tu.TenantID)
	hits := helpassistant.SearchHelpPublic(query, pathname, 3, overrides)
	articleIDs := make([]string, 0, len(hits))
	hitMaps := make([]map[string]any, 0, len(hits))
	composeHits := make([]helpassistant.ComposeHit, 0, len(hits))
	for _, h := range hits {
		articleIDs = append(articleIDs, h.Chunk.ArticleID)
		hitMaps = append(hitMaps, map[string]any{
			"article_id": h.Chunk.ArticleID,
			"title":      h.Chunk.Title,
			"snippet":    h.Snippet,
			"score":      h.Score,
			"href":       h.Chunk.Href,
		})
		composeHits = append(composeHits, helpassistant.ComposeHit{
			ArticleID: h.Chunk.ArticleID,
			Title:     h.Chunk.Title,
			Scenario:  h.Chunk.Scenario,
			Snippet:   h.Snippet,
			Steps:     h.Chunk.Steps,
		})
	}
	if len(composeHits) == 0 {
		return askResult{
			Mode:    "docs",
			Message: "I could not find a matching Bluearm guide for that. Try different words, or open Documentation from the menu.",
			UsedAI:  false,
		}
	}
	msg, ids, usage, model, err := helpassistant.GroundedCompose(ctx, cfg, query, pathname, composeHits, &helpassistant.ComposePersonalization{
		Pathname: pathname,
		RoleCode: tu.TenantRole,
		BranchID: tu.ActiveBranchID,
		Locale:   body.Locale,
	})
	if err != nil || msg == "" || strings.EqualFold(strings.TrimSpace(msg), "INSUFFICIENT_CONTEXT") {
		var b strings.Builder
		b.WriteString("Here are the closest guides:\n")
		for _, h := range hits {
			fmt.Fprintf(&b, "- %s\n", h.Chunk.Title)
		}
		return askResult{Mode: "docs", Message: b.String(), ArticleIDs: articleIDs, Hits: hitMaps, UsedAI: false}
	}
	helpassistant.RecordUsage(ctx, pool, tu.TenantID, usage)
	sid := helpassistant.PersistSession(ctx, pool, tu, body.SessionID, pathname, query, msg, ids, model, usage)
	return askResult{
		Mode:       "docs",
		Message:    strings.TrimSpace(msg),
		UsedAI:     true,
		ArticleIDs: ids,
		Hits:       hitMaps,
		Model:      model,
		SessionID:  sid,
	}
}

func askOps(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, cfg helpassistant.Config, query, pathname string, body askBody) askResult {
	specs := toolsForQuery(query)
	var tools []toolResult
	var links []deepLink
	var draft *actionDraft
	for _, s := range specs {
		tr := runTool(ctx, pool, tu, s.Name, s.Args)
		tools = append(tools, tr)
		links = append(links, tr.DeepLinks...)
		if tr.ActionDraft != nil {
			draft = tr.ActionDraft
		}
	}
	msg, usage, model, used := summarizeTools(ctx, cfg, query, tools)
	helpassistant.RecordUsage(ctx, pool, tu.TenantID, usage)
	sid := helpassistant.PersistSession(ctx, pool, tu, body.SessionID, pathname, query, msg, nil, model, usage)
	return askResult{
		Mode:        "ops",
		Message:     msg,
		UsedAI:      used,
		Tools:       tools,
		DeepLinks:   links,
		ActionDraft: draft,
		Model:       model,
		SessionID:   sid,
	}
}

func askAction(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, cfg helpassistant.Config, query, pathname string, body askBody) askResult {
	q := strings.ToLower(query)
	var tr toolResult
	if strings.Contains(q, "rfq") {
		tr = runTool(ctx, pool, tu, "import_rfq_pdf", map[string]any{"note": query})
	} else {
		tr = runTool(ctx, pool, tu, "draft_recurring_expense", map[string]any{
			"name":   "Suggested recurring expense",
			"amount": 0,
		})
	}
	msg := "I prepared an action draft. Review it and Approve to post — nothing is saved until you confirm."
	if tr.ActionDraft != nil {
		msg = tr.ActionDraft.Summary + "\n\nNothing is saved until you Approve."
	}
	sid := helpassistant.PersistSession(ctx, pool, tu, body.SessionID, pathname, query, msg, nil, "", llm.Usage{})
	return askResult{
		Mode:        "action",
		Message:     msg,
		UsedAI:      false,
		Tools:       []toolResult{tr},
		ActionDraft: tr.ActionDraft,
		DeepLinks:   tr.DeepLinks,
		SessionID:   sid,
	}
}

const opsSystemPrompt = `You are Bluearm Copilot summarizing live ERP tool JSON for an executive.
Rules:
- Use ONLY the tool JSON provided. Do not invent numbers.
- Be concise (under 120 words). Prefer bullets.
- If a tool was denied, say permission is required.
- Mention deep-link labels when useful.
- Do not claim you posted or changed anything.`

func summarizeTools(ctx context.Context, cfg helpassistant.Config, query string, tools []toolResult) (string, llm.Usage, string, bool) {
	raw, _ := json.Marshal(tools)
	user := fmt.Sprintf("User question: %s\n\nTool results JSON:\n%s\n\nWrite a short answer.", query, string(raw))
	client := cfg.NewDashScopeClient()
	model := cfg.MediumModel
	out, err := client.ChatCompletionWithUsage(ctx, llm.ChatRequest{
		Model: model,
		Messages: []llm.Message{
			{Role: "system", Content: opsSystemPrompt},
			{Role: "user", Content: user},
		},
		Temperature: 0.2,
		MaxTokens:   400,
	})
	if err != nil {
		// Deterministic fallback
		var b strings.Builder
		b.WriteString("Live data summary:\n")
		for _, t := range tools {
			if t.Denied {
				fmt.Fprintf(&b, "- %s: permission denied\n", t.Name)
				continue
			}
			if !t.OK {
				fmt.Fprintf(&b, "- %s: %s\n", t.Name, t.Error)
				continue
			}
			fmt.Fprintf(&b, "- %s: ok (see links)\n", t.Name)
		}
		return b.String(), llm.Usage{}, "", false
	}
	usage := helpassistant.UsageOrEstimate(out.Usage, opsSystemPrompt+"\n"+user, out.Content)
	return strings.TrimSpace(out.Content), usage, model, true
}

func postRunTool(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body struct {
			Name string         `json:"name"`
			Args map[string]any `json:"args"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tr := runTool(r.Context(), pool, tu, body.Name, body.Args)
		response.OK(w, tr, "OK")
	}
}
