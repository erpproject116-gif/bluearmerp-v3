package manufacturing

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type WasteReason struct {
	ID         int64  `json:"id"`
	Code       string `json:"code"`
	Name       string `json:"name"`
	IsAbnormal bool   `json:"is_abnormal"`
	IsActive   bool   `json:"is_active"`
}

type wasteReasonBody struct {
	Code       string `json:"code"`
	Name       string `json:"name"`
	IsAbnormal *bool  `json:"is_abnormal"`
	IsActive   *bool  `json:"is_active"`
}

func listWasteReasons(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		activeOnly := strings.EqualFold(r.URL.Query().Get("active"), "1") ||
			strings.EqualFold(r.URL.Query().Get("active"), "true")
		q := `
			select id, code, name, is_abnormal, is_active
			from public.mfg_waste_reasons
			where tenant_id = $1`
		args := []any{tu.TenantID}
		if activeOnly {
			q += ` and is_active = true`
		}
		q += ` order by is_abnormal desc, code`
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load waste reasons.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		out := []WasteReason{}
		for rows.Next() {
			var row WasteReason
			if err := rows.Scan(&row.ID, &row.Code, &row.Name, &row.IsAbnormal, &row.IsActive); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read waste reasons.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		response.OK(w, out, "OK")
	}
}

func createWasteReason(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body wasteReasonBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		code := strings.TrimSpace(body.Code)
		name := strings.TrimSpace(body.Name)
		if code == "" {
			response.Validation(w, map[string]string{"code": "Code is required."})
			return
		}
		if name == "" {
			response.Validation(w, map[string]string{"name": "Name is required."})
			return
		}
		abnormal := false
		if body.IsAbnormal != nil {
			abnormal = *body.IsAbnormal
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var row WasteReason
		err := pool.QueryRow(r.Context(), `
			insert into public.mfg_waste_reasons (tenant_id, code, name, is_abnormal, is_active)
			values ($1,$2,$3,$4,$5)
			returning id, code, name, is_abnormal, is_active`,
			tu.TenantID, code, name, abnormal, active).
			Scan(&row.ID, &row.Code, &row.Name, &row.IsAbnormal, &row.IsActive)
		if err != nil {
			response.Validation(w, map[string]string{"code": "Could not create waste reason (duplicate code?)."})
			return
		}
		response.OK(w, row, "Waste reason created.")
	}
}

func updateWasteReason(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body wasteReasonBody
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
		abnormal := false
		if body.IsAbnormal != nil {
			abnormal = *body.IsAbnormal
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		tag, err := pool.Exec(r.Context(), `
			update public.mfg_waste_reasons
			set code=$3, name=$4, is_abnormal=$5, is_active=$6, updated_at=now()
			where id=$1 and tenant_id=$2`, id, tu.TenantID, code, name, abnormal, active)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Waste reason not found.", "ERR_NOT_FOUND")
			return
		}
		row := WasteReason{ID: id, Code: code, Name: name, IsAbnormal: abnormal, IsActive: active}
		response.OK(w, row, "Waste reason updated.")
	}
}

func deleteWasteReason(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var used int64
		if err := pool.QueryRow(r.Context(), `
			select count(*) from public.mfg_wo_waste_lines
			where tenant_id = $1 and waste_reason_id = $2`, tu.TenantID, id).Scan(&used); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check waste reason usage.", "ERR_INTERNAL")
			return
		}
		if used > 0 {
			response.Err(w, http.StatusConflict, "This reason is used on a job. Deactivate it instead.", "ERR_IN_USE")
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.mfg_waste_reasons
			where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Waste reason not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Waste reason deleted.")
	}
}
