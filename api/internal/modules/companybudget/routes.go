package companybudget

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/company-budget", func(br chi.Router) {
		registerBudgetRoutes(br, pool)
	})
}

func registerBudgetRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.budget_read", auth.AccessRead)).Get("/budgets", listBudgets(pool))
	r.With(auth.RequirePermission("finance.budget_write", auth.AccessWrite)).Post("/budgets", createBudget(pool))
	r.With(auth.RequirePermission("finance.budget_write", auth.AccessWrite)).Patch("/budgets/{id}", patchBudget(pool))
	r.With(auth.RequirePermission("finance.budget_read", auth.AccessRead)).Get("/budgets/{id}/lines", listBudgetLines(pool))
	r.With(auth.RequirePermission("finance.budget_write", auth.AccessWrite)).Post("/budgets/{id}/lines", createBudgetLine(pool))
	r.With(auth.RequirePermission("finance.budget_read", auth.AccessRead)).Get("/budgets/{id}/vs-actual", budgetVsActual(pool))
	r.With(auth.RequirePermission("finance.budget_read", auth.AccessRead)).Get("/budgets/{id}/vs-actual/export", exportBudgetVsActual(pool))
}
