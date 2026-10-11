package services

import (
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entitySlip = "svc_load_slip"

type slipItemIn struct {
	EquipmentID int64   `json:"equipment_id"`
	Qty         float64 `json:"qty"`
	Condition   string  `json:"condition"`
}

func listSlips(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, slip_no, order_date::text, slip_type, status, origin_location_id, destination_location_id, job_id, row_version
			from public.svc_load_slips
			where tenant_id = $1 and deleted_at is null
			order by order_date desc, id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list slips.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var id, origin int64
			var dest, jobID *int64
			var no, date, kind, status string
			var version int
			if err := rows.Scan(&id, &no, &date, &kind, &status, &origin, &dest, &jobID, &version); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to list slips.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": id, "slip_no": no, "order_date": date, "slip_type": kind, "status": status,
				"origin_location_id": origin, "destination_location_id": dest, "job_id": jobID, "row_version": version,
			})
		}
		response.OK(w, out, "OK")
	}
}

func getSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		slip, err := loadSlip(r, pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Slip not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, slip, "OK")
	}
}

func loadSlip(r *http.Request, pool *pgxpool.Pool, tenantID, id int64) (map[string]any, error) {
	var origin int64
	var dest, jobID, partnerID *int64
	var no, date, kind, status, method, driver, remarks, recipient string
	var version int
	err := pool.QueryRow(r.Context(), `
		select slip_no, order_date::text, slip_type, status, origin_location_id, destination_location_id,
		  job_id, partner_id, method, driver_name, remarks, recipient_name, row_version
		from public.svc_load_slips
		where id = $1 and tenant_id = $2 and deleted_at is null`, id, tenantID).Scan(
		&no, &date, &kind, &status, &origin, &dest, &jobID, &partnerID, &method, &driver, &remarks, &recipient, &version)
	if err != nil {
		return nil, err
	}
	rows, err := pool.Query(r.Context(), `
		select id, equipment_id, serial_no, is_serialized, qty::float8, condition
		from public.svc_load_slip_items where tenant_id = $1 and slip_id = $2 order by id`, tenantID, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []map[string]any{}
	for rows.Next() {
		var itemID, equipmentID int64
		var serial, condition string
		var serialized bool
		var qty float64
		if err := rows.Scan(&itemID, &equipmentID, &serial, &serialized, &qty, &condition); err != nil {
			return nil, err
		}
		items = append(items, map[string]any{
			"id": itemID, "equipment_id": equipmentID, "serial_no": serial,
			"is_serialized": serialized, "qty": qty, "condition": condition,
		})
	}
	vals, _ := customfields.LoadValues(r.Context(), pool, tenantID, entitySlip, id)
	return map[string]any{
		"id": id, "slip_no": no, "order_date": date, "slip_type": kind, "status": status,
		"origin_location_id": origin, "destination_location_id": dest, "job_id": jobID,
		"partner_id": partnerID, "method": method, "driver_name": driver, "remarks": remarks,
		"recipient_name": recipient, "row_version": version, "items": items, "custom_values": vals,
	}, nil
}

func createSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			JobID         *int64         `json:"job_id"`
			SlipType      string         `json:"slip_type"`
			OriginID      int64          `json:"origin_location_id"`
			DestinationID *int64         `json:"destination_location_id"`
			PartnerID     *int64         `json:"partner_id"`
			OrderDate     string         `json:"order_date"`
			Method        string         `json:"method"`
			DriverName    string         `json:"driver_name"`
			Remarks       string         `json:"remarks"`
			RecipientName string         `json:"recipient_name"`
			Items         []slipItemIn   `json:"items"`
			CustomValues  map[string]any `json:"custom_values"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		switch body.SlipType {
		case "receiving", "internal_transfer", "outbound", "release":
		default:
			response.Validation(w, map[string]string{"slip_type": "Unknown slip type."})
			return
		}
		if err := assertLocation(r.Context(), pool, tu, body.OriginID); err != nil {
			branchDenied(w, err)
			return
		}
		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Use YYYY-MM-DD."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the slip.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if err := ensureFoundation(r.Context(), tx, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to prepare services.", "ERR_INTERNAL")
			return
		}
		dateSeq, docNo, err := allocate(r.Context(), tx, "public.allocate_svc_load_slip_sequences", tu.TenantID, orderDate)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to number the slip.", "ERR_INTERNAL")
			return
		}
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.svc_load_slips (
			  tenant_id, job_id, slip_no, order_date, date_seq, slip_type, origin_location_id,
			  destination_location_id, partner_id, method, driver_name, remarks, recipient_name, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id`,
			tu.TenantID, int64OrNil(body.JobID), docNo, orderDate, dateSeq, body.SlipType, body.OriginID,
			int64OrNil(body.DestinationID), int64OrNil(body.PartnerID), body.Method, body.DriverName,
			body.Remarks, body.RecipientName, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the slip.", "ERR_INTERNAL")
			return
		}
		for _, item := range body.Items {
			if err := insertSlipItem(r, tx, tu.TenantID, id, item); err != nil {
				response.Validation(w, map[string]string{"items": err.Error()})
				return
			}
		}
		if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, entitySlip, id, body.CustomValues); len(cerrs) > 0 {
			response.Validation(w, cerrs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save the slip.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "slip_no": docNo}, "Created.")
	}
}

func insertSlipItem(r *http.Request, tx pgx.Tx, tenantID, slipID int64, item slipItemIn) error {
	var serial string
	var serialized bool
	var inCustody float64
	err := tx.QueryRow(r.Context(), `
		select serial_no, is_serialized, qty_in_custody::float8
		from public.svc_customer_equipment
		where id = $1 and tenant_id = $2 and deleted_at is null
		for update`, item.EquipmentID, tenantID).Scan(&serial, &serialized, &inCustody)
	if err != nil {
		return errEquipmentMissing
	}
	if err := validateSlipItemQty(serialized, item.Qty); err != nil {
		return err
	}
	_, err = tx.Exec(r.Context(), `
		insert into public.svc_load_slip_items (
		  tenant_id, slip_id, equipment_id, serial_no, is_serialized, qty, condition
		) values ($1,$2,$3,$4,$5,$6,$7)`,
		tenantID, slipID, item.EquipmentID, serial, serialized, item.Qty, item.Condition)
	return err
}

func submitSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return slipStatus(pool, "draft", "for_approval")
}

func approveSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return slipStatus(pool, "for_approval", "approved")
}

func slipStatus(pool *pgxpool.Pool, from, to string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_load_slips
			set status = $4, row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and status = $3 and deleted_at is null`,
			id, tu.TenantID, from, to)
		if err != nil || tag.RowsAffected() != 1 {
			response.Err(w, http.StatusConflict, "The slip is not in the expected status.", "ERR_CONFLICT")
			return
		}
		_ = insertEvent(r.Context(), pool, tu.TenantID, "svc_load_slip", id, "status", from, to, tu.AppUserID, "")
		response.OK(w, map[string]any{"id": id, "status": to}, "Updated.")
	}
}

func dispatchSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var origin int64
		var status string
		err := pool.QueryRow(r.Context(), `
			select origin_location_id, status from public.svc_load_slips
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&origin, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Slip not found.", "ERR_NOT_FOUND")
			return
		}
		if err := assertLocation(r.Context(), pool, tu, origin); err != nil {
			if authErr := authorizeSlipDispatch(false); authErr != nil {
				branchDenied(w, authErr)
				return
			}
		}
		if status != "approved" {
			response.Err(w, http.StatusConflict, "Approve the slip before dispatch.", "ERR_CONFLICT")
			return
		}
		if err := moveSlipCustody(r, pool, tu.TenantID, tu.AppUserID, id, "transfer_dispatch", "in_transit", false); err != nil {
			response.Err(w, http.StatusConflict, err.Error(), "ERR_CONFLICT")
			return
		}
		response.OK(w, map[string]any{"id": id, "status": "in_transit"}, "Dispatched. Company stock was not changed.")
	}
}

func receiveSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var dest *int64
		var status, kind string
		err := pool.QueryRow(r.Context(), `
			select destination_location_id, status, slip_type from public.svc_load_slips
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(&dest, &status, &kind)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Slip not found.", "ERR_NOT_FOUND")
			return
		}
		if dest == nil || *dest <= 0 {
			response.Validation(w, map[string]string{"destination_location_id": "Destination is required."})
			return
		}
		if err := assertLocation(r.Context(), pool, tu, *dest); err != nil {
			branchDenied(w, authorizeSlipReceive(false))
			return
		}
		if kind == "receiving" && status != "approved" && status != "draft" {
			response.Err(w, http.StatusConflict, "This slip cannot be received.", "ERR_CONFLICT")
			return
		}
		if kind == "internal_transfer" && status != "in_transit" {
			response.Err(w, http.StatusConflict, "Dispatch the transfer before the destination receives it.", "ERR_CONFLICT")
			return
		}
		if err := moveSlipCustody(r, pool, tu.TenantID, tu.AppUserID, id, "receive", "received", true); err != nil {
			response.Err(w, http.StatusConflict, err.Error(), "ERR_CONFLICT")
			return
		}
		_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.custody.receive", "svc_load_slip", id, nil, map[string]any{"status": "received"})
		response.OK(w, map[string]any{"id": id, "status": "received"}, "Received. Company stock was not changed.")
	}
}

func releaseSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var origin int64
		var status string
		err := pool.QueryRow(r.Context(), `
			select origin_location_id, status from public.svc_load_slips
			where id = $1 and tenant_id = $2 and deleted_at is null and slip_type in ('release', 'outbound')`,
			id, tu.TenantID).Scan(&origin, &status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Release slip not found.", "ERR_NOT_FOUND")
			return
		}
		if err := assertLocation(r.Context(), pool, tu, origin); err != nil {
			branchDenied(w, err)
			return
		}
		if status != "approved" && status != "draft" {
			response.Err(w, http.StatusConflict, "This slip cannot be released.", "ERR_CONFLICT")
			return
		}
		if err := moveSlipCustody(r, pool, tu.TenantID, tu.AppUserID, id, "release", "released", false); err != nil {
			response.Err(w, http.StatusConflict, err.Error(), "ERR_CONFLICT")
			return
		}
		_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.custody.release", "svc_load_slip", id, nil, map[string]any{"status": "released"})
		response.OK(w, map[string]any{"id": id, "status": "released"}, "Released. Company stock was not changed.")
	}
}

func moveSlipCustody(r *http.Request, pool *pgxpool.Pool, tenantID, actor, slipID int64, movement, slipStatus string, setDestination bool) error {
	tx, err := pool.Begin(r.Context())
	if err != nil {
		return err
	}
	defer tx.Rollback(r.Context())
	var origin int64
	var dest *int64
	err = tx.QueryRow(r.Context(), `
		select origin_location_id, destination_location_id from public.svc_load_slips
		where id = $1 and tenant_id = $2 for update`, slipID, tenantID).Scan(&origin, &dest)
	if err != nil {
		return err
	}
	rows, err := tx.Query(r.Context(), `
		select equipment_id, qty::float8, is_serialized from public.svc_load_slip_items
		where slip_id = $1 and tenant_id = $2`, slipID, tenantID)
	if err != nil {
		return err
	}
	type line struct {
		equipmentID int64
		qty         float64
		serialized  bool
	}
	var lines []line
	for rows.Next() {
		var ln line
		if err := rows.Scan(&ln.equipmentID, &ln.qty, &ln.serialized); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, ln)
	}
	rows.Close()
	for _, ln := range lines {
		if err := validateSlipItemQty(ln.serialized, ln.qty); err != nil {
			return err
		}
		var inCustody float64
		var version int
		var loc int64
		err = tx.QueryRow(r.Context(), `
			select qty_in_custody::float8, row_version, location_id
			from public.svc_customer_equipment
			where id = $1 and tenant_id = $2 for update`, ln.equipmentID, tenantID).Scan(&inCustody, &version, &loc)
		if err != nil {
			return err
		}
		next := inCustody
		status := "in_transit"
		nextLoc := loc
		switch movement {
		case "receive":
			next = inCustody + ln.qty
			status = "received"
			if setDestination && dest != nil {
				nextLoc = *dest
			}
		case "release":
			if ln.qty > inCustody {
				return errInsufficientCustody
			}
			next = inCustody - ln.qty
			if next == 0 {
				status = "released"
			} else {
				status = "ready_for_pickup"
			}
		default:
			status = "in_transit"
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.svc_custody_movements (
			  tenant_id, equipment_id, slip_id, movement_type, from_location_id, to_location_id, qty, authorized_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
			tenantID, ln.equipmentID, slipID, movement, loc, nextLoc, ln.qty, actor); err != nil {
			return err
		}
		if _, err := tx.Exec(r.Context(), `
			update public.svc_customer_equipment
			set qty_in_custody = $3, custody_status = $4, location_id = $5, row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2`, ln.equipmentID, tenantID, next, status, nextLoc); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(r.Context(), `
		update public.svc_load_slips
		set status = $3, row_version = row_version + 1, updated_at = now()
		where id = $1 and tenant_id = $2`, slipID, tenantID, slipStatus); err != nil {
		return err
	}
	return tx.Commit(r.Context())
}

func deleteSlip(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var status string
		err := pool.QueryRow(r.Context(), `
			select status from public.svc_load_slips where id = $1 and tenant_id = $2 and deleted_at is null`,
			id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Slip not found.", "ERR_NOT_FOUND")
			return
		}
		if err := canSoftDeleteDraft(status); err != nil {
			response.Err(w, http.StatusConflict, "Only draft slips can be deleted.", "ERR_CONFLICT")
			return
		}
		_, err = pool.Exec(r.Context(), `
			update public.svc_load_slips set deleted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete the slip.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}
