package helpassistant

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

var ErrDailyTokenCap = errors.New("copilot daily token cap exceeded")

// CheckDailyCap returns ErrDailyTokenCap when the tenant is over COPILOT_DAILY_TOKEN_CAP.
func CheckDailyCap(ctx context.Context, pool *pgxpool.Pool, tenantID int64, capTokens int64) error {
	return checkDailyCap(ctx, pool, tenantID, capTokens)
}

// RecordUsage increments copilot_usage_daily.
func RecordUsage(ctx context.Context, pool *pgxpool.Pool, tenantID int64, u llm.Usage) {
	recordUsage(ctx, pool, tenantID, u)
}

// UsageOrEstimate prefers provider usage, else estimates from text length.
func UsageOrEstimate(u llm.Usage, prompt, completion string) llm.Usage {
	return usageOrEstimate(u, prompt, completion)
}

func estimateTokens(text string) int {
	n := len([]rune(text))
	if n == 0 {
		return 0
	}
	est := n / 4
	if est < 1 {
		est = 1
	}
	return est
}

func usageOrEstimate(u llm.Usage, prompt, completion string) llm.Usage {
	if u.TotalTokens > 0 || u.PromptTokens > 0 || u.CompletionTokens > 0 {
		if u.TotalTokens == 0 {
			u.TotalTokens = u.PromptTokens + u.CompletionTokens
		}
		return u
	}
	pt := estimateTokens(prompt)
	ct := estimateTokens(completion)
	return llm.Usage{PromptTokens: pt, CompletionTokens: ct, TotalTokens: pt + ct}
}

func checkDailyCap(ctx context.Context, pool *pgxpool.Pool, tenantID int64, capTokens int64) error {
	if pool == nil || capTokens <= 0 {
		return nil
	}
	today := time.Now().UTC().Format("2006-01-02")
	var total int64
	err := pool.QueryRow(ctx, `
		select coalesce(total_tokens, 0) from public.copilot_usage_daily
		where tenant_id = $1 and usage_date = $2::date`, tenantID, today).Scan(&total)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		// Table may not exist yet in older envs — do not block compose.
		return nil
	}
	if total >= capTokens {
		return ErrDailyTokenCap
	}
	return nil
}

func recordUsage(ctx context.Context, pool *pgxpool.Pool, tenantID int64, u llm.Usage) {
	if pool == nil || tenantID <= 0 {
		return
	}
	if u.TotalTokens == 0 && u.PromptTokens == 0 && u.CompletionTokens == 0 {
		return
	}
	today := time.Now().UTC().Format("2006-01-02")
	_, _ = pool.Exec(ctx, `
		insert into public.copilot_usage_daily (tenant_id, usage_date, prompt_tokens, completion_tokens, total_tokens, call_count)
		values ($1, $2::date, $3, $4, $5, 1)
		on conflict (tenant_id, usage_date) do update set
		  prompt_tokens = public.copilot_usage_daily.prompt_tokens + excluded.prompt_tokens,
		  completion_tokens = public.copilot_usage_daily.completion_tokens + excluded.completion_tokens,
		  total_tokens = public.copilot_usage_daily.total_tokens + excluded.total_tokens,
		  call_count = public.copilot_usage_daily.call_count + 1`,
		tenantID, today, u.PromptTokens, u.CompletionTokens, u.TotalTokens)
}
