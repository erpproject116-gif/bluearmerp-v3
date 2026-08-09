package crm

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

type WarrantyAsset struct {
	ID             int64   `json:"id"`
	PartnerID      int64   `json:"partner_id"`
	PartnerName    string  `json:"partner_name,omitempty"`
	ItemID         *int64  `json:"item_id,omitempty"`
	ItemCode       string  `json:"item_code"`
	ItemName       string  `json:"item_name"`
	SerialNo       string  `json:"serial_no"`
	SalesID        *int64  `json:"sales_id,omitempty"`
	SalesLineID    *int64  `json:"sales_line_id,omitempty"`
	SerialUnitID   *int64  `json:"serial_unit_id,omitempty"`
	WarrantyOrigin string  `json:"warranty_origin,omitempty"`
	WarrantyStart  string  `json:"warranty_start"`
	WarrantyEnd    string  `json:"warranty_end"`
	Status         string  `json:"status"`
	PicUserID      *int64  `json:"pic_user_id,omitempty"`
	PicName        string  `json:"pic_name"`
}

type warrantyPatchBody struct {
	WarrantyEnd *string `json:"warranty_end"`
	Status      *string `json:"status"`
	PicUserID   *int64  `json:"pic_user_id"`
	PicName     *string `json:"pic_name"`
}

const warrantyAssetSelect = `
	select wa.id, wa.partner_id, coalesce(p.company_name, ''), wa.item_id, wa.item_code, wa.item_name, wa.serial_no,
	  wa.sales_id, wa.sales_line_id, wa.serial_unit_id, coalesce(wa.warranty_origin, 'sales'),
	  wa.warranty_start, wa.warranty_end, wa.status, wa.pic_user_id, wa.pic_name
	from public.crm_warranty_assets wa
	left join public.inv_partners p on p.id = wa.partner_id`

func registerWarrantyAssetRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/warranty-assets", listWarrantyAssets(pool))
	r.Get("/warranty-assets/{id}", getWarrantyAsset(pool))
	r.Patch("/warranty-assets/{id}", patchWarrantyAsset(pool))
	r.Post("/warranty-assets/sync-from-sales/{sales_id}", syncWarrantyFromSales(pool))
}

func scanWarrantyAsset(scanner interface{ Scan(dest ...any) error }) (WarrantyAsset, error) {
	var row WarrantyAsset
	var start, end time.Time
	err := scanner.Scan(
		&row.ID, &row.PartnerID, &row.PartnerName, &row.ItemID, &row.ItemCode, &row.ItemName, &row.SerialNo,
		&row.SalesID, &row.SalesLineID, &row.SerialUnitID, &row.WarrantyOrigin,
		&start, &end, &row.Status, &row.PicUserID, &row.PicName,
	)
	if err != nil {
		return WarrantyAsset{}, err
	}
	row.WarrantyStart = dateToStr(start)
	row.WarrantyEnd = dateToStr(end)
	return row, nil
}

func listWarrantyAssets(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"serial_no": "wa.serial_no", "warranty_end": "wa.warranty_end",
		"status": "wa.status", "item_code": "wa.item_code",
		"partner_name": "p.company_name",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "warranty_end", allowed)
		offset := httputil.Offset(p)
		where := "wa.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		q := r.URL.Query()

		// Customer Warranty default: sold coverage only (sales origin or linked sale).
		coverage := strings.TrimSpace(strings.ToLower(q.Get("coverage")))
		if coverage == "" || coverage == "sales" || coverage == "customer" {
			where += ` and (wa.warranty_origin = 'sales' or wa.sales_id is not null)`
		} else if coverage == "all" {
			// no extra filter
		}

		if v := strings.TrimSpace(q.Get("partner_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"partner_id": "Invalid partner id."})
				return
			}
			where += fmt.Sprintf(" and wa.partner_id = $%d", n)
			args = append(args, id)
			n++
		}

		serialExact := q.Get("serial_no_exact") == "1" || q.Get("serial_no_exact") == "true"
		serialNo := strings.TrimSpace(q.Get("serial_no"))
		if serialNo != "" {
			if serialExact {
				where += fmt.Sprintf(" and wa.serial_no = $%d", n)
				args = append(args, serialNo)
			} else {
				where += fmt.Sprintf(" and wa.serial_no ilike $%d", n)
				args = append(args, "%"+serialNo+"%")
			}
			n++
		}

		searchQ := strings.TrimSpace(q.Get("q"))
		if searchQ != "" {
			where += fmt.Sprintf(` and (
				wa.serial_no ilike $%d
				or wa.item_code ilike $%d
				or wa.item_name ilike $%d
				or coalesce(p.company_name, '') ilike $%d
			)`, n, n, n, n)
			args = append(args, "%"+searchQ+"%")
			n++
		}

		if v := strings.TrimSpace(q.Get("status")); v == "active" || v == "expired" || v == "void" {
			where += fmt.Sprintf(" and wa.status = $%d", n)
			args = append(args, v)
			n++
		}

		endFrom := strings.TrimSpace(q.Get("warranty_end_from"))
		if endFrom == "" {
			endFrom = strings.TrimSpace(q.Get("expiry_from"))
		}
		if endFrom != "" {
			t, err := parseDate(endFrom)
			if err != nil {
				response.Validation(w, map[string]string{"warranty_end_from": "Use YYYY-MM-DD."})
				return
			}
			where += fmt.Sprintf(" and wa.warranty_end >= $%d::date", n)
			args = append(args, t)
			n++
		}

		endTo := strings.TrimSpace(q.Get("warranty_end_to"))
		if endTo == "" {
			endTo = strings.TrimSpace(q.Get("expiry_to"))
		}
		if endTo != "" {
			t, err := parseDate(endTo)
			if err != nil {
				response.Validation(w, map[string]string{"warranty_end_to": "Use YYYY-MM-DD."})
				return
			}
			where += fmt.Sprintf(" and wa.warranty_end <= $%d::date", n)
			args = append(args, t)
			n++
		}

		scope, n := tu.PicScopeSQL("wa.pic_user_id", n, &args)
		where += scope

		base := fmt.Sprintf(`
			select wa.id, wa.partner_id, coalesce(p.company_name, ''), wa.item_id, wa.item_code, wa.item_name, wa.serial_no,
			  wa.sales_id, wa.sales_line_id, wa.serial_unit_id, coalesce(wa.warranty_origin, 'sales'),
			  wa.warranty_start, wa.warranty_end, wa.status, wa.pic_user_id, wa.pic_name,
			  count(*) over()
			from public.crm_warranty_assets wa
			left join public.inv_partners p on p.id = wa.partner_id
			where %s`, where)

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "wa.warranty_end"
		}
		query := fmt.Sprintf("%s order by %s %s limit $%d offset $%d", base, sortCol, orderSQL(p.Order), n, n+1)
		args = append(args, p.PageSize, offset)
		rows, err := pool.Query(r.Context(), query, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list warranty assets.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []WarrantyAsset
		var total int64
		for rows.Next() {
			var row WarrantyAsset
			var start, end time.Time
			if err := rows.Scan(
				&row.ID, &row.PartnerID, &row.PartnerName, &row.ItemID, &row.ItemCode, &row.ItemName, &row.SerialNo,
				&row.SalesID, &row.SalesLineID, &row.SerialUnitID, &row.WarrantyOrigin,
				&start, &end, &row.Status, &row.PicUserID, &row.PicName, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read warranty assets.", "ERR_INTERNAL")
				return
			}
			row.WarrantyStart = dateToStr(start)
			row.WarrantyEnd = dateToStr(end)
			out = append(out, row)
		}
		if out == nil {
			out = []WarrantyAsset{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getWarrantyAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := scanWarrantyAsset(pool.QueryRow(r.Context(), warrantyAssetSelect+`
			where wa.id = $1 and wa.tenant_id = $2`, id, tu.TenantID))
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func patchWarrantyAsset(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body warrantyPatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		sets := []string{"updated_at = now()"}
		args := []any{id, tu.TenantID}
		n := 3
		if body.WarrantyEnd != nil {
			t, err := parseDate(*body.WarrantyEnd)
			if err != nil {
				response.Validation(w, map[string]string{"warranty_end": "Use YYYY-MM-DD."})
				return
			}
			sets = append(sets, fmt.Sprintf("warranty_end = $%d::date", n))
			args = append(args, t)
			n++
		}
		if body.Status != nil {
			s := strings.TrimSpace(*body.Status)
			if s != "active" && s != "expired" && s != "void" {
				response.Validation(w, map[string]string{"status": "Must be active, expired, or void."})
				return
			}
			sets = append(sets, fmt.Sprintf("status = $%d", n))
			args = append(args, s)
			n++
		}
		if body.PicUserID != nil {
			sets = append(sets, fmt.Sprintf("pic_user_id = $%d", n))
			args = append(args, *body.PicUserID)
			n++
		}
		if body.PicName != nil {
			sets = append(sets, fmt.Sprintf("pic_name = $%d", n))
			args = append(args, strings.TrimSpace(*body.PicName))
			n++
		}
		q := fmt.Sprintf("update public.crm_warranty_assets set %s where id = $1 and tenant_id = $2", strings.Join(sets, ", "))
		tag, err := pool.Exec(r.Context(), q, args...)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "crm.warranty.update", "crm_warranty_asset", &id, nil, body)
		row, _ := scanWarrantyAsset(pool.QueryRow(r.Context(), warrantyAssetSelect+`
			where wa.id = $1 and wa.tenant_id = $2`, id, tu.TenantID))
		response.OK(w, row, "Updated.")
	}
}

func syncWarrantyFromSales(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		salesID, err := strconv.ParseInt(chi.URLParam(r, "sales_id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"sales_id": "Invalid sales id."})
			return
		}
		var exists bool
		if err := pool.QueryRow(r.Context(),
			`select exists(select 1 from public.sa_sales where id = $1 and tenant_id = $2 and deleted_at is null)`,
			salesID, tu.TenantID).Scan(&exists); err != nil || !exists {
			response.Err(w, http.StatusNotFound, "Sales not found.", "ERR_NOT_FOUND")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		synced, err := SyncWarrantyAssetsFromSale(r.Context(), tx, tu.TenantID, salesID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to sync warranty assets.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"synced": synced}, "Synced.")
	}
}
