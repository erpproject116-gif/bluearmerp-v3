package config

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func NewPool(ctx context.Context, cfg Config) (*pgxpool.Pool, error) {
	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse db config: %w", err)
	}
	poolCfg.MaxConns = int32(cfg.DBMaxConns)
	poolCfg.MinConns = int32(cfg.DBMinConns)
	poolCfg.MaxConnLifetime = time.Duration(cfg.DBMaxConnLifetimeMin) * time.Minute
	poolCfg.MaxConnIdleTime = time.Duration(cfg.DBMaxConnIdleMin) * time.Minute
	return pgxpool.NewWithConfig(ctx, poolCfg)
}
