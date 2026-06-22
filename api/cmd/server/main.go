package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/quotation"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/salesorder"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/usermgmt"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/formfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/health"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func main() {
	cfg := config.Load()
	if cfg.DatabaseURL == "" {
		log.Fatal(config.DatabaseConfigError())
	}
	if cfg.SupabaseURL == "" && cfg.SupabaseJWTSecret == "" {
		log.Fatal("auth not configured: set SUPABASE_URL (JWKS) and/or SUPABASE_JWT_SECRET")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		response.OK(w, map[string]string{"status": "ok"}, "OK")
	})
	r.Get("/health/db", health.DBHandler(pool, cfg))

	r.Route("/api/v1", func(api chi.Router) {
		api.Group(func(protected chi.Router) {
			protected.Use(auth.Middleware(pool, cfg.SupabaseURL, cfg.SupabaseJWTSecret))
			protected.Get("/auth/me", auth.MeHandler(pool))
			customfields.RegisterRoutes(protected, pool)
			formfields.RegisterRoutes(protected, pool)
			inventory.RegisterRoutes(protected, pool)
			quotation.RegisterRoutes(protected, pool)
			salesorder.RegisterRoutes(protected, pool)
			usermgmt.RegisterRoutes(protected, pool)
		})
	})

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: r}
	go func() {
		log.Printf("api listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
