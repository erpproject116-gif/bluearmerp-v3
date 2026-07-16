package hr

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/hr", func(hr chi.Router) {
		// ESS: any authenticated tenant user linked to an employee (no HR admin permission).
		registerESSRoutes(hr, pool)

		hr.Group(func(admin chi.Router) {
			admin.Use(auth.RequirePermission("hr.employees", auth.AccessRead))
			registerEmployeeRoutes(admin, pool)
			registerPayrollRoutes(admin, pool)
			registerPayslipDetailRoutes(admin, pool)
			registerRemittanceRoutes(admin, pool)
			registerAttendanceRoutes(admin, pool)
			registerPayItemRoutes(admin, pool)
			registerEmployeeDocRoutes(admin, pool)
			registerSpecialRunRoutes(admin, pool)
			registerBiometricRoutes(admin, pool)
		})
	})
}
