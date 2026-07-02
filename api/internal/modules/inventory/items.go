package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type Item struct {
	ID                     int64   `json:"id"`
	ItemCode               string  `json:"item_code"`
	ItemName               string  `json:"item_name"`
	PurchasePrice          float64 `json:"purchase_price"`
	SalesPrice             float64 `json:"sales_price"`
	VipPrice               float64 `json:"vip_price"`
	WarrantyDurationMonths *int     `json:"warranty_duration_months,omitempty"`
	ReorderLevel           *float64 `json:"reorder_level,omitempty"`
	TrackSerial            bool     `json:"track_serial"`
	TrackLot               bool     `json:"track_lot"`
	TrackInventoryQty      bool     `json:"track_inventory_qty"`
	Status                 string   `json:"status"`
	ItemCategoryID         *int64         `json:"item_category_id,omitempty"`
	CustomValues           map[string]any `json:"custom_values,omitempty"`
}

type itemBody struct {
	ItemName               string         `json:"item_name"`
	PurchasePrice          float64        `json:"purchase_price"`
	SalesPrice             float64        `json:"sales_price"`
	VipPrice               float64        `json:"vip_price"`
	WarrantyDurationMonths *int           `json:"warranty_duration_months"`
	ReorderLevel           *float64       `json:"reorder_level"`
	TrackSerial            *bool          `json:"track_serial"`
	TrackLot               *bool          `json:"track_lot"`
	TrackInventoryQty      *bool          `json:"track_inventory_qty"`
	Status                 string         `json:"status"`
	ItemCategoryID         *int64         `json:"item_category_id"`
	CustomValues           map[string]any `json:"custom_values"`
}

func registerItemRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/items/next-code", nextCodeHandler(pool, "item"))
	r.Get("/items/import-template", itemImportTemplateHandler())
	r.Post("/items/import", itemImportCSVHandler(pool))
	r.Get("/items", listItems(pool))
	r.Post("/items", createItem(pool))
	r.Patch("/items/{id}", updateItem(pool))
	r.Delete("/items/{id}", deleteItem(pool))
}

func listItems(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"item_code":       "item_code",
		"item_name":       "item_name",
		"purchase_price":  "purchase_price",
		"sales_price":     "sales_price",
		"vip_price":       "vip_price",
		"status":          "status",
		"created_at":      "created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "item_code", allowed)
		offset := httputil.Offset(p)
		where, args := buildWhere(tu.TenantID, p, "item_name", "item_code")
		q := fmt.Sprintf(`select id, item_code, item_name, purchase_price::float8, sales_price::float8, vip_price::float8,
			warranty_duration_months, reorder_level::float8, track_serial, track_lot, track_inventory_qty, status, item_category_id, count(*) over()
			from public.inv_items where %s order by %s %s limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), len(args)+1, len(args)+2)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Item
		var total int64
		for rows.Next() {
			var row Item
			if err := rows.Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.PurchasePrice, &row.SalesPrice, &row.VipPrice,
				&row.WarrantyDurationMonths, &row.ReorderLevel, &row.TrackSerial, &row.TrackLot, &row.TrackInventoryQty, &row.Status, &row.ItemCategoryID, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Item{}
		}
		attachListCustom(r.Context(), pool, tu.TenantID, entityItem, out, func(i Item) int64 { return i.ID }, func(i *Item, v map[string]any) { i.CustomValues = v })
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func createItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body itemBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if strings.TrimSpace(body.ItemName) == "" {
			response.Validation(w, map[string]string{"item_name": "Item name is required."})
			return
		}
		id, row, err := createWithCode(r.Context(), pool, tu, "item", func(ctx context.Context, tx pgxpoolConn, code string) (int64, Item, error) {
			var row Item
			err := tx.QueryRow(ctx, `insert into public.inv_items (tenant_id, item_code, item_name, purchase_price, sales_price, vip_price, warranty_duration_months, reorder_level, track_serial, track_lot, track_inventory_qty, status, item_category_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
				returning id, item_code, item_name, purchase_price::float8, sales_price::float8, vip_price::float8, warranty_duration_months, reorder_level::float8, track_serial, track_lot, track_inventory_qty, status, item_category_id`,
				tu.TenantID, code, strings.TrimSpace(body.ItemName), body.PurchasePrice, body.SalesPrice, body.VipPrice, body.WarrantyDurationMonths, body.ReorderLevel, boolOrFalse(body.TrackSerial), boolOrFalse(body.TrackLot), boolOrFalse(body.TrackInventoryQty), defaultStatus(body.Status), body.ItemCategoryID).
				Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.PurchasePrice, &row.SalesPrice, &row.VipPrice, &row.WarrantyDurationMonths, &row.ReorderLevel, &row.TrackSerial, &row.TrackLot, &row.TrackInventoryQty, &row.Status, &row.ItemCategoryID)
			return row.ID, row, err
		})
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		if errs := persistCustom(r.Context(), pool, tu.TenantID, entityItem, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		row.CustomValues = attachCustom(r.Context(), pool, tu.TenantID, entityItem, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item.create", "inv_item", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func updateItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body itemBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var curTrackSerial, curTrackLot bool
		err = tx.QueryRow(r.Context(), `
			select track_serial, track_lot from public.inv_items
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&curTrackSerial, &curTrackLot)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if body.TrackSerial != nil && !*body.TrackSerial && curTrackSerial {
			var openSerials int
			if err := tx.QueryRow(r.Context(), `
				select count(*) from public.inv_serial_units
				where tenant_id = $1 and item_id = $2 and status not in ('void', 'scrapped')`,
				tu.TenantID, id).Scan(&openSerials); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to validate serial units.", "ERR_INTERNAL")
				return
			}
			if openSerials > 0 {
				response.Validation(w, map[string]string{
					"track_serial": "Cannot disable serial tracking while open serial units exist.",
				})
				return
			}
		}
		if body.TrackLot != nil && !*body.TrackLot && curTrackLot {
			var openLots int
			if err := tx.QueryRow(r.Context(), `
				select count(*) from public.inv_lot_batches
				where tenant_id = $1 and item_id = $2 and qty_on_hand > 0`,
				tu.TenantID, id).Scan(&openLots); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to validate lot batches.", "ERR_INTERNAL")
				return
			}
			if openLots > 0 {
				response.Validation(w, map[string]string{
					"track_lot": "Cannot disable lot tracking while open lot batches exist.",
				})
				return
			}
		}

		tag, err := tx.Exec(r.Context(), `update public.inv_items set item_name=$1, purchase_price=$2, sales_price=$3, vip_price=$4, warranty_duration_months=$5, reorder_level=$6, track_serial=$7, track_lot=$8, track_inventory_qty=$9, status=$10, item_category_id=$13, updated_at=now()
			where id=$11 and tenant_id=$12 and deleted_at is null`,
			strings.TrimSpace(body.ItemName), body.PurchasePrice, body.SalesPrice, body.VipPrice, body.WarrantyDurationMonths, body.ReorderLevel, boolOrFalse(body.TrackSerial), boolOrFalse(body.TrackLot), boolOrFalse(body.TrackInventoryQty), defaultStatus(body.Status), id, tu.TenantID, body.ItemCategoryID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityItem, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.item.update", "inv_item", &id, nil, body)
		response.OK(w, map[string]any{
			"id": id,
			"warranty_duration_months": body.WarrantyDurationMonths,
			"reorder_level":            body.ReorderLevel,
			"custom_values":            attachCustom(r.Context(), pool, tu.TenantID, entityItem, id),
		}, "Updated.")
	}
}

func deleteItem(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_items", "inventory.item.delete", "inv_item")
}
