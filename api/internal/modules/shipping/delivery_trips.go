package shipping

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type DeliveryTrip struct {
	ID         int64   `json:"id"`
	TripDate   string  `json:"trip_date"`
	TripNo     string  `json:"trip_no"`
	DriverName *string `json:"driver_name,omitempty"`
	VehicleNo  *string `json:"vehicle_no,omitempty"`
	Status     string  `json:"status"`
	Notes      *string `json:"notes,omitempty"`
}

type deliveryTripBody struct {
	TripDate   string  `json:"trip_date"`
	DriverName *string `json:"driver_name"`
	VehicleNo  *string `json:"vehicle_no"`
	Status     string  `json:"status"`
	Notes      *string `json:"notes"`
}

func listDeliveryTrips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "trip_date", map[string]string{"trip_date": "t.trip_date"})
		offset := httputil.Offset(p)
		rows, err := pool.Query(r.Context(), `
			select id, trip_date::text, trip_no, driver_name, vehicle_no, status, notes,
			  count(*) over()
			from public.dl_delivery_trips
			where tenant_id = $1
			order by trip_date desc, trip_no desc
			limit $2 offset $3`, tu.TenantID, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list delivery trips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []DeliveryTrip
		var total int64
		for rows.Next() {
			var row DeliveryTrip
			if err := rows.Scan(&row.ID, &row.TripDate, &row.TripNo, &row.DriverName, &row.VehicleNo, &row.Status, &row.Notes, &total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read delivery trips.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []DeliveryTrip{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getDeliveryTrip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var row DeliveryTrip
		err = pool.QueryRow(r.Context(), `
			select id, trip_date::text, trip_no, driver_name, vehicle_no, status, notes
			from public.dl_delivery_trips
			where id = $1 and tenant_id = $2`, id, tu.TenantID,
		).Scan(&row.ID, &row.TripDate, &row.TripNo, &row.DriverName, &row.VehicleNo, &row.Status, &row.Notes)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Delivery trip not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createDeliveryTrip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body deliveryTripBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tripDate := strings.TrimSpace(body.TripDate)
		if tripDate == "" {
			tripDate = time.Now().Format("2006-01-02")
		}
		status, ok := NormalizeDeliveryTripStatus(body.Status)
		if !ok {
			response.Validation(w, map[string]string{"status": "Must be planned, in_progress, completed, or cancelled."})
			return
		}
		var seq int
		_ = pool.QueryRow(r.Context(), `
			select count(*) + 1 from public.dl_delivery_trips
			where tenant_id = $1 and trip_date = $2::date`, tu.TenantID, tripDate).Scan(&seq)
		tripNo := fmt.Sprintf("TR-%s-%03d", strings.ReplaceAll(tripDate, "-", ""), seq)

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.dl_delivery_trips (tenant_id, trip_date, trip_no, driver_name, vehicle_no, status, notes, created_by_user_id)
			values ($1, $2::date, $3, $4, $5, $6, $7, $8)
			returning id`,
			tu.TenantID, tripDate, tripNo, body.DriverName, body.VehicleNo, status, body.Notes, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create delivery trip.", "ERR_INTERNAL")
			return
		}
		row := DeliveryTrip{ID: id, TripDate: tripDate, TripNo: tripNo, DriverName: body.DriverName, VehicleNo: body.VehicleNo, Status: status, Notes: body.Notes}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.trip.create", "dl_delivery_trip", &id, nil, body)
		response.OK(w, row, "Created.")
	}
}

func patchDeliveryTrip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body deliveryTripBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status, ok := NormalizeDeliveryTripStatus(body.Status)
		if !ok {
			response.Validation(w, map[string]string{"status": "Must be planned, in_progress, completed, or cancelled."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.dl_delivery_trips set
			  driver_name = $1, vehicle_no = $2, status = $3, notes = $4, updated_at = now()
			where id = $5 and tenant_id = $6`,
			body.DriverName, body.VehicleNo, status, body.Notes, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Delivery trip not found.", "ERR_NOT_FOUND")
			return
		}
		getDeliveryTrip(pool)(w, r)
	}
}

func deleteDeliveryTrip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.dl_delivery_trips where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Delivery trip not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "shipping.trip.delete", "dl_delivery_trip", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
