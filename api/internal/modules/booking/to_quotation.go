package booking

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func loadBooking(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (Booking, error) {
	var row Booking
	err := pool.QueryRow(ctx, `
		select b.id, b.booking_no, b.booking_date::text, b.starts_at::text, b.ends_at::text, b.status,
		  b.partner_id, coalesce(p.company_name,''), b.resource_id, coalesce(r.name,''),
		  b.service_id, coalesce(s.name,''), b.title, coalesce(b.notes,''), b.location_id, b.quotation_id,
		  coalesce(s.unit_price,0)::float8
		from public.book_bookings b
		left join public.inv_partners p on p.id = b.partner_id
		left join public.book_resources r on r.id = b.resource_id
		left join public.book_services s on s.id = b.service_id
		where b.id = $1 and b.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.BookingNo, &row.BookingDate, &row.StartsAt, &row.EndsAt, &row.Status,
		&row.PartnerID, &row.PartnerName, &row.ResourceID, &row.ResourceName,
		&row.ServiceID, &row.ServiceName, &row.Title, &row.Notes, &row.LocationID, &row.QuotationID, &row.UnitPrice)
	return row, err
}

// bookingToQuotation creates a draft quotation from a booking (commercial Load Slip bridge).
func bookingToQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		booking, err := loadBooking(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Booking not found.", "ERR_NOT_FOUND")
			return
		}
		if booking.QuotationID != nil && *booking.QuotationID > 0 {
			response.Err(w, http.StatusConflict, "Booking already has a quotation.", "ERR_CONFLICT")
			return
		}
		if booking.PartnerID == nil || *booking.PartnerID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "Customer is required before converting to quotation."})
			return
		}
		if booking.Status == "cancelled" {
			response.Validation(w, map[string]string{"status": "Cancelled bookings cannot convert to quotation."})
			return
		}

		var taxTypeID, currencyID int64
		if err := pool.QueryRow(r.Context(), `
			select id from public.quo_tax_types where tenant_id=$1 and status='active' order by sort_order, id limit 1`,
			tu.TenantID).Scan(&taxTypeID); err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "Configure an active tax type first."})
			return
		}
		if err := pool.QueryRow(r.Context(), `
			select id from public.quo_currencies where tenant_id=$1 and status='active' order by is_default desc, id limit 1`,
			tu.TenantID).Scan(&currencyID); err != nil {
			response.Validation(w, map[string]string{"currency_id": "Configure an active currency first."})
			return
		}

		var itemID *int64
		var unitPrice float64
		var lineName string
		var durationMin int
		if booking.ServiceID != nil {
			_ = pool.QueryRow(r.Context(), `
				select item_id, unit_price::float8, name, duration_minutes
				from public.book_services where id=$1 and tenant_id=$2`,
				*booking.ServiceID, tu.TenantID).Scan(&itemID, &unitPrice, &lineName, &durationMin)
		}
		if lineName == "" {
			lineName = booking.Title
		}
		if unitPrice <= 0 {
			unitPrice = booking.UnitPrice
		}
		qty := 1.0
		lineAmount := qty * unitPrice

		locationID := booking.LocationID
		if locationID == nil {
			var loc int64
			if err := pool.QueryRow(r.Context(), `
				select id from public.inv_locations
				where tenant_id=$1 and deleted_at is null and status='active'
				order by id limit 1`, tu.TenantID).Scan(&loc); err == nil {
				locationID = &loc
			}
		}

		orderDate := time.Now().UTC()
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var referenceNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, reference_no from public.allocate_quotation_sequences($1, $2::date)`,
			tu.TenantID, orderDate.Format("2006-01-02")).Scan(&dateSeq, &referenceNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate quotation number.", "ERR_INTERNAL")
			return
		}

		notes := fmt.Sprintf("From booking %s", booking.BookingNo)
		if booking.Notes != "" {
			notes = notes + "\n" + booking.Notes
		}

		var quotationID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.quo_quotations (
			  tenant_id, order_date, date_seq, reference_no,
			  tax_type_id, currency_id, partner_id, pic_user_id, pic_name,
			  location_id, notes, progress_status, subtotal, tax_total, grand_total, created_by_user_id
			) values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,'draft',$12,0,$12,$13)
			returning id`,
			tu.TenantID, orderDate.Format("2006-01-02"), dateSeq, referenceNo,
			taxTypeID, currencyID, *booking.PartnerID, tu.AppUserID, tu.FullName,
			locationID, notes, lineAmount, tu.AppUserID,
		).Scan(&quotationID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create quotation.", "ERR_INTERNAL")
			return
		}

		err = insertQuotationLine(r.Context(), tx, quotationID, itemID, lineName, qty, unitPrice, lineAmount)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create quotation line.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.book_bookings
			set quotation_id = $2,
			    status = case when status = 'scheduled' then 'confirmed' else status end,
			    updated_at = now()
			where id = $1 and tenant_id = $3`, id, quotationID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link quotation.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		row, _ := loadBooking(r.Context(), pool, tu.TenantID, id)
		response.OK(w, map[string]any{
			"booking":      row,
			"quotation_id": quotationID,
			"reference_no": referenceNo,
		}, "Quotation created from booking.")
	}
}

func insertQuotationLine(ctx context.Context, tx pgx.Tx, quotationID int64, itemID *int64, name string, qty, unitPrice, amount float64) error {
	_, err := tx.Exec(ctx, `
		insert into public.quo_quotation_lines (
		  quotation_id, line_no, item_id, item_code, item_name, description,
		  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total, remark
		) values ($1, 1, $2, '', $3, $3, $4, $5, $6, 0, $5, $6, 'Booking service')`,
		quotationID, itemID, name, qty, unitPrice, amount)
	return err
}
