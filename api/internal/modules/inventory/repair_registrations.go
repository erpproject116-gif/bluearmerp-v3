package inventory

import (
	"context"
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

type RepairRegistration struct {
	ID                int64   `json:"id"`
	RegistrationDate  string  `json:"registration_date"`
	DateSeq           int     `json:"date_seq"`
	DateNoDisplay     string  `json:"date_no_display"`
	RegistrationNo    string  `json:"registration_no"`
	PartnerID         int64   `json:"partner_id"`
	PartnerName       string  `json:"partner_name,omitempty"`
	ItemID            *int64  `json:"item_id,omitempty"`
	ItemCode          string  `json:"item_code"`
	ItemName          string  `json:"item_name"`
	SerialNo          *string `json:"serial_no,omitempty"`
	IssueDescription  *string `json:"issue_description,omitempty"`
	Status            string  `json:"status"`
	RepairOrderID     *int64  `json:"repair_order_id,omitempty"`
	RepairOrderNo     *string `json:"repair_order_no,omitempty"`
	CreatedByUserID   *int64  `json:"created_by_user_id,omitempty"`
}

type repairRegistrationBody struct {
	RegistrationDate string  `json:"registration_date"`
	PartnerID      int64   `json:"partner_id"`
	ItemID         *int64  `json:"item_id"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	SerialNo       *string `json:"serial_no"`
	IssueDescription *string `json:"issue_description"`
	Status         string  `json:"status"`
}

type convertToRepairOrderBody struct {
	LocationID int64   `json:"location_id"`
	PicUserID  *int64  `json:"pic_user_id"`
	PicName    string  `json:"pic_name"`
}

type registrationStatusRow struct {
	ID               int64   `json:"id"`
	RegistrationDate string  `json:"registration_date"`
	DateNoDisplay    string  `json:"date_no_display"`
	RegistrationNo   string  `json:"registration_no"`
	PartnerName      string  `json:"partner_name"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	SerialNo         *string `json:"serial_no,omitempty"`
	IssueDescription *string `json:"issue_description,omitempty"`
	Status           string  `json:"status"`
	RepairOrderNo    *string `json:"repair_order_no,omitempty"`
}

type consumptionReportRow struct {
	ItemID   *int64  `json:"item_id,omitempty"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	TotalQty float64 `json:"total_qty"`
	LineCount int    `json:"line_count"`
}

func registerRepairRegistrationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/repair-registrations/preview-sequences", previewRepairRegistrationSequences(pool))
	r.Get("/repair-registrations/status-report", listRepairRegistrationStatusReport(pool))
	r.Get("/repair-registrations/consumption-report", listRepairConsumptionReport(pool))
	r.Get("/repair-registrations", listRepairRegistrations(pool))
	r.Post("/repair-registrations", createRepairRegistration(pool))
	r.Get("/repair-registrations/{id}", getRepairRegistration(pool))
	r.Patch("/repair-registrations/{id}", updateRepairRegistration(pool))
	r.Delete("/repair-registrations/{id}", deleteRepairRegistration(pool))
	r.Post("/repair-registrations/{id}/convert-to-repair-order", convertRepairRegistrationToOrder(pool))
}

func previewRepairRegistrationSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("registration_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		regDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"registration_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var registrationNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, registration_no from public.preview_repair_registration_sequences($1, $2::date)`,
			tu.TenantID, regDate).Scan(&dateSeq, &registrationNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":          dateSeq,
			"registration_no":   registrationNo,
			"date_no_display":   formatDateNo(regDate, dateSeq),
		}, "OK")
	}
}

func listRepairRegistrations(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"registration_date": "rr.registration_date",
		"registration_no":   "rr.registration_no",
		"partner_name":      "p.company_name",
		"item_code":         "rr.item_code",
		"status":            "rr.status",
		"created_at":        "rr.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "registration_date", allowed)
		offset := httputil.Offset(p)

		where := "rr.tenant_id = $1 and rr.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				rr.registration_no ilike $%d or rr.item_code ilike $%d or
				rr.item_name ilike $%d or p.company_name ilike $%d or coalesce(rr.serial_no, '') ilike $%d)`,
				argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "open" || p.Status == "converted" || p.Status == "closed" {
			where += fmt.Sprintf(" and rr.status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		order := orderSQL(p.Order)
		q := fmt.Sprintf(`
			select rr.id, rr.registration_date, rr.date_seq, rr.registration_no,
			  rr.partner_id, p.company_name, rr.item_id, rr.item_code, rr.item_name,
			  rr.serial_no, rr.issue_description, rr.status, rr.repair_order_id,
			  ro.repair_order_no, rr.created_by_user_id, count(*) over()
			from public.inv_repair_registrations rr
			join public.inv_partners p on p.id = rr.partner_id
			left join public.inv_repair_orders ro on ro.id = rr.repair_order_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list registrations.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []RepairRegistration
		var total int64
		for rows.Next() {
			var row RepairRegistration
			var regDate time.Time
			var totalCount int64
			if err := rows.Scan(&row.ID, &regDate, &row.DateSeq, &row.RegistrationNo,
				&row.PartnerID, &row.PartnerName, &row.ItemID, &row.ItemCode, &row.ItemName,
				&row.SerialNo, &row.IssueDescription, &row.Status, &row.RepairOrderID,
				&row.RepairOrderNo, &row.CreatedByUserID, &totalCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read registrations.", "ERR_INTERNAL")
				return
			}
			total = totalCount
			row.RegistrationDate = regDate.Format("2006-01-02")
			row.DateNoDisplay = formatDateNo(regDate, row.DateSeq)
			out = append(out, row)
		}
		if out == nil {
			out = []RepairRegistration{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getRepairRegistration(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		reg, err := loadRepairRegistration(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Registration not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, reg, "OK")
	}
}

func loadRepairRegistration(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (RepairRegistration, error) {
	var reg RepairRegistration
	var regDate time.Time
	err := pool.QueryRow(ctx, `
		select rr.id, rr.registration_date, rr.date_seq, rr.registration_no,
		  rr.partner_id, p.company_name, rr.item_id, rr.item_code, rr.item_name,
		  rr.serial_no, rr.issue_description, rr.status, rr.repair_order_id,
		  ro.repair_order_no, rr.created_by_user_id
		from public.inv_repair_registrations rr
		join public.inv_partners p on p.id = rr.partner_id
		left join public.inv_repair_orders ro on ro.id = rr.repair_order_id
		where rr.id = $1 and rr.tenant_id = $2 and rr.deleted_at is null`,
		id, tenantID).Scan(
		&reg.ID, &regDate, &reg.DateSeq, &reg.RegistrationNo,
		&reg.PartnerID, &reg.PartnerName, &reg.ItemID, &reg.ItemCode, &reg.ItemName,
		&reg.SerialNo, &reg.IssueDescription, &reg.Status, &reg.RepairOrderID,
		&reg.RepairOrderNo, &reg.CreatedByUserID,
	)
	if err != nil {
		return RepairRegistration{}, err
	}
	reg.RegistrationDate = regDate.Format("2006-01-02")
	reg.DateNoDisplay = formatDateNo(regDate, reg.DateSeq)
	return reg, nil
}

func createRepairRegistration(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body repairRegistrationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateRepairRegistrationBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		regDate, err := parseDate(body.RegistrationDate)
		if err != nil {
			response.Validation(w, map[string]string{"registration_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var registrationNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, registration_no from public.allocate_repair_registration_sequences($1, $2::date)`,
			tu.TenantID, regDate).Scan(&dateSeq, &registrationNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_repair_registrations (
			  tenant_id, registration_date, date_seq, registration_no,
			  partner_id, item_id, item_code, item_name, serial_no,
			  issue_description, status, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
			returning id`,
			tu.TenantID, regDate, dateSeq, registrationNo,
			body.PartnerID, body.ItemID, strings.TrimSpace(body.ItemCode), strings.TrimSpace(body.ItemName),
			body.SerialNo, body.IssueDescription, defaultRegistrationStatus(body.Status), tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert registration.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_registration.create", "inv_repair_registration", &id, nil, body)
		reg, _ := loadRepairRegistration(r.Context(), pool, tu.TenantID, id)
		response.OK(w, reg, "Created.")
	}
}

func updateRepairRegistration(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body repairRegistrationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateRepairRegistrationBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		regDate, err := parseDate(body.RegistrationDate)
		if err != nil {
			response.Validation(w, map[string]string{"registration_date": "Invalid date."})
			return
		}

		var currentStatus string
		err = pool.QueryRow(r.Context(),
			`select status from public.inv_repair_registrations where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&currentStatus)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Registration not found.", "ERR_NOT_FOUND")
			return
		}
		if currentStatus == "converted" {
			response.Validation(w, map[string]string{"status": "Converted registrations cannot be edited."})
			return
		}

		newStatus := defaultRegistrationStatus(body.Status)
		tag, err := pool.Exec(r.Context(), `
			update public.inv_repair_registrations set
			  registration_date = $1, partner_id = $2, item_id = $3,
			  item_code = $4, item_name = $5, serial_no = $6,
			  issue_description = $7, status = $8, updated_at = now()
			where id = $9 and tenant_id = $10 and deleted_at is null`,
			regDate, body.PartnerID, body.ItemID,
			strings.TrimSpace(body.ItemCode), strings.TrimSpace(body.ItemName), body.SerialNo,
			body.IssueDescription, newStatus, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Registration not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_registration.update", "inv_repair_registration", &id, nil, body)
		reg, _ := loadRepairRegistration(r.Context(), pool, tu.TenantID, id)
		response.OK(w, reg, "Updated.")
	}
}

func deleteRepairRegistration(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_repair_registrations", "inventory.repair_registration.delete", "inv_repair_registration")
}

func convertRepairRegistrationToOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body convertToRepairOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var reg RepairRegistration
		var regDate time.Time
		err = tx.QueryRow(r.Context(), `
			select rr.id, rr.registration_date, rr.date_seq, rr.registration_no,
			  rr.partner_id, p.company_name, rr.item_id, rr.item_code, rr.item_name,
			  rr.serial_no, rr.issue_description, rr.status, rr.repair_order_id
			from public.inv_repair_registrations rr
			join public.inv_partners p on p.id = rr.partner_id
			where rr.id = $1 and rr.tenant_id = $2 and rr.deleted_at is null
			for update`,
			id, tu.TenantID).Scan(
			&reg.ID, &regDate, &reg.DateSeq, &reg.RegistrationNo,
			&reg.PartnerID, &reg.PartnerName, &reg.ItemID, &reg.ItemCode, &reg.ItemName,
			&reg.SerialNo, &reg.IssueDescription, &reg.Status, &reg.RepairOrderID,
		)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Registration not found.", "ERR_NOT_FOUND")
			return
		}
		if reg.Status == "converted" && reg.RepairOrderID != nil {
			response.Validation(w, map[string]string{"status": "Already converted to a repair order."})
			return
		}

		locationID := body.LocationID
		if locationID <= 0 && reg.ItemID != nil {
			_ = tx.QueryRow(r.Context(),
				`select default_location_id from public.inv_items where id = $1 and tenant_id = $2`,
				*reg.ItemID, tu.TenantID).Scan(&locationID)
		}
		if locationID <= 0 {
			_ = tx.QueryRow(r.Context(), `
				select id from public.inv_locations
				where tenant_id = $1 and status = 'active' and deleted_at is null
				order by id limit 1`, tu.TenantID).Scan(&locationID)
		}
		if locationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Location is required."})
			return
		}

		orderDate := regDate
		var dateSeq int
		var repairOrderNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, repair_order_no from public.allocate_repair_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &repairOrderNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate repair order sequences.", "ERR_INTERNAL")
			return
		}

		picName := strings.TrimSpace(body.PicName)
		if picName == "" {
			picName = "—"
		}

		var orderID int64
		latestUpdate := fmt.Sprintf("Converted from registration %s", reg.RegistrationNo)
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_repair_orders (
			  tenant_id, order_date, date_seq, repair_order_no,
			  partner_id, pic_user_id, pic_name, location_id,
			  progress_status, latest_update, repair_details
			) values ($1,$2,$3,$4,$5,$6,$7,$8,'received',$9,$10)
			returning id`,
			tu.TenantID, orderDate, dateSeq, repairOrderNo,
			reg.PartnerID, body.PicUserID, picName, locationID,
			latestUpdate, reg.IssueDescription).Scan(&orderID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create repair order.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			insert into public.inv_repair_order_lines (
			  repair_order_id, line_no, item_id, item_code, item_name,
			  problem_issue, qty, serial_lot_no
			) values ($1, 1, $2, $3, $4, $5, 1, $6)`,
			orderID, reg.ItemID, reg.ItemCode, reg.ItemName, reg.IssueDescription, reg.SerialNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create repair order line.", "ERR_INTERNAL")
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.inv_repair_registrations
			set status = 'converted', repair_order_id = $1, updated_at = now()
			where id = $2 and tenant_id = $3`,
			orderID, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link registration.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to convert.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_registration.convert", "inv_repair_registration", &id, nil, map[string]any{
			"repair_order_id": orderID,
		})
		ro, _ := loadRepairOrder(r.Context(), pool, tu.TenantID, orderID)
		response.OK(w, ro, "Converted to repair order.")
	}
}

func listRepairRegistrationStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
		toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
		errs := map[string]string{}
		if fromStr == "" {
			errs["date_from"] = "Start date is required."
		}
		if toStr == "" {
			errs["date_to"] = "End date is required."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		from, err := parseDate(fromStr)
		if err != nil {
			response.Validation(w, map[string]string{"date_from": "Invalid date."})
			return
		}
		to, err := parseDate(toStr)
		if err != nil {
			response.Validation(w, map[string]string{"date_to": "Invalid date."})
			return
		}
		if from.After(to) {
			response.Validation(w, map[string]string{"date_to": "End date must be on or after start date."})
			return
		}

		p := httputil.ParseListParams(r, "registration_date", map[string]string{
			"registration_date": "rr.registration_date",
			"registration_no":   "rr.registration_no",
			"partner_name":      "p.company_name",
			"status":            "rr.status",
		})
		offset := httputil.Offset(p)

		where := "rr.tenant_id = $1 and rr.deleted_at is null and rr.registration_date between $2 and $3"
		args := []any{tu.TenantID, from, to}
		argN := 4

		if status := strings.TrimSpace(r.URL.Query().Get("status")); status == "open" || status == "converted" || status == "closed" {
			where += fmt.Sprintf(" and rr.status = $%d", argN)
			args = append(args, status)
			argN++
		}
		if id, ok := optionalInt64Query(r, "partner_id"); ok && id != nil {
			where += fmt.Sprintf(" and rr.partner_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		order := orderSQL(p.Order)
		q := fmt.Sprintf(`
			select rr.id, rr.registration_date, rr.date_seq, rr.registration_no,
			  p.company_name, rr.item_code, rr.item_name, rr.serial_no,
			  rr.issue_description, rr.status, ro.repair_order_no, count(*) over()
			from public.inv_repair_registrations rr
			join public.inv_partners p on p.id = rr.partner_id
			left join public.inv_repair_orders ro on ro.id = rr.repair_order_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []registrationStatusRow
		var total int64
		for rows.Next() {
			var row registrationStatusRow
			var regDate time.Time
			var dateSeq int
			var regNo string
			var totalCount int64
			if err := rows.Scan(&row.ID, &regDate, &dateSeq, &regNo,
				&row.PartnerName, &row.ItemCode, &row.ItemName, &row.SerialNo,
				&row.IssueDescription, &row.Status, &row.RepairOrderNo, &totalCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read report.", "ERR_INTERNAL")
				return
			}
			total = totalCount
			row.RegistrationDate = regDate.Format("2006-01-02")
			row.DateNoDisplay = formatDateNo(regDate, dateSeq)
			row.RegistrationNo = regNo
			out = append(out, row)
		}
		if out == nil {
			out = []registrationStatusRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listRepairConsumptionReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())

		where := `ro.tenant_id = $1 and ro.deleted_at is null and ln.qty > 0`
		args := []any{tu.TenantID}
		argN := 2

		if fromStr := strings.TrimSpace(r.URL.Query().Get("date_from")); fromStr != "" {
			from, err := parseDate(fromStr)
			if err != nil {
				response.Validation(w, map[string]string{"date_from": "Invalid date."})
				return
			}
			where += fmt.Sprintf(" and ro.order_date >= $%d", argN)
			args = append(args, from)
			argN++
		}
		if toStr := strings.TrimSpace(r.URL.Query().Get("date_to")); toStr != "" {
			to, err := parseDate(toStr)
			if err != nil {
				response.Validation(w, map[string]string{"date_to": "Invalid date."})
				return
			}
			where += fmt.Sprintf(" and ro.order_date <= $%d", argN)
			args = append(args, to)
			argN++
		}

		q := fmt.Sprintf(`
			select ln.item_id, ln.item_code, ln.item_name,
			  sum(ln.qty)::float8, count(*)::int
			from public.inv_repair_order_lines ln
			join public.inv_repair_orders ro on ro.id = ln.repair_order_id
			where %s
			group by ln.item_id, ln.item_code, ln.item_name
			order by ln.item_code`, where)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load consumption report.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []consumptionReportRow
		for rows.Next() {
			var row consumptionReportRow
			if err := rows.Scan(&row.ItemID, &row.ItemCode, &row.ItemName, &row.TotalQty, &row.LineCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read consumption report.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []consumptionReportRow{}
		}
		response.OK(w, out, "OK")
	}
}

func validateRepairRegistrationBody(b repairRegistrationBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.RegistrationDate) == "" {
		errs["registration_date"] = "Registration date is required."
	}
	if b.PartnerID <= 0 {
		errs["partner_id"] = "Customer is required."
	}
	if b.Status != "" && b.Status != "open" && b.Status != "converted" && b.Status != "closed" {
		errs["status"] = "Must be open, converted, or closed."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func defaultRegistrationStatus(s string) string {
	switch s {
	case "converted", "closed":
		return s
	default:
		return "open"
	}
}
