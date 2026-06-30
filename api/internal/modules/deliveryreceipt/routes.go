package deliveryreceipt

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/sales-order", func(sr chi.Router) {
		sr.With(auth.RequirePermission("sales_order.delivery_receipts", "read")).Get("/delivery-receipts/open-lines", listOpenDeliveryLines(pool))
		sr.With(auth.RequirePermission("sales_order.delivery_receipts", "read")).Get("/delivery-receipts/preview-sequences", previewDeliveryReceiptSequences(pool))
		sr.With(auth.RequirePermission("sales_order.delivery_receipts", "read")).Get("/delivery-receipts", listDeliveryReceipts(pool))
		sr.With(auth.RequirePermission("sales_order.delivery_receipts", "read")).Get("/delivery-receipts/{id}", getDeliveryReceipt(pool))
		sr.With(auth.RequirePermission("sales_order.delivery_receipts_new", "write")).Post("/delivery-receipts", createDeliveryReceipt(pool))
		sr.With(auth.RequirePermission("sales_order.delivery_receipts_post", "write")).Post("/delivery-receipts/{id}/post", postDeliveryReceipt(pool))
	})
}
