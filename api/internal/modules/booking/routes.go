package booking

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

type Resource struct {
	ID           int64  `json:"id"`
	Code         string `json:"code"`
	Name         string `json:"name"`
	ResourceType string `json:"resource_type"`
	IsActive     bool   `json:"is_active"`
	Notes        string `json:"notes,omitempty"`
}

type Service struct {
	ID              int64   `json:"id"`
	Code            string  `json:"code"`
	Name            string  `json:"name"`
	DurationMinutes int     `json:"duration_minutes"`
	BufferMinutes   int     `json:"buffer_minutes"`
	UnitPrice       float64 `json:"unit_price"`
	ItemID          *int64  `json:"item_id,omitempty"`
	IsActive        bool    `json:"is_active"`
	Notes           string  `json:"notes,omitempty"`
}

type Booking struct {
	ID           int64   `json:"id"`
	BookingNo    string  `json:"booking_no"`
	BookingDate  string  `json:"booking_date"`
	StartsAt     string  `json:"starts_at"`
	EndsAt       string  `json:"ends_at"`
	Status       string  `json:"status"`
	PartnerID    *int64  `json:"partner_id,omitempty"`
	PartnerName  string  `json:"partner_name,omitempty"`
	ResourceID   *int64  `json:"resource_id,omitempty"`
	ResourceName string  `json:"resource_name,omitempty"`
	ServiceID    *int64  `json:"service_id,omitempty"`
	ServiceName  string  `json:"service_name,omitempty"`
	Title        string  `json:"title"`
	Notes        string  `json:"notes,omitempty"`
	LocationID   *int64  `json:"location_id,omitempty"`
	QuotationID  *int64  `json:"quotation_id,omitempty"`
	UnitPrice    float64 `json:"unit_price,omitempty"`
}

type resourceBody struct {
	Code         string `json:"code"`
	Name         string `json:"name"`
	ResourceType string `json:"resource_type"`
	IsActive     *bool  `json:"is_active"`
	Notes        string `json:"notes"`
}

type serviceBody struct {
	Code            string  `json:"code"`
	Name            string  `json:"name"`
	DurationMinutes int     `json:"duration_minutes"`
	BufferMinutes   int     `json:"buffer_minutes"`
	UnitPrice       float64 `json:"unit_price"`
	ItemID          *int64  `json:"item_id"`
	IsActive        *bool   `json:"is_active"`
	Notes           string  `json:"notes"`
}

type bookingBody struct {
	StartsAt   string `json:"starts_at"`
	EndsAt     string `json:"ends_at"`
	Status     string `json:"status"`
	PartnerID  *int64 `json:"partner_id"`
	ResourceID *int64 `json:"resource_id"`
	ServiceID  *int64 `json:"service_id"`
	Title      string `json:"title"`
	Notes      string `json:"notes"`
	LocationID *int64 `json:"location_id"`
}

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/booking", func(br chi.Router) {
		br.Use(auth.RequirePermission("booking.bookings", auth.AccessRead))
		br.Get("/resources", listResources(pool))
		br.With(auth.RequirePermission("booking.resources", auth.AccessWrite)).Post("/resources", createResource(pool))
		br.With(auth.RequirePermission("booking.resources", auth.AccessWrite)).Patch("/resources/{id}", updateResource(pool))

		br.Get("/services", listServices(pool))
		br.With(auth.RequirePermission("booking.services", auth.AccessWrite)).Post("/services", createService(pool))
		br.With(auth.RequirePermission("booking.services", auth.AccessWrite)).Patch("/services/{id}", updateService(pool))

		br.Get("/bookings", listBookings(pool))
		br.Get("/bookings/{id}", getBooking(pool))
		br.With(auth.RequirePermission("booking.bookings_new", auth.AccessWrite)).Post("/bookings", createBooking(pool))
		br.With(auth.RequirePermission("booking.bookings", auth.AccessWrite)).Patch("/bookings/{id}", updateBooking(pool))
		br.With(auth.RequirePermission("booking.bookings", auth.AccessWrite)).Post("/bookings/{id}/to-quotation", bookingToQuotation(pool))
	})
}

func listResources(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name, resource_type, is_active, coalesce(notes, '')
			from public.book_resources where tenant_id = $1
			order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list resources.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Resource
		for rows.Next() {
			var row Resource
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.ResourceType, &row.IsActive, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read resources.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Resource{}
		}
		response.OK(w, out, "OK")
	}
}

func createResource(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body resourceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		rtype := strings.TrimSpace(body.ResourceType)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"code": "Code and name are required."})
			return
		}
		if rtype == "" {
			rtype = "staff"
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.book_resources (tenant_id, code, name, resource_type, is_active, notes)
			values ($1,$2,$3,$4,$5,$6) returning id`,
			tu.TenantID, code, name, rtype, active, strings.TrimSpace(body.Notes)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create resource.", "ERR_INTERNAL")
			return
		}
		response.OK(w, Resource{ID: id, Code: code, Name: name, ResourceType: rtype, IsActive: active, Notes: body.Notes}, "Created.")
	}
}

func updateResource(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body resourceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		rtype := strings.TrimSpace(body.ResourceType)
		if rtype == "" {
			rtype = "staff"
		}
		tag, err := pool.Exec(r.Context(), `
			update public.book_resources set
			  code=$2, name=$3, resource_type=$4, is_active=$5, notes=$6, updated_at=now()
			where id=$1 and tenant_id=$7`,
			id, strings.TrimSpace(body.Code), strings.TrimSpace(body.Name), rtype, active, strings.TrimSpace(body.Notes), tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Resource not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func listServices(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, code, name, duration_minutes, buffer_minutes, unit_price::float8,
			  item_id, is_active, coalesce(notes, '')
			from public.book_services where tenant_id = $1 order by name`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list services.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Service
		for rows.Next() {
			var row Service
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.DurationMinutes, &row.BufferMinutes,
				&row.UnitPrice, &row.ItemID, &row.IsActive, &row.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read services.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Service{}
		}
		response.OK(w, out, "OK")
	}
}

func createService(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body serviceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		if code == "" || name == "" {
			response.Validation(w, map[string]string{"code": "Code and name are required."})
			return
		}
		if body.DurationMinutes <= 0 {
			body.DurationMinutes = 60
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.book_services (
			  tenant_id, code, name, duration_minutes, buffer_minutes, unit_price, item_id, is_active, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
			tu.TenantID, code, name, body.DurationMinutes, body.BufferMinutes, body.UnitPrice, body.ItemID, active, strings.TrimSpace(body.Notes)).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create service.", "ERR_INTERNAL")
			return
		}
		response.OK(w, Service{
			ID: id, Code: code, Name: name, DurationMinutes: body.DurationMinutes, BufferMinutes: body.BufferMinutes,
			UnitPrice: body.UnitPrice, ItemID: body.ItemID, IsActive: active, Notes: body.Notes,
		}, "Created.")
	}
}

func updateService(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body serviceBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.DurationMinutes <= 0 {
			body.DurationMinutes = 60
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		tag, err := pool.Exec(r.Context(), `
			update public.book_services set
			  code=$2, name=$3, duration_minutes=$4, buffer_minutes=$5, unit_price=$6,
			  item_id=$7, is_active=$8, notes=$9, updated_at=now()
			where id=$1 and tenant_id=$10`,
			id, strings.TrimSpace(body.Code), strings.TrimSpace(body.Name), body.DurationMinutes, body.BufferMinutes,
			body.UnitPrice, body.ItemID, active, strings.TrimSpace(body.Notes), tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Service not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func listBookings(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "starts_at", map[string]string{
			"starts_at": "b.starts_at", "booking_no": "b.booking_no", "status": "b.status",
		})
		if p.Order == "" {
			p.Order = "asc"
		}
		offset := httputil.Offset(p)
		where := "b.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (b.booking_no ilike $%d or b.title ilike $%d or coalesce(p.company_name,'') ilike $%d)", n, n, n)
			args = append(args, "%"+q+"%")
			n++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and b.status = $%d", n)
			args = append(args, st)
			n++
		}
		if from := strings.TrimSpace(r.URL.Query().Get("date_from")); from != "" {
			where += fmt.Sprintf(" and b.starts_at >= $%d::timestamptz", n)
			args = append(args, from)
			n++
		}
		if to := strings.TrimSpace(r.URL.Query().Get("date_to")); to != "" {
			where += fmt.Sprintf(" and b.starts_at < ($%d::date + interval '1 day')", n)
			args = append(args, to)
			n++
		}
		countQ := fmt.Sprintf(`select count(*) from public.book_bookings b
			left join public.inv_partners p on p.id = b.partner_id where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count bookings.", "ERR_INTERNAL")
			return
		}
		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf(`
			select b.id, b.booking_no, b.booking_date::text, b.starts_at::text, b.ends_at::text, b.status,
			  b.partner_id, coalesce(p.company_name,''), b.resource_id, coalesce(r.name,''),
			  b.service_id, coalesce(s.name,''), b.title, coalesce(b.notes,''), b.location_id, b.quotation_id,
			  coalesce(s.unit_price,0)::float8
			from public.book_bookings b
			left join public.inv_partners p on p.id = b.partner_id
			left join public.book_resources r on r.id = b.resource_id
			left join public.book_services s on s.id = b.service_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, p.Sort, orderSQL(p.Order), len(args)-1, len(args))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list bookings.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []Booking
		for rows.Next() {
			var row Booking
			if err := rows.Scan(&row.ID, &row.BookingNo, &row.BookingDate, &row.StartsAt, &row.EndsAt, &row.Status,
				&row.PartnerID, &row.PartnerName, &row.ResourceID, &row.ResourceName,
				&row.ServiceID, &row.ServiceName, &row.Title, &row.Notes, &row.LocationID, &row.QuotationID, &row.UnitPrice); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read bookings.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []Booking{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func orderSQL(order string) string {
	if strings.EqualFold(order, "desc") {
		return "desc"
	}
	return "asc"
}

func getBooking(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		row, err := loadBooking(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Booking not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createBooking(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bookingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		title := strings.TrimSpace(body.Title)
		starts, err1 := time.Parse(time.RFC3339, strings.TrimSpace(body.StartsAt))
		ends, err2 := time.Parse(time.RFC3339, strings.TrimSpace(body.EndsAt))
		if title == "" {
			response.Validation(w, map[string]string{"title": "Title is required."})
			return
		}
		if err1 != nil || err2 != nil || !ends.After(starts) {
			response.Validation(w, map[string]string{"starts_at": "Provide valid starts_at/ends_at (RFC3339) with end after start."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "scheduled"
		}
		if err := validateStatusTransition("", status); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		if conflict, otherNo, err := resourceConflict(r.Context(), pool, tu.TenantID, body.ResourceID, starts, ends, 0); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check conflicts.", "ERR_INTERNAL")
			return
		} else if conflict {
			response.Err(w, http.StatusConflict, fmt.Sprintf("Resource conflicts with booking %s (including service buffer).", otherNo), "ERR_CONFLICT")
			return
		}
		bookingNo := fmt.Sprintf("BK-%s-%d", starts.Format("20060102"), time.Now().Unix()%100000)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.book_bookings (
			  tenant_id, booking_no, booking_date, starts_at, ends_at, status,
			  partner_id, resource_id, service_id, title, notes, location_id, created_by_user_id
			) values ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
			returning id`,
			tu.TenantID, bookingNo, starts.Format("2006-01-02"), starts.UTC(), ends.UTC(), status,
			body.PartnerID, body.ResourceID, body.ServiceID, title, strings.TrimSpace(body.Notes), body.LocationID, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create booking.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "booking.booking.create", "book_booking", &id, nil, body)
		row, _ := loadBooking(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func updateBooking(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body bookingBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		starts, err1 := time.Parse(time.RFC3339, strings.TrimSpace(body.StartsAt))
		ends, err2 := time.Parse(time.RFC3339, strings.TrimSpace(body.EndsAt))
		if err1 != nil || err2 != nil || !ends.After(starts) {
			response.Validation(w, map[string]string{"starts_at": "Provide valid starts_at/ends_at (RFC3339) with end after start."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if status == "" {
			status = "scheduled"
		}
		var prevStatus string
		err := pool.QueryRow(r.Context(), `
			select status from public.book_bookings where id=$1 and tenant_id=$2`, id, tu.TenantID,
		).Scan(&prevStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Booking not found.", "ERR_NOT_FOUND")
			return
		}
		if err := validateStatusTransition(prevStatus, status); err != nil {
			response.Validation(w, map[string]string{"status": err.Error()})
			return
		}
		if status != "cancelled" {
			if conflict, otherNo, err := resourceConflict(r.Context(), pool, tu.TenantID, body.ResourceID, starts, ends, id); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to check conflicts.", "ERR_INTERNAL")
				return
			} else if conflict {
				response.Err(w, http.StatusConflict, fmt.Sprintf("Resource conflicts with booking %s (including service buffer).", otherNo), "ERR_CONFLICT")
				return
			}
		}
		tag, err := pool.Exec(r.Context(), `
			update public.book_bookings set
			  booking_date=$2::date, starts_at=$3, ends_at=$4, status=$5,
			  partner_id=$6, resource_id=$7, service_id=$8, title=$9, notes=$10,
			  location_id=$11, updated_at=now()
			where id=$1 and tenant_id=$12`,
			id, starts.Format("2006-01-02"), starts.UTC(), ends.UTC(), status,
			body.PartnerID, body.ResourceID, body.ServiceID, strings.TrimSpace(body.Title), strings.TrimSpace(body.Notes),
			body.LocationID, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Booking not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "booking.booking.update", "book_booking", &id, map[string]any{"status": prevStatus}, body)
		row, _ := loadBooking(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}
