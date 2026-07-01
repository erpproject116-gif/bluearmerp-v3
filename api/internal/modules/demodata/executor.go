package demodata

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type StepResult struct {
	Script  string `json:"script"`
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	Elapsed string `json:"elapsed,omitempty"`
}

func execScript(ctx context.Context, pool *pgxpool.Pool, name, sql string) StepResult {
	start := time.Now()
	_, err := pool.Exec(ctx, sql)
	elapsed := time.Since(start).Round(time.Millisecond).String()
	if err != nil {
		return StepResult{
			Script:  name,
			OK:      false,
			Message: err.Error(),
			Elapsed: elapsed,
		}
	}
	return StepResult{
		Script:  name,
		OK:      true,
		Elapsed: elapsed,
	}
}

func runPurge(ctx context.Context, pool *pgxpool.Pool) ([]StepResult, error) {
	sql, err := readSQL(purgeScript)
	if err != nil {
		return nil, err
	}
	return []StepResult{execScript(ctx, pool, purgeScript, sql)}, nil
}

func runPopulate(ctx context.Context, pool *pgxpool.Pool, includeVerify bool) ([]StepResult, error) {
	results := make([]StepResult, 0, len(PopulateScripts)+1)
	for _, name := range PopulateScripts {
		sql, err := readSQL(name)
		if err != nil {
			return results, fmt.Errorf("load %s: %w", name, err)
		}
		step := execScript(ctx, pool, name, sql)
		results = append(results, step)
		if !step.OK {
			return results, fmt.Errorf("%s failed: %s", name, step.Message)
		}
	}
	if includeVerify {
		for _, vName := range []string{verifyScript, verifyReconciliationScript} {
			sql, err := readSQL(vName)
			if err != nil {
				return results, fmt.Errorf("load %s: %w", vName, err)
			}
			step := execScript(ctx, pool, vName, sql)
			results = append(results, step)
			if !step.OK {
				return results, fmt.Errorf("%s failed: %s", vName, step.Message)
			}
		}
	}
	return results, nil
}
