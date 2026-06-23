package usermgmt

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/user-management", func(ur chi.Router) {
		ur.Use(auth.RequireManageUsers)
		registerUserRoutes(ur, pool)
		registerRoleRoutes(ur, pool)
		registerPermissionRoutes(ur, pool)
		registerGroupRoutes(ur, pool)
	})
}
