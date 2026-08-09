package inventory

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type serialWarrantyPatchBody struct {
	WarrantyStart *string `json:"warranty_start"`
	WarrantyEnd   *string `json:"warranty_end"`
}

// warrantyEndFromMonths mirrors goodsreceipt.warrantyEndDate for register/generate stamps.
func warrantyEndFromMonths(start time.Time, months int) *time.Time {
	if months <= 0 {
		return nil
	}
	end := start.AddDate(0, months, 0)
	return &end
}

// parseOptionalWarrantyDate: nil pointer = omit; empty/whitespace = clear (NULL); else YYYY-MM-DD.
func parseOptionalWarrantyDate(p *string) (set bool, cleared bool, t *time.Time, err error) {
	if p == nil {
		return false, false, nil, nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return true, true, nil, nil
	}
	parsed, err := parseDate(s)
	if err != nil {
		return true, false, nil, err
	}
	return true, false, &parsed, nil
}

func validateWarrantyDatePair(start, end *time.Time) error {
	if start != nil && end != nil && end.Before(*start) {
		return fmt.Errorf("warranty_end must be on or after warranty_start")
	}
	return nil
}

func patchSerialUnitWarranty(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body serialWarrantyPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.WarrantyStart == nil && body.WarrantyEnd == nil {
			response.Validation(w, map[string]string{"body": "Provide warranty_start and/or warranty_end."})
			return
		}

		setStart, clearStart, startVal, err := parseOptionalWarrantyDate(body.WarrantyStart)
		if err != nil {
			response.Validation(w, map[string]string{"warranty_start": "Use YYYY-MM-DD."})
			return
		}
		setEnd, clearEnd, endVal, err := parseOptionalWarrantyDate(body.WarrantyEnd)
		if err != nil {
			response.Validation(w, map[string]string{"warranty_end": "Use YYYY-MM-DD."})
			return
		}

		var status string
		var curStart, curEnd *time.Time
		err = pool.QueryRow(r.Context(), `
			select status, warranty_start, warranty_end
			from public.inv_serial_units
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status, &curStart, &curEnd)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Serial unit not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "void" {
			response.Validation(w, map[string]string{"id": "Cannot update warranty on a void serial unit."})
			return
		}

		finalStart, finalEnd := curStart, curEnd
		if setStart {
			if clearStart {
				finalStart = nil
			} else {
				finalStart = startVal
			}
		}
		if setEnd {
			if clearEnd {
				finalEnd = nil
			} else {
				finalEnd = endVal
			}
		}
		if err := validateWarrantyDatePair(finalStart, finalEnd); err != nil {
			response.Validation(w, map[string]string{"warranty_end": err.Error()})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.inv_serial_units
			set warranty_start = $3::date, warranty_end = $4::date, updated_at = now()
			where id = $1 and tenant_id = $2 and status <> 'void'`,
			id, tu.TenantID, finalStart, finalEnd)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Serial unit not found.", "ERR_NOT_FOUND")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.serial.warranty_update", "inv_serial_unit", &id, nil, map[string]any{
			"warranty_start": formatDatePtr(finalStart),
			"warranty_end":   formatDatePtr(finalEnd),
		})

		var unit SerialUnitRow
		var wStart, wEnd *time.Time
		var recv *time.Time
		var createdAt time.Time
		err = pool.QueryRow(r.Context(), `
			select su.id, su.serial_no, su.item_id, i.item_code, i.item_name, su.status,
			  su.location_id, coalesce(loc.location_name, ''),
			  su.partner_id, coalesce(p.company_name, ''),
			  su.warranty_start, su.warranty_end, su.received_at, su.created_at
			from public.inv_serial_units su
			join public.inv_items i on i.id = su.item_id
			left join public.inv_locations loc on loc.id = su.location_id
			left join public.inv_partners p on p.id = su.partner_id
			where su.id = $1 and su.tenant_id = $2`, id, tu.TenantID).Scan(
			&unit.ID, &unit.SerialNo, &unit.ItemID, &unit.ItemCode, &unit.ItemName, &unit.Status,
			&unit.LocationID, &unit.LocationName, &unit.PartnerID, &unit.PartnerName,
			&wStart, &wEnd, &recv, &createdAt)
		if err != nil {
			response.OK(w, map[string]any{"id": id}, "Updated.")
			return
		}
		unit.WarrantyStart = formatDatePtr(wStart)
		unit.WarrantyEnd = formatDatePtr(wEnd)
		unit.ReceivedAt = formatTimePtr(recv)
		unit.CreatedAt = createdAt.Format(time.RFC3339)
		response.OK(w, unit, "Updated.")
	}
}
