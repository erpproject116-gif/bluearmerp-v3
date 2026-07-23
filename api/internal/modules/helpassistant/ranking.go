package helpassistant

import (
	"context"
	"strings"
	"unicode"

	"github.com/jackc/pgx/v5/pgxpool"
)

type RankingOverride struct {
	ArticleID  string
	QueryToken string
	Boost      float64
	Demote     float64
}

type rankingOverride = RankingOverride

func loadRankingOverrides(ctx context.Context, pool *pgxpool.Pool, tenantID int64) []RankingOverride {
	if pool == nil {
		return nil
	}
	rows, err := pool.Query(ctx, `
		select article_id, coalesce(query_token, ''), coalesce(boost, 0), coalesce(demote, 0)
		from public.help_ranking_overrides
		where tenant_id is null or tenant_id = $1`, tenantID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var out []RankingOverride
	for rows.Next() {
		var r RankingOverride
		if err := rows.Scan(&r.ArticleID, &r.QueryToken, &r.Boost, &r.Demote); err != nil {
			continue
		}
		out = append(out, r)
	}
	return out
}

func applyRankingBoost(score float64, articleID string, terms []string, overrides []RankingOverride) float64 {
	if len(overrides) == 0 {
		return score
	}
	articleID = strings.TrimSpace(articleID)
	termSet := map[string]struct{}{}
	for _, t := range terms {
		termSet[t] = struct{}{}
	}
	adj := 0.0
	for _, o := range overrides {
		if o.ArticleID != articleID {
			continue
		}
		tok := strings.ToLower(strings.TrimSpace(o.QueryToken))
		if tok != "" {
			if _, ok := termSet[tok]; !ok {
				continue
			}
		}
		adj += o.Boost - o.Demote
	}
	return score + adj
}

func upsertRankingFromVote(ctx context.Context, pool *pgxpool.Pool, tenantID int64, articleID, query, vote string) {
	if pool == nil || articleID == "" {
		return
	}
	token := primaryQueryToken(query)
	boostDelta := 0.0
	demoteDelta := 0.0
	up := 0
	down := 0
	if vote == "up" {
		boostDelta = 0.35
		up = 1
	} else {
		demoteDelta = 0.5
		down = 1
	}
	_, _ = pool.Exec(ctx, `
		insert into public.help_ranking_overrides (tenant_id, article_id, query_token, boost, demote, vote_up, vote_down, updated_at)
		values ($1, $2, $3, $4, $5, $6, $7, now())
		on conflict (tenant_id, article_id, query_token) do update set
		  boost = public.help_ranking_overrides.boost + excluded.boost,
		  demote = public.help_ranking_overrides.demote + excluded.demote,
		  vote_up = public.help_ranking_overrides.vote_up + excluded.vote_up,
		  vote_down = public.help_ranking_overrides.vote_down + excluded.vote_down,
		  updated_at = now()`,
		tenantID, articleID, token, boostDelta, demoteDelta, up, down)
}

func primaryQueryToken(query string) string {
	terms := tokenize(query)
	if len(terms) == 0 {
		return ""
	}
	// Prefer a contentful token (skip very short).
	best := terms[0]
	for _, t := range terms {
		if len(t) > len(best) {
			best = t
		}
	}
	if len(best) > 80 {
		best = best[:80]
	}
	return best
}

func tokenize(text string) []string {
	lower := strings.ToLower(text)
	var b strings.Builder
	var out []string
	flush := func() {
		t := strings.TrimSpace(b.String())
		b.Reset()
		if len(t) >= 2 {
			out = append(out, t)
		}
	}
	for _, r := range lower {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || r == '/' || r == '-' {
			b.WriteRune(r)
			continue
		}
		if unicode.IsSpace(r) {
			flush()
			continue
		}
		flush()
	}
	flush()
	return out
}
