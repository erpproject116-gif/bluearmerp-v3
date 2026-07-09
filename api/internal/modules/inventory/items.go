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
	ID                     int64              `json:"id"`
	ItemCode               string             `json:"item_code"`
	ItemName               string             `json:"item_name"`
	SpecName               string             `json:"spec_name,omitempty"`
	Unit                   string             `json:"unit,omitempty"`
	ItemCategory           string             `json:"item_category,omitempty"`
	ItemType               string             `json:"item_type,omitempty"`
	ProductionProcess      *string            `json:"production_process,omitempty"`
	PurchasePrice          float64            `json:"purchase_price"`
	SalesPrice             float64            `json:"sales_price"`
	VipPrice               float64            `json:"vip_price"`
	PriceLevels            map[string]float64 `json:"price_levels,omitempty"`
	SafetyStockByDoc       map[string]float64 `json:"safety_stock_by_doc,omitempty"`
	OePrice                float64            `json:"oe_price"`
	StandardCosts          map[string]float64 `json:"standard_costs,omitempty"`
	WarrantyDurationMonths *int               `json:"warranty_duration_months,omitempty"`
	ReorderLevel           *float64           `json:"reorder_level,omitempty"`
	TrackSerial            bool               `json:"track_serial"`
	TrackLot               bool               `json:"track_lot"`
	SerialPolicy           string             `json:"serial_policy"`
	LotPolicy              string             `json:"lot_policy"`
	TrackInventoryQty      bool               `json:"track_inventory_qty"`
	Status                 string             `json:"status"`
	ItemCategoryID         *int64             `json:"item_category_id,omitempty"`
	ItemCategoryName       string             `json:"item_category_name,omitempty"`
	CustomValues           map[string]any     `json:"custom_values,omitempty"`
}

type itemBody struct {
	ItemName               string             `json:"item_name"`
	SpecName               *string            `json:"spec_name"`
	Unit                   *string            `json:"unit"`
	ItemCategory           *string            `json:"item_category"`
	ItemType               *string            `json:"item_type"`
	ProductionProcess      *string            `json:"production_process"`
	PurchasePrice          float64            `json:"purchase_price"`
	SalesPrice             float64            `json:"sales_price"`
	VipPrice               float64            `json:"vip_price"`
	PriceLevels            map[string]float64 `json:"price_levels"`
	SafetyStockByDoc       map[string]float64 `json:"safety_stock_by_doc"`
	OePrice                *float64           `json:"oe_price"`
	StandardCosts          map[string]float64 `json:"standard_costs"`
	WarrantyDurationMonths *int               `json:"warranty_duration_months"`
	ReorderLevel           *float64           `json:"reorder_level"`
	TrackSerial            *bool              `json:"track_serial"`
	TrackLot               *bool              `json:"track_lot"`
	SerialPolicy           *string            `json:"serial_policy"`
	LotPolicy              *string            `json:"lot_policy"`
	TrackInventoryQty      *bool              `json:"track_inventory_qty"`
	Status                 string             `json:"status"`
	ItemCategoryID         *int64             `json:"item_category_id"`
	CustomValues           map[string]any     `json:"custom_values"`
}

func registerItemRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/items/next-code", nextCodeHandler(pool, "item"))
	r.Get("/items/import-template", itemImportTemplateHandler())
	r.Get("/items/export", exportItemsCSV(pool))
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
		extra := parseItemListFilters(r)
		where, args := buildItemListWhere(tu.TenantID, p, extra)
		orderCol := "i.item_code"
		if col, ok := allowed[p.Sort]; ok {
			orderCol = "i." + col
		}
		q := fmt.Sprintf(`select i.id, i.item_code, i.item_name, coalesce(i.spec_name, ''), coalesce(i.unit, ''),
			coalesce(i.item_category, 'merchandise'), coalesce(i.item_type, 'item'), i.production_process,
			i.purchase_price::float8, i.sales_price::float8, i.vip_price::float8,
			i.price_levels, i.safety_stock_by_doc, i.oe_price::float8, i.standard_costs,
			i.warranty_duration_months, i.reorder_level::float8, i.track_serial, i.track_lot, i.serial_policy, i.lot_policy, i.track_inventory_qty, i.status, i.item_category_id,
			coalesce(cat.name, ''), count(*) over()
			from public.inv_items i
			left join public.inv_item_categories cat on cat.id = i.item_category_id and cat.tenant_id = i.tenant_id
			where %s order by %s %s limit $%d offset $%d`,
			where, orderCol, orderSQL(p.Order), len(args)+1, len(args)+2)
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
			var priceLevelsJSON, safetyJSON, standardJSON []byte
			if err := rows.Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.Unit,
				&row.ItemCategory, &row.ItemType, &row.ProductionProcess,
				&row.PurchasePrice, &row.SalesPrice, &row.VipPrice,
				&priceLevelsJSON, &safetyJSON, &row.OePrice, &standardJSON,
				&row.WarrantyDurationMonths, &row.ReorderLevel, &row.TrackSerial, &row.TrackLot, &row.SerialPolicy, &row.LotPolicy, &row.TrackInventoryQty, &row.Status, &row.ItemCategoryID,
				&row.ItemCategoryName, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read.", "ERR_INTERNAL")
				return
			}
			row.PriceLevels = unmarshalJSONFloatMap(priceLevelsJSON)
			row.SafetyStockByDoc = unmarshalJSONFloatMap(safetyJSON)
			row.StandardCosts = unmarshalJSONFloatMap(standardJSON)
			row.SerialPolicy = NormalizeTrackingPolicy(row.SerialPolicy)
			row.LotPolicy = NormalizeTrackingPolicy(row.LotPolicy)
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
			priceLevels := sanitizePriceLevels(body.PriceLevels)
			safetyStock := sanitizeSafetyStockByDoc(body.SafetyStockByDoc)
			priceJSON, _ := marshalJSONMap(priceLevels)
			safetyJSON, _ := marshalJSONMap(safetyStock)
			serialPolicy := SanitizeTrackingPolicy(body.SerialPolicy)
			lotPolicy := SanitizeTrackingPolicy(body.LotPolicy)
			if !boolOrFalse(body.TrackSerial) {
				serialPolicy = TrackingPolicyRequired
			}
			if !boolOrFalse(body.TrackLot) {
				lotPolicy = TrackingPolicyRequired
			}
			specName, unit, itemCategory, itemType, productionProcess, oePrice, standardCosts := itemBodyScalars(body)
			standardJSON, _ := marshalJSONMap(standardCosts)
			err := tx.QueryRow(ctx, `insert into public.inv_items (tenant_id, item_code, item_name, spec_name, unit, item_category, item_type, production_process, purchase_price, sales_price, vip_price, price_levels, safety_stock_by_doc, oe_price, standard_costs, warranty_duration_months, reorder_level, track_serial, track_lot, serial_policy, lot_policy, track_inventory_qty, status, item_category_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
				returning id, item_code, item_name, coalesce(spec_name,''), coalesce(unit,''), coalesce(item_category,'merchandise'), coalesce(item_type,'item'), production_process, purchase_price::float8, sales_price::float8, vip_price::float8, price_levels, safety_stock_by_doc, oe_price::float8, standard_costs, warranty_duration_months, reorder_level::float8, track_serial, track_lot, serial_policy, lot_policy, track_inventory_qty, status, item_category_id`,
				tu.TenantID, code, strings.TrimSpace(body.ItemName), specName, unit, itemCategory, itemType, productionProcess, body.PurchasePrice, body.SalesPrice, body.VipPrice, priceJSON, safetyJSON, oePrice, standardJSON, body.WarrantyDurationMonths, body.ReorderLevel, boolOrFalse(body.TrackSerial), boolOrFalse(body.TrackLot), serialPolicy, lotPolicy, boolOrFalse(body.TrackInventoryQty), defaultStatus(body.Status), body.ItemCategoryID).
				Scan(&row.ID, &row.ItemCode, &row.ItemName, &row.SpecName, &row.Unit, &row.ItemCategory, &row.ItemType, &row.ProductionProcess, &row.PurchasePrice, &row.SalesPrice, &row.VipPrice, &priceJSON, &safetyJSON, &row.OePrice, &standardJSON, &row.WarrantyDurationMonths, &row.ReorderLevel, &row.TrackSerial, &row.TrackLot, &row.SerialPolicy, &row.LotPolicy, &row.TrackInventoryQty, &row.Status, &row.ItemCategoryID)
			row.PriceLevels = unmarshalJSONFloatMap(priceJSON)
			row.SafetyStockByDoc = unmarshalJSONFloatMap(safetyJSON)
			row.StandardCosts = unmarshalJSONFloatMap(standardJSON)
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

		priceLevels := sanitizePriceLevels(body.PriceLevels)
		safetyStock := sanitizeSafetyStockByDoc(body.SafetyStockByDoc)
		priceJSON, _ := marshalJSONMap(priceLevels)
		safetyJSON, _ := marshalJSONMap(safetyStock)

		serialPolicy := SanitizeTrackingPolicy(body.SerialPolicy)
		lotPolicy := SanitizeTrackingPolicy(body.LotPolicy)
		if !boolOrFalse(body.TrackSerial) {
			serialPolicy = TrackingPolicyRequired
		}
		if !boolOrFalse(body.TrackLot) {
			lotPolicy = TrackingPolicyRequired
		}

		specName, unit, itemCategory, itemType, productionProcess, oePrice, standardCosts := itemBodyScalars(body)
		standardJSON, _ := marshalJSONMap(standardCosts)

		tag, err := tx.Exec(r.Context(), `update public.inv_items set item_name=$1, spec_name=$2, unit=$3, item_category=$4, item_type=$5, production_process=$6, purchase_price=$7, sales_price=$8, vip_price=$9, price_levels=$10, safety_stock_by_doc=$11, oe_price=$12, standard_costs=$13, warranty_duration_months=$14, reorder_level=$15, track_serial=$16, track_lot=$17, serial_policy=$18, lot_policy=$19, track_inventory_qty=$20, status=$21, item_category_id=$24, updated_at=now()
			where id=$22 and tenant_id=$23 and deleted_at is null`,
			strings.TrimSpace(body.ItemName), specName, unit, itemCategory, itemType, productionProcess, body.PurchasePrice, body.SalesPrice, body.VipPrice, priceJSON, safetyJSON, oePrice, standardJSON, body.WarrantyDurationMonths, body.ReorderLevel, boolOrFalse(body.TrackSerial), boolOrFalse(body.TrackLot), serialPolicy, lotPolicy, boolOrFalse(body.TrackInventoryQty), defaultStatus(body.Status), id, tu.TenantID, body.ItemCategoryID)
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
			"id":                       id,
			"warranty_duration_months": body.WarrantyDurationMonths,
			"reorder_level":            body.ReorderLevel,
			"price_levels":             priceLevels,
			"safety_stock_by_doc":      safetyStock,
			"serial_policy":            serialPolicy,
			"lot_policy":               lotPolicy,
			"custom_values":            attachCustom(r.Context(), pool, tu.TenantID, entityItem, id),
		}, "Updated.")
	}
}

func deleteItem(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_items", "inventory.item.delete", "inv_item")
}

func itemBodyScalars(body itemBody) (specName, unit, itemCategory, itemType string, productionProcess *string, oePrice float64, standardCosts map[string]float64) {
	specName = strings.TrimSpace(ptrStr(body.SpecName))
	unit = strings.TrimSpace(ptrStr(body.Unit))
	itemCategory = strings.TrimSpace(ptrStr(body.ItemCategory))
	if itemCategory == "" {
		itemCategory = "merchandise"
	}
	itemType = strings.TrimSpace(ptrStr(body.ItemType))
	if itemType == "" {
		itemType = "item"
	}
	productionProcess = body.ProductionProcess
	if productionProcess != nil && strings.TrimSpace(*productionProcess) == "" {
		productionProcess = nil
	}
	oePrice = 0
	if body.OePrice != nil {
		oePrice = *body.OePrice
	}
	standardCosts = sanitizeStandardCosts(body.StandardCosts)
	return
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
