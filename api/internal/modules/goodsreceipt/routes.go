package goodsreceipt

import (
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/goods-receipt", func(gr chi.Router) {
		gr.With(auth.RequirePermission("purchase_order.goods_receipts", "read")).Get("/goods-receipts", listGoodsReceipts(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts", "read")).Get("/goods-receipts/{id}", getGoodsReceipt(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts", "write")).Post("/goods-receipts", createGoodsReceipt(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts", "write")).Post("/goods-receipts/{id}/serials", addGoodsReceiptSerial(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts", "write")).Post("/goods-receipts/{id}/lots", addGoodsReceiptLot(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts_post", "write")).Post("/goods-receipts/{id}/post", postGoodsReceipt(pool))
		gr.With(auth.RequirePermission("purchase_order.goods_receipts_reverse", "write")).Post("/goods-receipts/{id}/reverse", reverseGoodsReceipt(pool))
	})
}
