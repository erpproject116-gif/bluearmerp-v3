package shipping

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/shipping", func(sr chi.Router) {
		registerShippingOrderRoutes(sr, pool)
		registerDeliveryTripRoutes(sr, pool)
		registerShippingRuleRoutes(sr, pool)
	})
}

func registerShippingOrderRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("shipping_order.read", auth.AccessRead)).Get("/orders", listShippingOrders(pool))
	r.With(auth.RequirePermission("shipping_order.read", auth.AccessRead)).Get("/orders/{id}", getShippingOrder(pool))
	r.With(auth.RequirePermission("shipping_order.write", auth.AccessWrite)).Post("/orders", createShippingOrder(pool))
	r.With(auth.RequirePermission("shipping_order.write", auth.AccessWrite)).Patch("/orders/{id}", patchShippingOrder(pool))
	r.With(auth.RequirePermission("shipping_order.write", auth.AccessWrite)).Delete("/orders/{id}", deleteShippingOrder(pool))
}

func registerDeliveryTripRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("delivery_trip.read", auth.AccessRead)).Get("/trips", listDeliveryTrips(pool))
	r.With(auth.RequirePermission("delivery_trip.read", auth.AccessRead)).Get("/trips/{id}", getDeliveryTrip(pool))
	r.With(auth.RequirePermission("delivery_trip.write", auth.AccessWrite)).Post("/trips", createDeliveryTrip(pool))
	r.With(auth.RequirePermission("delivery_trip.write", auth.AccessWrite)).Patch("/trips/{id}", patchDeliveryTrip(pool))
	r.With(auth.RequirePermission("delivery_trip.write", auth.AccessWrite)).Delete("/trips/{id}", deleteDeliveryTrip(pool))
}
