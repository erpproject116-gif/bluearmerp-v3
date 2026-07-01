package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type ProductBundleLine struct {
	ID              int64   `json:"id,omitempty"`
	LineNo          int     `json:"line_no"`
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code,omitempty"`
	ComponentName   string  `json:"component_name,omitempty"`
	Qty             float64 `json:"qty"`
}

type ProductBundle struct {
	ID            int64               `json:"id"`
	BundleCode    string              `json:"bundle_code"`
	BundleName    string              `json:"bundle_name"`
	ParentItemID  *int64              `json:"parent_item_id,omitempty"`
	ParentItem    string              `json:"parent_item_name,omitempty"`
	IsActive      bool                `json:"is_active"`
	Lines         []ProductBundleLine `json:"lines,omitempty"`
	ComponentText string              `json:"components,omitempty"`
}

type productBundleBody struct {
	BundleCode   string                  `json:"bundle_code"`
	BundleName   string                  `json:"bundle_name"`
	ParentItemID *int64                  `json:"parent_item_id"`
	IsActive     *bool                   `json:"is_active"`
	Lines        []productBundleLineBody `json:"lines"`
}

type productBundleLineBody struct {
	ComponentItemID int64   `json:"component_item_id"`
	Qty             float64 `json:"qty"`
}

type explodedBundleLine struct {
	ItemID   int64   `json:"item_id"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
}

func registerProductBundleRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/product-bundles", listProductBundles(pool))
	r.Get("/product-bundles/{id}/explode", explodeProductBundle(pool))
	r.Get("/product-bundles/{id}", getProductBundle(pool))
	r.Post("/product-bundles", createProductBundle(pool))
	r.Patch("/product-bundles/{id}", updateProductBundle(pool))
	r.Delete("/product-bundles/{id}", deleteProductBundle(pool))
}

func listProductBundles(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"bundle_code": "b.bundle_code",
		"bundle_name": "b.bundle_name",
		"updated_at":  "b.updated_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "bundle_code", allowed)
		offset := httputil.Offset(p)

		where := "b.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if p.Q != "" {
			where += fmt.Sprintf(" and (b.bundle_code ilike $%d or b.bundle_name ilike $%d)", argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if p.Status == "active" || p.Status == "inactive" {
			where += fmt.Sprintf(" and b.is_active = $%d", argN)
			args = append(args, p.Status == "active")
			argN++
		}
		if pid := strings.TrimSpace(r.URL.Query().Get("parent_item_id")); pid != "" {
			if v, err := strconv.ParseInt(pid, 10, 64); err == nil && v > 0 {
				where += fmt.Sprintf(" and b.parent_item_id = $%d", argN)
				args = append(args, v)
				argN++
			}
		}

		q := fmt.Sprintf(`
			select b.id, b.bundle_code, b.bundle_name, b.parent_item_id, coalesce(pi.item_name, ''),
			       b.is_active,
			       coalesce((
			         select string_agg(i.item_code || '×' || trim(to_char(bl.qty, 'FM999999999990.####')), ', ' order by bl.line_no)
			         from public.inv_product_bundle_lines bl
			         join public.inv_items i on i.id = bl.component_item_id
			         where bl.bundle_id = b.id
			       ), '') as components,
			       count(*) over()
			from public.inv_product_bundles b
			left join public.inv_items pi on pi.id = b.parent_item_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list product bundles.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []ProductBundle
		var total int64
		for rows.Next() {
			var row ProductBundle
			if err := rows.Scan(
				&row.ID, &row.BundleCode, &row.BundleName, &row.ParentItemID, &row.ParentItem,
				&row.IsActive, &row.ComponentText, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read product bundles.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []ProductBundle{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func explodeProductBundle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select l.component_item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''), l.qty::float8
			from public.inv_product_bundle_lines l
			join public.inv_product_bundles b on b.id = l.bundle_id
			left join public.inv_items i on i.id = l.component_item_id
			where b.id = $1 and b.tenant_id = $2
			order by l.line_no`, id, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to explode product bundle.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []explodedBundleLine
		for rows.Next() {
			var ln explodedBundleLine
			if err := rows.Scan(&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read bundle components.", "ERR_INTERNAL")
				return
			}
			out = append(out, ln)
		}
		if out == nil {
			out = []explodedBundleLine{}
		}
		response.OK(w, out, "OK")
	}
}

func getProductBundle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadProductBundle(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Product bundle not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createProductBundle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body productBundleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateProductBundleBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create product bundle.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_product_bundles (
			  tenant_id, bundle_code, bundle_name, parent_item_id, is_active
			) values ($1,$2,$3,$4,$5)
			returning id`,
			tu.TenantID, strings.TrimSpace(body.BundleCode), strings.TrimSpace(body.BundleName), body.ParentItemID, body.IsActive == nil || *body.IsActive,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create product bundle.", "ERR_INTERNAL")
			return
		}

		if err := replaceBundleLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save product bundle.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.product_bundle.create", "inv_product_bundle", &id, nil, body)
		row, _ := loadProductBundle(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func updateProductBundle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body productBundleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateProductBundleBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update product bundle.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_product_bundles set
			  bundle_code=$1, bundle_name=$2, parent_item_id=$3, is_active=$4, updated_at=now()
			where id=$5 and tenant_id=$6`,
			strings.TrimSpace(body.BundleCode), strings.TrimSpace(body.BundleName), body.ParentItemID, body.IsActive == nil || *body.IsActive, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Product bundle not found.", "ERR_NOT_FOUND")
			return
		}

		if err := replaceBundleLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save product bundle.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.product_bundle.update", "inv_product_bundle", &id, nil, body)
		row, _ := loadProductBundle(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Updated.")
	}
}

func deleteProductBundle(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `delete from public.inv_product_bundles where id=$1 and tenant_id=$2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Product bundle not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.product_bundle.delete", "inv_product_bundle", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func loadProductBundle(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (ProductBundle, error) {
	var row ProductBundle
	err := pool.QueryRow(ctx, `
		select b.id, b.bundle_code, b.bundle_name, b.parent_item_id, coalesce(pi.item_name, ''), b.is_active
		from public.inv_product_bundles b
		left join public.inv_items pi on pi.id = b.parent_item_id
		where b.id=$1 and b.tenant_id=$2`, id, tenantID).
		Scan(&row.ID, &row.BundleCode, &row.BundleName, &row.ParentItemID, &row.ParentItem, &row.IsActive)
	if err != nil {
		return ProductBundle{}, err
	}
	lines, err := pool.Query(ctx, `
		select l.id, l.line_no, l.component_item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''), l.qty::float8
		from public.inv_product_bundle_lines l
		left join public.inv_items i on i.id = l.component_item_id
		where l.bundle_id=$1
		order by l.line_no`, id)
	if err != nil {
		return ProductBundle{}, err
	}
	defer lines.Close()
	for lines.Next() {
		var ln ProductBundleLine
		if err := lines.Scan(&ln.ID, &ln.LineNo, &ln.ComponentItemID, &ln.ComponentCode, &ln.ComponentName, &ln.Qty); err != nil {
			return ProductBundle{}, err
		}
		row.Lines = append(row.Lines, ln)
	}
	if row.Lines == nil {
		row.Lines = []ProductBundleLine{}
	}
	return row, nil
}

func validateProductBundleBody(b productBundleBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(b.BundleCode) == "" {
		errs["bundle_code"] = "Bundle code is required."
	}
	if strings.TrimSpace(b.BundleName) == "" {
		errs["bundle_name"] = "Bundle name is required."
	}
	if len(b.Lines) == 0 {
		errs["lines"] = "At least one component line is required."
	}
	for i, ln := range b.Lines {
		if ln.ComponentItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].component_item_id", i)] = "Component item is required."
		}
		if ln.Qty <= 0 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = "Quantity must be greater than zero."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func replaceBundleLines(ctx context.Context, tx pgx.Tx, tenantID, bundleID int64, lines []productBundleLineBody) error {
	if _, err := tx.Exec(ctx, `delete from public.inv_product_bundle_lines where bundle_id=$1`, bundleID); err != nil {
		return err
	}
	for i, ln := range lines {
		var exists bool
		if err := tx.QueryRow(ctx, `
			select exists(select 1 from public.inv_items where id=$1 and tenant_id=$2 and deleted_at is null)`,
			ln.ComponentItemID, tenantID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return fmt.Errorf("component item %d not found", ln.ComponentItemID)
		}
		if _, err := tx.Exec(ctx, `
			insert into public.inv_product_bundle_lines (bundle_id, line_no, component_item_id, qty)
			values ($1,$2,$3,$4)`,
			bundleID, i+1, ln.ComponentItemID, ln.Qty); err != nil {
			return err
		}
	}
	return nil
}
