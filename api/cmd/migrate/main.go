// Apply SQL migrations from api/migrations with schema_migrations tracking.
package main

import (
	"context"
	"flag"
	"fmt"
	"os"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/migrate"
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

	if migrate.Dir() == "" {
		fmt.Fprintln(os.Stderr, "api/migrations directory not found (set MIGRATIONS_DIR if running in Docker)")
		os.Exit(1)
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	pending, err := migrate.Pending(ctx, conn, *from)
	if err != nil {
		fmt.Fprintf(os.Stderr, "pending: %v\n", err)
		os.Exit(1)
	}

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
		if *check && len(pending) > 0 {
			os.Exit(2)
		}
		return
	}

	applied, err := migrate.Apply(ctx, conn, *from)
	if err != nil {
		fmt.Fprintf(os.Stderr, "%v\n", err)
		os.Exit(1)
	}
	for _, v := range applied {
		fmt.Println("applied:", v)
	}
	if len(applied) == 0 {
		fmt.Println("no pending migrations")
	}
}
