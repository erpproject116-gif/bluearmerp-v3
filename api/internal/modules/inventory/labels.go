package inventory

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/pdf"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/processpolicy"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func registerLabelRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.labels_print", "read")).Get("/labels/container", printContainerLabel(pool))
}

func printContainerLabel(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		lotID, err := strconv.ParseInt(r.URL.Query().Get("lot_batch_id"), 10, 64)
		if err != nil || lotID <= 0 {
			response.Validation(w, map[string]string{"lot_batch_id": "Valid lot batch id is required."})
			return
		}

		var lotNo, itemCode, itemName, locationName string
		var qty float64
		var expiry *string
		var receivedAt *string
		err = pool.QueryRow(r.Context(), `
			select lb.lot_no, i.item_code, i.item_name, loc.location_name,
			  lb.qty_on_hand::float8, lb.expiry_date::text,
			  to_char(lb.created_at, 'YYYY-MM-DD')
			from public.inv_lot_batches lb
			join public.inv_items i on i.id = lb.item_id
			join public.inv_locations loc on loc.id = lb.location_id
			where lb.id = $1 and lb.tenant_id = $2`, lotID, tu.TenantID).Scan(
			&lotNo, &itemCode, &itemName, &locationName, &qty, &expiry, &receivedAt)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Lot batch not found.", "ERR_NOT_FOUND")
			return
		}

		_, _ = pool.Exec(r.Context(), `
			insert into public.inv_label_sequences (tenant_id, sequence_key, last_value)
			values ($1, 'lot_container', 1)
			on conflict (tenant_id, sequence_key)
			do update set last_value = inv_label_sequences.last_value + 1, updated_at = now()`,
			tu.TenantID)

		fields := []pdf.PartyField{
			{Label: "Item", Value: fmt.Sprintf("%s — %s", itemCode, itemName)},
			{Label: "Net qty", Value: fmt.Sprintf("%.3f", qty)},
			{Label: "Location", Value: locationName},
			{Label: "Barcode", Value: lotNo},
		}
		if expiry != nil && *expiry != "" {
			fields = append(fields, pdf.PartyField{Label: "Expiry", Value: *expiry})
		}
		if receivedAt != nil && *receivedAt != "" {
			fields = append(fields, pdf.PartyField{Label: "Received", Value: *receivedAt})
		}

		doc := pdf.NewDocLayout()
		doc.RenderHeader("Inventory label", lotNo, itemName)
		doc.RenderParty("Lot details", fields)

		bytes, err := doc.Bytes()
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to render label.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "application/pdf")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="label-%s.pdf"`, lotNo))
		_, _ = w.Write(bytes)
	}
}

func suggestLotBatches(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		itemID, err := strconv.ParseInt(r.URL.Query().Get("item_id"), 10, 64)
		if err != nil || itemID <= 0 {
			response.Validation(w, map[string]string{"item_id": "Item is required."})
			return
		}
		locationID, err := strconv.ParseInt(r.URL.Query().Get("location_id"), 10, 64)
		if err != nil || locationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Location is required."})
			return
		}
		qty, _ := strconv.ParseFloat(r.URL.Query().Get("qty"), 64)
		if qty <= 0 {
			qty = 1
		}

		settings, err := LoadItemTrackingSettings(r.Context(), pool, tu.TenantID, itemID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Item not found.", "ERR_NOT_FOUND")
			return
		}
		pol, _ := processpolicy.Load(r.Context(), pool, tu.TenantID)
		method := ResolveLotAllocationMethod(settings.LotAllocationMethod, pol.InventoryDefaultLotAllocation)

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to suggest lots.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		suggestions, err := SuggestLots(r.Context(), tx, tu.TenantID, itemID, locationID, qty, method, pol.InventoryBlockExpiredLotSales)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to suggest lots.", "ERR_INTERNAL")
			return
		}
		_ = tx.Rollback(r.Context())

		if suggestions == nil {
			suggestions = []LotAllocation{}
		}
		response.OK(w, map[string]any{
			"method":      method,
			"suggestions": suggestions,
		}, "OK")
	}
}
