// Apply SQL migrations from api/migrations with schema_migrations tracking.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/jackc/pgx/v5"
)

func main() {
	from := flag.String("from", "", "only apply migrations with filename >= this prefix (e.g. 060)")
	dry := flag.Bool("dry-run", false, "list migrations that would be applied")
	check := flag.Bool("check", false, "list pending migrations and exit")
	flag.Parse()

	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		fmt.Fprintln(os.Stderr, "database URL not configured (set SUPABASE_URL + SUPABASE_DB_PASSWORD or DATABASE_URL)")
		os.Exit(1)
	}

	migDir := findMigrationsDir()
	if migDir == "" {
		fmt.Fprintln(os.Stderr, "api/migrations directory not found")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	if _, err := conn.Exec(ctx, `create table if not exists public.schema_migrations (
		version text primary key,
		applied_at timestamptz not null default now()
	)`); err != nil {
		fmt.Fprintf(os.Stderr, "schema_migrations: %v\n", err)
		os.Exit(1)
	}

	files, err := filepath.Glob(filepath.Join(migDir, "*.sql"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "glob: %v\n", err)
		os.Exit(1)
	}
	sort.Strings(files)

	pending := filterPending(ctx, conn, files, *from)
	if *check || *dry {
		for _, v := range pending {
			if *dry {
				fmt.Println("would apply:", v)
			} else {
				fmt.Println("pending:", v)
			}
		}
		if len(pending) == 0 {
			fmt.Println("no pending migrations")
		}
		return
	}

	for _, v := range pending {
		path := filepath.Join(migDir, v)
		sql, err := os.ReadFile(path)
		if err != nil {
			fmt.Fprintf(os.Stderr, "read %s: %v\n", v, err)
			os.Exit(1)
		}
		fmt.Println("applying:", v)
		tx, err := conn.Begin(ctx)
		if err != nil {
			fmt.Fprintf(os.Stderr, "begin: %v\n", err)
			os.Exit(1)
		}
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "exec %s: %v\n", v, err)
			os.Exit(1)
		}
		if _, err := tx.Exec(ctx, `insert into public.schema_migrations(version) values($1)`, v); err != nil {
			_ = tx.Rollback(ctx)
			fmt.Fprintf(os.Stderr, "record %s: %v\n", v, err)
			os.Exit(1)
		}
		if err := tx.Commit(ctx); err != nil {
			fmt.Fprintf(os.Stderr, "commit %s: %v\n", v, err)
			os.Exit(1)
		}
		fmt.Println("applied:", v)
	}
}

func filterPending(ctx context.Context, conn *pgx.Conn, files []string, from string) []string {
	var out []string
	for _, f := range files {
		v := filepath.Base(f)
		if from != "" && v < from {
			continue
		}
		var applied bool
		_ = conn.QueryRow(ctx, `select exists(select 1 from public.schema_migrations where version=$1)`, v).Scan(&applied)
		if !applied {
			out = append(out, v)
		}
	}
	return out
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
