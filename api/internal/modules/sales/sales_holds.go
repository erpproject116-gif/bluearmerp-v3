package sales

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxSalesHoldsPerUser = 5

type salesHoldRow struct {
	ID           int64          `json:"id"`
	HoldSlot     int            `json:"hold_slot"`
	PartnerID    *int64         `json:"partner_id,omitempty"`
	LocationID   *int64         `json:"location_id,omitempty"`
	CustomerName *string        `json:"customer_name,omitempty"`
	Amount       float64        `json:"amount"`
	HoldType     string         `json:"hold_type"`
	Payload      map[string]any `json:"payload"`
	CreatedAt    string         `json:"created_at"`
	UpdatedAt    string         `json:"updated_at"`
}

type upsertSalesHoldBody struct {
	HoldSlot     int            `json:"hold_slot"`
	PartnerID    *int64         `json:"partner_id"`
	LocationID   *int64         `json:"location_id"`
	CustomerName *string        `json:"customer_name"`
	Amount       float64        `json:"amount"`
	HoldType     string         `json:"hold_type"`
	Payload      map[string]any `json:"payload"`
}

func registerSalesHoldRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/holds", listSalesHolds(pool))
	r.Put("/holds/{slot}", upsertSalesHold(pool))
	r.Delete("/holds/{slot}", deleteSalesHold(pool))
}

func listSalesHolds(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, hold_slot, partner_id, location_id, customer_name, amount::float8,
			  hold_type, payload, created_at::text, updated_at::text
			from public.sa_sales_holds
			where tenant_id = $1 and created_by_user_id = $2
			order by hold_slot asc`, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales holds.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := make([]salesHoldRow, 0, maxSalesHoldsPerUser)
		for rows.Next() {
			var row salesHoldRow
			var payload []byte
			if err := rows.Scan(&row.ID, &row.HoldSlot, &row.PartnerID, &row.LocationID, &row.CustomerName,
				&row.Amount, &row.HoldType, &payload, &row.CreatedAt, &row.UpdatedAt); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales holds.", "ERR_INTERNAL")
				return
			}
			_ = json.Unmarshal(payload, &row.Payload)
			if row.Payload == nil {
				row.Payload = map[string]any{}
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func upsertSalesHold(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		slot, err := strconv.Atoi(chi.URLParam(r, "slot"))
		if err != nil || slot < 1 || slot > maxSalesHoldsPerUser {
			response.Validation(w, map[string]string{"hold_slot": fmt.Sprintf("Must be 1–%d.", maxSalesHoldsPerUser)})
			return
		}
		var body upsertSalesHoldBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.Payload == nil {
			response.Validation(w, map[string]string{"payload": "Hold payload is required."})
			return
		}
		holdType := body.HoldType
		if holdType == "" {
			holdType = "sale"
		}
		payloadJSON, err := json.Marshal(body.Payload)
		if err != nil {
			response.Validation(w, map[string]string{"payload": "Invalid payload."})
			return
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.sa_sales_holds (
			  tenant_id, hold_slot, created_by_user_id, partner_id, location_id,
			  customer_name, amount, hold_type, payload
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
			on conflict (tenant_id, created_by_user_id, hold_slot) do update set
			  partner_id = excluded.partner_id,
			  location_id = excluded.location_id,
			  customer_name = excluded.customer_name,
			  amount = excluded.amount,
			  hold_type = excluded.hold_type,
			  payload = excluded.payload,
			  updated_at = now()
			returning id`,
			tu.TenantID, slot, tu.AppUserID, body.PartnerID, body.LocationID,
			body.CustomerName, body.Amount, holdType, payloadJSON,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save sales hold.", "ERR_INTERNAL")
			return
		}

		var row salesHoldRow
		var payload []byte
		err = pool.QueryRow(r.Context(), `
			select id, hold_slot, partner_id, location_id, customer_name, amount::float8,
			  hold_type, payload, created_at::text, updated_at::text
			from public.sa_sales_holds where id = $1`, id).Scan(
			&row.ID, &row.HoldSlot, &row.PartnerID, &row.LocationID, &row.CustomerName,
			&row.Amount, &row.HoldType, &payload, &row.CreatedAt, &row.UpdatedAt)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load sales hold.", "ERR_INTERNAL")
			return
		}
		_ = json.Unmarshal(payload, &row.Payload)
		response.OK(w, row, "Saved.")
	}
}

func deleteSalesHold(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		slot, err := strconv.Atoi(chi.URLParam(r, "slot"))
		if err != nil || slot < 1 || slot > maxSalesHoldsPerUser {
			response.Validation(w, map[string]string{"hold_slot": fmt.Sprintf("Must be 1–%d.", maxSalesHoldsPerUser)})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.sa_sales_holds
			where tenant_id = $1 and created_by_user_id = $2 and hold_slot = $3`,
			tu.TenantID, tu.AppUserID, slot)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete sales hold.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Hold slot is empty.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"hold_slot": slot}, "Deleted.")
	}
}
