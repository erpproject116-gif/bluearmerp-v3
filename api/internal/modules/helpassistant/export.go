package helpassistant

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

// ComposeHit is the grounded article payload for compose / copilot.
type ComposeHit = composeHitIn

// ComposePersonalization is optional context injected into the small-model prompt.
type ComposePersonalization = composePersonalization

// ComposeAttachment is extracted file text for grounded compose.
type ComposeAttachment = composeAttachmentIn

// GroundedCompose runs the small-model rewrite over retrieved hits.
func GroundedCompose(ctx context.Context, cfg Config, query, pathname string, hits []ComposeHit, pers *ComposePersonalization, atts ...ComposeAttachment) (string, []string, llm.Usage, string, error) {
	return groundedCompose(ctx, cfg, query, pathname, hits, pers, atts)
}

// LoadRankingOverrides loads feedback-derived boost/demote rows.
func LoadRankingOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID int64) []RankingOverride {
	return loadRankingOverrides(ctx, pool, tenantID)
}

// SearchHelpPublic runs keyword retrieve with the default min score.
func SearchHelpPublic(query, pathname string, limit int, overrides []RankingOverride) []SearchHit {
	return SearchHelp(query, pathname, limit, minScore, overrides)
}

// PersistSession writes user/assistant messages for audit (best-effort).
func PersistSession(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, sessionID *int64, pathname, query, answer string, articleIDs []string, model string, usage llm.Usage, atts ...ComposeAttachment) *int64 {
	return persistComposeSession(ctx, pool, tu.TenantID, sessionID, pathname, query, answer, articleIDs, model, usage, atts)
}
