package copilot

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/helpassistant"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

var (
	ErrCopilotDisabled = errors.New("baiko is not enabled")
	ErrCopilotRate     = errors.New("too many baiko asks")
	ErrCopilotCap      = errors.New("daily ai token cap reached")
)

// ActionDraftExport is the JSON-friendly approve-to-act draft for chat / external callers.
type ActionDraftExport struct {
	Type    string         `json:"type"`
	Summary string         `json:"summary"`
	Payload map[string]any `json:"payload"`
	API     string         `json:"api,omitempty"`
	Method  string         `json:"method,omitempty"`
}

// DeepLinkExport mirrors sanitized deep links from ask.
type DeepLinkExport struct {
	Label string `json:"label"`
	Href  string `json:"href"`
}

// AskResultExport is a stable DTO for in-process grounded ask (Team Chat slash).
type AskResultExport struct {
	Mode        string             `json:"mode"`
	Message     string             `json:"message"`
	UsedAI      bool               `json:"used_ai"`
	ActionDraft *ActionDraftExport `json:"action_draft,omitempty"`
	DeepLinks   []DeepLinkExport   `json:"deep_links,omitempty"`
	SessionID   *int64             `json:"session_id,omitempty"`
}

// RunAsk executes the same grounded pipeline as POST /copilot/ask without HTTP.
// Callers must enforce their own ACL (e.g. Team Chat Baiko slash gate).
func RunAsk(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, query, pathname string, entities []EntityRef) (AskResultExport, error) {
	cfg := helpassistant.ConfigFromEnv()
	if !cfg.CopilotAvailable() {
		return AskResultExport{}, ErrCopilotDisabled
	}
	if !allowCopilotRate(tu.TenantID, tu.AppUserID, "ask") {
		return AskResultExport{}, ErrCopilotRate
	}
	query = strings.TrimSpace(query)
	if query == "" {
		return AskResultExport{}, fmt.Errorf("query is required")
	}
	if len(query) > 4000 {
		return AskResultExport{}, fmt.Errorf("query is too long")
	}
	if helpassistant.IsOffTopicERPQuery(query) {
		return toAskExport(finalizeAskResult(askResult{
			Mode:    "docs",
			Message: helpassistant.OffTopicRefuseMessage,
			UsedAI:  false,
		})), nil
	}
	if err := helpassistant.CheckDailyCap(ctx, pool, tu.TenantID, cfg.DailyCap); err != nil {
		if errors.Is(err, helpassistant.ErrDailyTokenCap) {
			return AskResultExport{}, ErrCopilotCap
		}
	}

	body := askBody{
		Query:    query,
		Pathname: strings.TrimSpace(pathname),
		Entities: entities,
	}
	merged := mergeEntities(body.Entities, parseMentionTokens(query))
	mode := classifyIntent(query)

	var result askResult
	switch mode {
	case "docs":
		result = askDocs(ctx, pool, tu, cfg, query, body.Pathname, body)
		if docsInsufficient(result) {
			ops := askOps(ctx, pool, tu, cfg, query, body.Pathname, body, merged)
			result = mergeDocsEscalation(result, ops)
		}
	case "action":
		result = askAction(ctx, pool, tu, cfg, query, body.Pathname, body, merged, nil)
	default:
		result = askOps(ctx, pool, tu, cfg, query, body.Pathname, body, merged)
	}
	return toAskExport(finalizeAskResult(result)), nil
}

func toAskExport(r askResult) AskResultExport {
	out := AskResultExport{
		Mode:      r.Mode,
		Message:   r.Message,
		UsedAI:    r.UsedAI,
		SessionID: r.SessionID,
	}
	if r.ActionDraft != nil {
		out.ActionDraft = &ActionDraftExport{
			Type:    r.ActionDraft.Type,
			Summary: r.ActionDraft.Summary,
			Payload: r.ActionDraft.Payload,
			API:     r.ActionDraft.API,
			Method:  r.ActionDraft.Method,
		}
		if out.ActionDraft.Payload == nil {
			out.ActionDraft.Payload = map[string]any{}
		}
	}
	for _, d := range r.DeepLinks {
		out.DeepLinks = append(out.DeepLinks, DeepLinkExport{Label: d.Label, Href: d.Href})
	}
	return out
}
