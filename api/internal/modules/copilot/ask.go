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
	Query       string                            `json:"query"`
	Pathname    string                            `json:"pathname"`
	SessionID   *int64                            `json:"session_id"`
	Locale      string                            `json:"locale"`
	Attachments []helpassistant.ComposeAttachment `json:"attachments"`
	Entities    []EntityRef                       `json:"entities"`
}

type askResult struct {
	Mode        string           `json:"mode"` // docs | ops | action
	Message     string           `json:"message"`
	UsedAI      bool             `json:"used_ai"`
	ArticleIDs  []string         `json:"article_ids,omitempty"`
	Hits        []map[string]any `json:"hits,omitempty"`
	Tools       []toolResult     `json:"tools,omitempty"`
	ActionDraft *actionDraft     `json:"action_draft,omitempty"`
	DeepLinks   []deepLink       `json:"deep_links,omitempty"`
	Entities    []EntityRef      `json:"entities,omitempty"`
	Model       string           `json:"model,omitempty"`
	SessionID   *int64           `json:"session_id,omitempty"`
}

func classifyIntent(query string) string {
	q := strings.ToLower(query)
	actionHints := []string{
		"create recurring", "add recurring", "draft expense", "import rfq", "upload rfq", "rfq pdf",
		"generate quotation", "create quotation", "new quotation", "send email", "email quotation",
		"send quotation", "create follow-up", "create follow up", "schedule follow-up", "schedule follow up",
	}
	for _, h := range actionHints {
		if strings.Contains(q, h) {
			return "action"
		}
	}
	opsHints := []string{
		"overdue", "cash", "receivable", "payable", "financial health", "how much", "how many",
		"stock", "inventory", "on hand", "find stock", "follow up", "follow-up", "pipeline",
		"what is due", "what's due", "ar aging", "cash flow",
		"look up", "lookup", "find customer", "find vendor", "find item", "serial",
		"invoice", "load slip", "transaction",
		"expense", "expenses", "revenue", "profit", "margin", "burn", "cost", "costs",
		"sales this", "ytd", "mtd", "as of today", "as of now",
		"projection", "forecast", "predict", "estimate", "run rate", "run-rate",
		"project my", "project how", "project revenue", "project the",
		"balance", "aging", "kpi", "dashboard",
	}
	for _, h := range opsHints {
		if strings.Contains(q, h) {
			return "ops"
		}
	}
	if strings.Contains(q, "@[") || strings.HasPrefix(strings.TrimSpace(query), "@") {
		return "ops"
	}
	return "docs"
}

func toolsForQuery(query string, entities []EntityRef) []struct {
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
	if len(entities) > 0 || strings.Contains(query, "@[") ||
		strings.Contains(q, "look up") || strings.Contains(q, "lookup") ||
		strings.Contains(q, "find customer") || strings.Contains(q, "find vendor") ||
		strings.Contains(q, "find item") || strings.Contains(q, "serial") ||
		strings.Contains(q, "load slip") || strings.Contains(q, "invoice") {
		add("lookup_entities", map[string]any{"q": query, "entities": entities})
	}
	if strings.Contains(q, "stock") || strings.Contains(q, "inventory") || strings.Contains(q, "on hand") {
		stockQ := extractStockQuery(query)
		for _, e := range entities {
			if e.Type == "item" && (e.Code != "" || e.Label != "") {
				if stockQ == "" {
					stockQ = e.Code
					if stockQ == "" {
						stockQ = e.Label
					}
				}
			}
		}
		add("find_stock", map[string]any{"q": stockQ})
	}
	if strings.Contains(q, "overdue") || strings.Contains(q, "receivable") || strings.Contains(q, "ar aging") {
		add("list_overdue_ar", nil)
	}
	wantsFinance := strings.Contains(q, "cash") || strings.Contains(q, "financial") ||
		strings.Contains(q, "payable") || strings.Contains(q, "pipeline") ||
		strings.Contains(q, "expense") || strings.Contains(q, "revenue") ||
		strings.Contains(q, "profit") || strings.Contains(q, "margin") ||
		strings.Contains(q, "burn") || strings.Contains(q, "how much") ||
		strings.Contains(q, "forecast") || strings.Contains(q, "projection") ||
		strings.Contains(q, "predict") || strings.Contains(q, "estimate") ||
		strings.Contains(q, "ytd") || strings.Contains(q, "mtd") ||
		strings.Contains(q, "as of today") || strings.Contains(q, "run rate") ||
		strings.Contains(q, "run-rate") || strings.Contains(q, "cost") ||
		(strings.Contains(q, "project") && (strings.Contains(q, "revenue") || strings.Contains(q, "sales") || strings.Contains(q, "year") || strings.Contains(q, "cash") || strings.Contains(q, "income")))
	if wantsFinance {
		add("get_financial_health", nil)
	}
	if strings.Contains(q, "follow") || strings.Contains(q, "crm") {
		add("crm_follow_ups", nil)
	}
	if len(out) == 0 {
		if len(entities) > 0 {
			add("lookup_entities", map[string]any{"q": query, "entities": entities})
		} else {
			add("get_financial_health", nil)
		}
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
		entities := mergeEntities(body.Entities, parseMentionTokens(query))

		switch mode {
		case "docs":
			result := askDocs(r.Context(), pool, tu, cfg, query, pathname, body)
			if docsInsufficient(result) {
				ops := askOps(r.Context(), pool, tu, cfg, query, pathname, body, entities)
				response.OK(w, mergeDocsEscalation(result, ops), "OK")
				return
			}
			response.OK(w, result, "OK")
		case "action":
			result := askAction(r.Context(), pool, tu, cfg, query, pathname, body, entities)
			response.OK(w, result, "OK")
		default:
			result := askOps(r.Context(), pool, tu, cfg, query, pathname, body, entities)
			response.OK(w, result, "OK")
		}
	}
}

// docsInsufficient is true when guides/KB cannot ground a useful answer — escalate to live tools.
func docsInsufficient(r askResult) bool {
	if r.Mode != "docs" {
		return false
	}
	msg := strings.TrimSpace(r.Message)
	// Keep a successful grounded compose even if retrieve score was modest.
	if r.UsedAI && msg != "" && !strings.EqualFold(msg, "INSUFFICIENT_CONTEXT") {
		return false
	}
	if len(r.Hits) == 0 {
		return true
	}
	if msg == "" || strings.EqualFold(msg, "INSUFFICIENT_CONTEXT") {
		return true
	}
	if strings.HasPrefix(msg, "I could not find a matching Bluearm guide") {
		return true
	}
	if strings.HasPrefix(msg, "Here are the closest guides:") {
		return true
	}
	if topHitScore(r.Hits) > 0 && topHitScore(r.Hits) < 1.8 {
		return true
	}
	return !r.UsedAI
}

func topHitScore(hits []map[string]any) float64 {
	if len(hits) == 0 {
		return 0
	}
	switch v := hits[0]["score"].(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	default:
		return 0
	}
}

func mergeDocsEscalation(docs, ops askResult) askResult {
	ops.Hits = docs.Hits
	ops.ArticleIDs = docs.ArticleIDs
	prefix := "Guides/KB weren’t enough for a solid answer, so I checked live ERP data:\n\n"
	if strings.TrimSpace(ops.Message) == "" {
		ops.Message = prefix + "I couldn’t pull useful live figures either. Try rephrasing, or open Dashboard / Documentation."
	} else if !strings.HasPrefix(ops.Message, "Guides/KB") {
		ops.Message = prefix + ops.Message
	}
	// Keep mode as ops so the UI shows live-data framing; hits remain for guide chips.
	ops.Mode = "ops"
	return ops
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
	}, body.Attachments...)
	if err != nil || msg == "" || strings.EqualFold(strings.TrimSpace(msg), "INSUFFICIENT_CONTEXT") {
		var b strings.Builder
		b.WriteString("Here are the closest guides:\n")
		for _, h := range hits {
			fmt.Fprintf(&b, "- %s\n", h.Chunk.Title)
		}
		return askResult{Mode: "docs", Message: b.String(), ArticleIDs: articleIDs, Hits: hitMaps, UsedAI: false}
	}
	helpassistant.RecordUsage(ctx, pool, tu.TenantID, usage)
	sid := helpassistant.PersistSession(ctx, pool, tu, body.SessionID, pathname, query, msg, ids, model, usage, body.Attachments...)
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

func askOps(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, cfg helpassistant.Config, query, pathname string, body askBody, entities []EntityRef) askResult {
	specs := toolsForQuery(query, entities)
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
	msg, usage, model, used := summarizeTools(ctx, cfg, query, tools, body.Attachments)
	helpassistant.RecordUsage(ctx, pool, tu.TenantID, usage)
	sid := helpassistant.PersistSession(ctx, pool, tu, body.SessionID, pathname, query, msg, nil, model, usage, body.Attachments...)
	return askResult{
		Mode:        "ops",
		Message:     msg,
		UsedAI:      used,
		Tools:       tools,
		DeepLinks:   links,
		ActionDraft: draft,
		Entities:    entities,
		Model:       model,
		SessionID:   sid,
	}
}

func askAction(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, cfg helpassistant.Config, query, pathname string, body askBody, entities []EntityRef) askResult {
	q := strings.ToLower(query)
	var tr toolResult
	switch {
	case strings.Contains(q, "rfq"):
		tr = runTool(ctx, pool, tu, "import_rfq_pdf", map[string]any{"note": query})
	case strings.Contains(q, "send email") || strings.Contains(q, "email quotation") || strings.Contains(q, "send quotation"):
		tr = runTool(ctx, pool, tu, "draft_send_quotation_email", map[string]any{"q": query, "entities": entities})
	case strings.Contains(q, "generate quotation") || strings.Contains(q, "create quotation") || strings.Contains(q, "new quotation"):
		tr = runTool(ctx, pool, tu, "draft_generate_quotation", map[string]any{"q": query, "entities": entities})
	case strings.Contains(q, "follow-up") || strings.Contains(q, "follow up"):
		tr = runTool(ctx, pool, tu, "draft_follow_up", map[string]any{"q": query, "entities": entities})
	default:
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
		Entities:    entities,
		SessionID:   sid,
	}
}

const opsSystemPrompt = `You are Bluearm Copilot summarizing live ERP tool JSON for an executive.
Rules:
- Use ONLY the tool JSON provided. Do not invent numbers.
- Format with Markdown: short ## headings when useful, **bold** key figures, bullet lists for clarity.
- Prefer deep links as Markdown [Label](/app/...) when helpful.
- Be concise (under 180 words).
- If a tool was denied, say permission is required.
- Do not claim you posted or changed anything.
- For expenses: prefer recurring.monthly_burn / yearly_burn and cash.outflow_mtd / outflow_ytd (and as_of).
- For revenue / year-end projections: you do NOT have a crystal ball. Give a transparent estimate from live figures only — e.g. YTD inflow/revenue run-rate × remaining months, plus open pipeline / open quotations if present. Label it clearly as an estimate, list assumptions, and never present it as a booked forecast.`

func summarizeTools(ctx context.Context, cfg helpassistant.Config, query string, tools []toolResult, atts []helpassistant.ComposeAttachment) (string, llm.Usage, string, bool) {
	raw, _ := json.Marshal(tools)
	var attNote strings.Builder
	if len(atts) > 0 {
		attNote.WriteString("\n\nUser file excerpts:\n")
		for i, a := range atts {
			if i >= 2 {
				break
			}
			text := a.Text
			if len(text) > 4000 {
				text = text[:4000] + "…"
			}
			fmt.Fprintf(&attNote, "\n--- %s ---\n%s\n", a.Name, text)
		}
	}
	user := fmt.Sprintf("User question: %s\n\nTool results JSON:\n%s%s\n\nWrite a short Markdown answer.", query, string(raw), attNote.String())
	client := cfg.NewDashScopeClient()
	model := cfg.MediumModel
	out, err := client.ChatCompletionWithUsage(ctx, llm.ChatRequest{
		Model: model,
		Messages: []llm.Message{
			{Role: "system", Content: opsSystemPrompt},
			{Role: "user", Content: user},
		},
		Temperature: 0.2,
		MaxTokens:   600,
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
