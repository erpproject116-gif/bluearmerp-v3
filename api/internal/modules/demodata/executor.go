package demodata

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type StepResult struct {
	Script  string `json:"script"`
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
	Elapsed string `json:"elapsed,omitempty"`
}

func execScript(ctx context.Context, conn *pgxpool.Conn, name, sql string) StepResult {
	start := time.Now()
	_, err := conn.Exec(ctx, sql)
	elapsed := time.Since(start).Round(time.Millisecond).String()
	if err != nil {
		return StepResult{Script: name, OK: false, Message: err.Error(), Elapsed: elapsed}
	}
	return StepResult{Script: name, OK: true, Elapsed: elapsed}
}

// withDemoConn checks out a single pooled connection and pins the target tenant
// and industry as session GUCs (app.demo_tenant / app.demo_industry) so every
// seed script in the run operates on the same connection and honours the scope.
func withDemoConn(ctx context.Context, pool *pgxpool.Pool, targetTenant int64, industry string, fn func(conn *pgxpool.Conn) error) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire connection: %w", err)
	}
	defer conn.Release()

	if targetTenant > 0 {
		if _, err := conn.Exec(ctx, `select set_config('app.demo_tenant', $1, false)`, strconv.FormatInt(targetTenant, 10)); err != nil {
			return fmt.Errorf("set app.demo_tenant: %w", err)
		}
	} else {
		// Ensure a stale value from a recycled connection cannot leak in.
		_, _ = conn.Exec(ctx, `select set_config('app.demo_tenant', '', false)`)
	}
	if industry != "" {
		_, _ = conn.Exec(ctx, `select set_config('app.demo_industry', $1, false)`, industry)
	}
	return fn(conn)
}

func runPurge(ctx context.Context, pool *pgxpool.Pool, industry string, targetTenant int64) ([]StepResult, error) {
	var results []StepResult
	err := withDemoConn(ctx, pool, targetTenant, industry, func(conn *pgxpool.Conn) error {
		sql, err := readSQL(industry, purgeScript)
		if err != nil {
			return err
		}
		results = append(results, execScript(ctx, conn, purgeScript, sql))
		return nil
	})
	return results, err
}

// runPopulate seeds base config first, then the ordered populate chain, all pinned
// to targetTenant. When bestEffort is true, a failing step is recorded but the run
// continues (used by self-service provisioning so a demo is never left half-empty
// from a single late-chain hiccup). Otherwise it stops at the first failure.
func runPopulate(ctx context.Context, pool *pgxpool.Pool, industry string, targetTenant int64, includeVerify, bestEffort bool) ([]StepResult, error) {
	results := make([]StepResult, 0, len(PopulateScripts)+3)
	scripts := append([]string{baseConfigScript}, PopulateScripts...)

	err := withDemoConn(ctx, pool, targetTenant, industry, func(conn *pgxpool.Conn) error {
		for _, name := range scripts {
			sql, err := readSQL(industry, name)
			if err != nil {
				if bestEffort {
					results = append(results, StepResult{Script: name, OK: false, Message: err.Error()})
					continue
				}
				return fmt.Errorf("load %s: %w", name, err)
			}
			step := execScript(ctx, conn, name, sql)
			results = append(results, step)
			if !step.OK && !bestEffort {
				return fmt.Errorf("%s failed: %s", name, step.Message)
			}
		}
		if includeVerify && industrySupportsVerify(industry) {
			for _, vName := range []string{verifyScript, verifyReconciliationScript} {
				sql, err := readSQL(industry, vName)
				if err != nil {
					if bestEffort {
						results = append(results, StepResult{Script: vName, OK: false, Message: err.Error()})
						continue
					}
					return fmt.Errorf("load %s: %w", vName, err)
				}
				step := execScript(ctx, conn, vName, sql)
				results = append(results, step)
				if !step.OK && !bestEffort {
					return fmt.Errorf("%s failed: %s", vName, step.Message)
				}
			}
		}
		return nil
	})
	return results, err
}
