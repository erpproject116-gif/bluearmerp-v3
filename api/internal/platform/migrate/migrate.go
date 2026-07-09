// Package migrate applies versioned SQL files from api/migrations with schema_migrations tracking.
package migrate

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Dir returns the migrations directory. Override with MIGRATIONS_DIR in containers.
func Dir() string {
	if d := os.Getenv("MIGRATIONS_DIR"); d != "" {
		return d
	}
	return findMigrationsDir()
}

func findMigrationsDir() string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}
	for {
		p := filepath.Join(wd, "api", "migrations")
		if st, err := os.Stat(p); err == nil && st.IsDir() {
			return p
		}
		parent := filepath.Dir(wd)
		if parent == wd {
			break
		}
		wd = parent
	}
	return ""
}

// EnsureTrackingTable creates schema_migrations if needed.
func EnsureTrackingTable(ctx context.Context, conn *pgx.Conn) error {
	_, err := conn.Exec(ctx, `create table if not exists public.schema_migrations (
		version text primary key,
		applied_at timestamptz not null default now()
	)`)
	return err
}

// Pending returns migration filenames not yet recorded in schema_migrations.
func Pending(ctx context.Context, conn *pgx.Conn, from string) ([]string, error) {
	migDir := Dir()
	if migDir == "" {
		return nil, fmt.Errorf("migrations directory not found")
	}
	files, err := filepath.Glob(filepath.Join(migDir, "*.sql"))
	if err != nil {
		return nil, err
	}
	sort.Strings(files)

	var out []string
	for _, f := range files {
		v := filepath.Base(f)
		if from != "" && v < from {
			continue
		}
		var applied bool
		if err := conn.QueryRow(ctx, `select exists(select 1 from public.schema_migrations where version=$1)`, v).Scan(&applied); err != nil {
			return nil, err
		}
		if !applied {
			out = append(out, v)
		}
	}
	return out, nil
}

// Apply runs pending migrations in order. When from is non-empty, only files >= from are considered.
func Apply(ctx context.Context, conn *pgx.Conn, from string) ([]string, error) {
	if err := EnsureTrackingTable(ctx, conn); err != nil {
		return nil, err
	}
	pending, err := Pending(ctx, conn, from)
	if err != nil {
		return nil, err
	}
	migDir := Dir()
	var applied []string
	for _, v := range pending {
		path := filepath.Join(migDir, v)
		sql, err := os.ReadFile(path)
		if err != nil {
			return applied, fmt.Errorf("read %s: %w", v, err)
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return applied, err
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("exec %s: %w", v, err)
		}
		if _, err := tx.Exec(ctx, `insert into public.schema_migrations(version) values($1)`, v); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("record %s: %w", v, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return applied, fmt.Errorf("commit %s: %w", v, err)
		}
		applied = append(applied, v)
	}
	return applied, nil
}

// ApplyPool borrows a connection and runs Apply.
func ApplyPool(ctx context.Context, pool *pgxpool.Pool, from string) ([]string, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	return Apply(ctx, conn.Conn(), from)
}

// LatestVersion returns the highest applied migration filename, or "" if none.
func LatestVersion(ctx context.Context, conn *pgx.Conn) (string, error) {
	var v string
	err := conn.QueryRow(ctx, `select coalesce(max(version), '') from public.schema_migrations`).Scan(&v)
	return v, err
}

// PendingPool lists pending migrations using a pool connection.
func PendingPool(ctx context.Context, pool *pgxpool.Pool, from string) ([]string, error) {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	if err := EnsureTrackingTable(ctx, conn.Conn()); err != nil {
		return nil, err
	}
	return Pending(ctx, conn.Conn(), from)
}
