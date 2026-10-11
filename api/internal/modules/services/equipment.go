package services

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entityEquipment = "svc_customer_equipment"

func getEquipment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var tenantID, partnerID, locationID int64
		var name, category, brand, model, serial, tag, description, condition, accessories, warranty, status string
		var serialized bool
		var qty, inCustody float64
		var version int
		err := pool.QueryRow(r.Context(), `
			select tenant_id, partner_id, location_id, name, category, brand, model, serial_no, asset_tag,
			  is_serialized, qty::float8, qty_in_custody::float8, description, condition, accessories,
			  warranty_note, custody_status, row_version
			from public.svc_customer_equipment
			where id = $1 and tenant_id = $2 and deleted_at is null`, id, tu.TenantID).Scan(
			&tenantID, &partnerID, &locationID, &name, &category, &brand, &model, &serial, &tag,
			&serialized, &qty, &inCustody, &description, &condition, &accessories, &warranty, &status, &version)
		if err != nil || denyCrossTenant(tenantID, tu.TenantID) != nil {
			response.Err(w, http.StatusNotFound, "Equipment not found.", "ERR_NOT_FOUND")
			return
		}
		vals, _ := customfields.LoadValues(r.Context(), pool, tu.TenantID, entityEquipment, id)
		response.OK(w, map[string]any{
			"id": id, "partner_id": partnerID, "location_id": locationID, "name": name,
			"category": category, "brand": brand, "model": model, "serial_no": serial, "asset_tag": tag,
			"is_serialized": serialized, "qty": qty, "qty_in_custody": inCustody, "description": description,
			"condition": condition, "accessories": accessories, "warranty_note": warranty,
			"custody_status": status, "row_version": version, "custom_values": vals,
		}, "OK")
	}
}

func createEquipment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		var body struct {
			PartnerID    int64          `json:"partner_id"`
			LocationID   int64          `json:"location_id"`
			Name         string         `json:"name"`
			Category     string         `json:"category"`
			Brand        string         `json:"brand"`
			Model        string         `json:"model"`
			SerialNo     string         `json:"serial_no"`
			AssetTag     string         `json:"asset_tag"`
			IsSerialized bool           `json:"is_serialized"`
			Qty          float64        `json:"qty"`
			Description  string         `json:"description"`
			Condition    string         `json:"condition"`
			Accessories  string         `json:"accessories"`
			WarrantyNote string         `json:"warranty_note"`
			CustomValues map[string]any `json:"custom_values"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if err := assertLocation(r.Context(), pool, tu, body.LocationID); err != nil {
			branchDenied(w, err)
			return
		}
		if body.PartnerID <= 0 || strings.TrimSpace(body.Name) == "" {
			response.Validation(w, map[string]string{"name": "Customer and equipment name are required."})
			return
		}
		if body.IsSerialized && strings.TrimSpace(body.SerialNo) == "" {
			response.Validation(w, map[string]string{"serial_no": "Serial number is required."})
			return
		}
		if err := validateSlipItemQty(body.IsSerialized, qtyOrOne(body.Qty, body.IsSerialized)); err != nil && body.IsSerialized {
			response.Validation(w, map[string]string{"qty": err.Error()})
			return
		}
		qty := body.Qty
		if qty <= 0 {
			qty = 1
		}
		if body.IsSerialized {
			qty = 1
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save equipment.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.svc_customer_equipment (
			  tenant_id, partner_id, location_id, name, category, brand, model, serial_no, asset_tag,
			  is_serialized, qty, description, condition, accessories, warranty_note, created_by_user_id
			) values (
			  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
			) returning id`,
			tu.TenantID, body.PartnerID, body.LocationID, body.Name, body.Category, body.Brand, body.Model,
			body.SerialNo, body.AssetTag, body.IsSerialized, qty, body.Description, body.Condition,
			body.Accessories, body.WarrantyNote, tu.AppUserID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusConflict, "That serial number is already registered for this customer.", "ERR_CONFLICT")
			return
		}
		if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, entityEquipment, id, body.CustomValues); len(cerrs) > 0 {
			response.Validation(w, cerrs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save equipment.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Created. Company stock was not changed.")
	}
}

func qtyOrOne(qty float64, serialized bool) float64 {
	if serialized {
		if qty == 0 {
			return 1
		}
		return qty
	}
	if qty <= 0 {
		return 1
	}
	return qty
}

func patchEquipment(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			Name         string `json:"name"`
			Condition    string `json:"condition"`
			Accessories  string `json:"accessories"`
			WarrantyNote string `json:"warranty_note"`
			RowVersion   int    `json:"row_version"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.svc_customer_equipment
			set name = $3, condition = $4, accessories = $5, warranty_note = $6,
			    row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null and row_version = $7`,
			id, tu.TenantID, body.Name, body.Condition, body.Accessories, body.WarrantyNote, body.RowVersion)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update equipment.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			conflict(w)
			return
		}
		response.OK(w, map[string]any{"id": id}, "Saved.")
	}
}

func listCustody(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		rows, err := pool.Query(r.Context(), `
			select id, movement_type, from_location_id, to_location_id, from_custodian, to_custodian,
			  qty::float8, remarks, moved_at
			from public.svc_custody_movements
			where tenant_id = $1 and equipment_id = $2
			order by moved_at, id`, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load custody history.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []map[string]any{}
		for rows.Next() {
			var mid int64
			var kind, fromC, toC, remarks string
			var fromL, toL *int64
			var qty float64
			var moved any
			if err := rows.Scan(&mid, &kind, &fromL, &toL, &fromC, &toC, &qty, &remarks, &moved); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load custody history.", "ERR_INTERNAL")
				return
			}
			out = append(out, map[string]any{
				"id": mid, "movement_type": kind, "from_location_id": fromL, "to_location_id": toL,
				"from_custodian": fromC, "to_custodian": toC, "qty": qty, "remarks": remarks, "moved_at": moved,
			})
		}
		response.OK(w, out, "OK")
	}
}

func correctOwnership(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := user(w, r)
		if !ok {
			return
		}
		id, ok := pathID(w, r, "id")
		if !ok {
			return
		}
		var body struct {
			PartnerID  int64  `json:"partner_id"`
			RowVersion int    `json:"row_version"`
			Reason     string `json:"reason"`
		}
		if !decodeJSON(w, r, &body) {
			return
		}
		if body.PartnerID <= 0 {
			response.Validation(w, map[string]string{"partner_id": "Choose the corrected owner."})
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to correct ownership.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		var oldPartner, locationID int64
		var version int
		var qty float64
		err = tx.QueryRow(r.Context(), `
			select partner_id, location_id, qty_in_custody::float8, row_version
			from public.svc_customer_equipment
			where id = $1 and tenant_id = $2 and deleted_at is null
			for update`, id, tu.TenantID).Scan(&oldPartner, &locationID, &qty, &version)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Equipment not found.", "ERR_NOT_FOUND")
			return
		}
		if version != body.RowVersion {
			conflict(w)
			return
		}
		moveQty := qty
		if moveQty <= 0 {
			moveQty = 1
		}
		if _, err := tx.Exec(r.Context(), `
			insert into public.svc_custody_movements (
			  tenant_id, equipment_id, movement_type, from_location_id, to_location_id,
			  qty, remarks, authorized_by_user_id
			) values ($1, $2, 'ownership_correction', $3, $3, $4, $5, $6)`,
			tu.TenantID, id, locationID, moveQty, body.Reason, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record the correction.", "ERR_INTERNAL")
			return
		}
		tag, err := tx.Exec(r.Context(), `
			update public.svc_customer_equipment
			set partner_id = $3, row_version = row_version + 1, updated_at = now()
			where id = $1 and tenant_id = $2 and row_version = $4`, id, tu.TenantID, body.PartnerID, version)
		if err != nil || tag.RowsAffected() != 1 {
			response.Err(w, http.StatusConflict, "Could not correct ownership. Check the serial number for the new customer.", "ERR_CONFLICT")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to correct ownership.", "ERR_INTERNAL")
			return
		}
		_ = auditSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "services.equipment.ownership", "svc_customer_equipment", id,
			map[string]any{"partner_id": oldPartner}, map[string]any{"partner_id": body.PartnerID, "reason": body.Reason})
		response.OK(w, map[string]any{"id": id, "partner_id": body.PartnerID}, "Ownership corrected. History was kept.")
	}
}
