// Package demoonboard implements self-service, industry-seeded free demo accounts
// with integrated sales lead generation. All routes are public (no tenant auth
// middleware); the provisioning endpoint validates the Supabase access token itself.
package demoonboard

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/mail"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
)

type service struct {
	pool      *pgxpool.Pool
	validator *auth.JWTValidator
	cfg       config.Config
}

// RegisterRoutes mounts the public demo onboarding endpoints under /demo.
func RegisterRoutes(r chi.Router, pool *pgxpool.Pool, cfg config.Config) {
	svc := &service{pool: pool, cfg: cfg}
	// Best-effort: token-verified endpoints degrade to 503 if auth is unconfigured.
	if v, err := auth.NewJWTValidator(cfg.SupabaseURL, cfg.SupabaseJWTSecret); err == nil {
		svc.validator = v
	}

	r.Route("/demo", func(dr chi.Router) {
		dr.Get("/templates", svc.getTemplates)
		dr.Post("/signup", svc.postSignup)
		dr.Post("/provision", svc.postProvision)
		dr.Post("/jobs/cleanup", svc.postCleanup)
	})
}

func isValidEmail(s string) bool {
	s = strings.TrimSpace(s)
	if s == "" || len(s) > 320 {
		return false
	}
	addr, err := mail.ParseAddress(s)
	if err != nil {
		return false
	}
	return addr.Address == s && strings.Contains(s, ".")
}

// leadgenTenantID resolves the home tenant that owns demo-signup CRM leads.
func (s *service) leadgenTenantID(ctx context.Context) (int64, bool) {
	code := strings.TrimSpace(s.cfg.DemoLeadgenTenantCode)
	if code == "" {
		return 0, false
	}
	var id int64
	err := s.pool.QueryRow(ctx,
		`select id from public.tenants where company_code = $1`, code).Scan(&id)
	if err != nil {
		return 0, false
	}
	return id, true
}

// newCompanyCode returns a short unique tenant code like "DEMO-1a2b3c".
func (s *service) newCompanyCode(ctx context.Context) (string, error) {
	for i := 0; i < 6; i++ {
		buf := make([]byte, 3)
		if _, err := rand.Read(buf); err != nil {
			return "", err
		}
		code := "DEMO-" + hex.EncodeToString(buf)
		var exists bool
		if err := s.pool.QueryRow(ctx,
			`select exists(select 1 from public.tenants where company_code = $1)`, code).Scan(&exists); err != nil {
			return "", err
		}
		if !exists {
			return code, nil
		}
	}
	return "", errCodeExhausted
}
