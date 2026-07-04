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

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/activitylog"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/bi"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/buying"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/companybudget"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/crm"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/dashboard"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/datacenter"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/demodata"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/docgen"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/finance"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/fixedassets"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/goodsreceipt"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/hr"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/manufacturing"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/quality"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/jobcosting"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/purchaseorder"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/purchaserequest"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/portal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/pos"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/quotation"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/salesorder"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/selling"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/shipping"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/support"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/usermgmt"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/wms"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branding"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/drafts"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/formfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/health"
	platformmw "github.com/bluearm/bluearm-erp-v3/api/internal/platform/middleware"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/presence"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	platformreports "github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reporttemplates"
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
	pool, err := config.NewPool(ctx, cfg)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	audit.Configure(cfg)
	audit.StartWorker(pool, cfg)

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(platformmw.SelectiveGzip(cfg.GzipEnabled))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSOrigins(),
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CRM-Job-Secret", "X-Portal-Token"},
		AllowCredentials: true,
	}))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		response.OK(w, map[string]string{"status": "ok"}, "OK")
	})
	r.Get("/health/db", health.DBHandler(pool, cfg))

	r.Route("/api/v1", func(api chi.Router) {
		crm.RegisterJobRoutes(api, pool)
		platformreports.RegisterJobRoutes(api, pool)
		portal.RegisterRoutes(api, pool, cfg.SupabaseURL, cfg.SupabaseJWTSecret)
		api.Group(func(protected chi.Router) {
			protected.Use(auth.Middleware(pool, cfg.SupabaseURL, cfg.SupabaseJWTSecret))
			protected.Use(audit.Middleware(pool))
			protected.Get("/auth/me", auth.MeHandler(pool))
			auth.RegisterAuthRoutes(protected, pool)
			presence.RegisterRoutes(protected, pool)
			customfields.RegisterRoutes(protected, pool)
			drafts.RegisterRoutes(protected, pool)
			formfields.RegisterRoutes(protected, pool)
			reporttemplates.RegisterRoutes(protected, pool)
			platformreports.RegisterRoutes(protected)
			branding.RegisterRoutes(protected, pool)
			processpolicy.RegisterRoutes(protected, pool)
			approval.RegisterRoutes(protected, pool)
			docgen.RegisterRoutes(protected, pool)
			demodata.RegisterRoutes(protected, pool)
			activitylog.RegisterRoutes(protected, pool)
			inventory.RegisterRoutes(protected, pool)
			quotation.RegisterRoutes(protected, pool)
			sales.RegisterRoutes(protected, pool)
			finance.RegisterRoutes(protected, pool)
			companybudget.RegisterRoutes(protected, pool)
			datacenter.RegisterRoutes(protected, pool)
			shipping.RegisterRoutes(protected, pool)
			wms.RegisterRoutes(protected, pool)
			salesorder.RegisterRoutes(protected, pool)
			selling.RegisterRoutes(protected, pool)
			buying.RegisterRoutes(protected, pool)
			purchaserequest.RegisterRoutes(protected, pool)
			purchaseorder.RegisterRoutes(protected, pool)
			goodsreceipt.RegisterRoutes(protected, pool)
			usermgmt.RegisterRoutes(protected, pool)
			crm.RegisterRoutes(protected, pool)
			support.RegisterRoutes(protected, pool)
			bi.RegisterRoutes(protected, pool, api)
			fixedassets.RegisterRoutes(protected, pool)
			jobcosting.RegisterRoutes(protected, pool)
			manufacturing.RegisterRoutes(protected, pool)
			quality.RegisterRoutes(protected, pool)
			pos.RegisterRoutes(protected, pool)
			hr.RegisterRoutes(protected, pool)
			dashboard.RegisterRoutes(protected, pool)
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
	auditCtx, auditCancel := context.WithTimeout(context.Background(), 5*time.Second)
	_ = audit.Shutdown(auditCtx)
	auditCancel()
	_ = srv.Shutdown(shutdownCtx)
}
