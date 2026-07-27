package inventory

import (
	"context"
	"encoding/csv"
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

const statusReportExportMaxRows = 5000

type statusReportFilters struct {
	DateFrom       time.Time
	DateTo         time.Time
	LocationID     *int64
	ProjectID      *int64
	PicUserID      *int64
	ProgressStatus string
	PartnerID      *int64
	ItemID         *int64
}

type statusReportRow struct {
	RepairOrderID   int64   `json:"repair_order_id"`
	LineID          int64   `json:"line_id"`
	DateNoDisplay   string  `json:"date_no_display"`
	RepairOrderNo   string  `json:"repair_order_no"`
	ProgressStatus  string  `json:"progress_status"`
	LocationName    string  `json:"location_name"`
	PicName         string  `json:"pic_name"`
	CustomerName    string  `json:"customer_name"`
	LatestUpdate    *string `json:"latest_update,omitempty"`
	ItemCode        string  `json:"item_code"`
	ItemNameDisplay string  `json:"item_name_display"`
	Qty             float64 `json:"qty"`
	Remark          *string `json:"remark,omitempty"`
}

type statusReportSummary struct {
	TotalQty float64 `json:"total_qty"`
}

type statusReportPayload struct {
	Rows    []statusReportRow   `json:"rows"`
	Summary statusReportSummary `json:"summary"`
}

func parseStatusReportFilters(r *http.Request) (statusReportFilters, map[string]string) {
	errs := map[string]string{}
	fromStr := strings.TrimSpace(r.URL.Query().Get("date_from"))
	toStr := strings.TrimSpace(r.URL.Query().Get("date_to"))
	if fromStr == "" {
		errs["date_from"] = "Start date is required."
	}
	if toStr == "" {
		errs["date_to"] = "End date is required."
	}
	if len(errs) > 0 {
		return statusReportFilters{}, errs
	}
	from, err := parseDate(fromStr)
	if err != nil {
		errs["date_from"] = "Invalid date. Use YYYY-MM-DD."
	}
	to, err := parseDate(toStr)
	if err != nil {
		errs["date_to"] = "Invalid date. Use YYYY-MM-DD."
	}
	if len(errs) > 0 {
		return statusReportFilters{}, errs
	}
	if from.After(to) {
		errs["date_to"] = "End date must be on or after start date."
		return statusReportFilters{}, errs
	}
	f := statusReportFilters{DateFrom: from, DateTo: to}
	if id, ok := optionalInt64Query(r, "location_id"); ok {
		f.LocationID = id
	}
	if id, ok := optionalInt64Query(r, "project_id"); ok {
		f.ProjectID = id
	}
	if id, ok := optionalInt64Query(r, "pic_user_id"); ok {
		f.PicUserID = id
	}
	if id, ok := optionalInt64Query(r, "partner_id"); ok {
		f.PartnerID = id
	}
	if id, ok := optionalInt64Query(r, "item_id"); ok {
		f.ItemID = id
	}
	progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
	if progress == "received" || progress == "finished" {
		f.ProgressStatus = progress
	}
	return f, nil
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	s := strings.TrimSpace(r.URL.Query().Get(key))
	if s == "" {
		return nil, false
	}
	n, err := strconv.ParseInt(s, 10, 64)
	if err != nil || n <= 0 {
		return nil, false
	}
	return &n, true
}

func formatItemNameDisplay(itemName string, specName *string) string {
	if specName == nil || strings.TrimSpace(*specName) == "" {
		return itemName
	}
	spec := strings.TrimSpace(*specName)
	if strings.Contains(itemName, "["+spec+"]") {
		return itemName
	}
	return itemName + "[" + spec + "]"
}

func buildStatusReportWhere(f statusReportFilters, tenantID int64) (string, []any) {
	where := `ro.tenant_id = $1 and ro.deleted_at is null
		and ro.order_date >= $2::date and ro.order_date <= $3::date`
	args := []any{tenantID, f.DateFrom, f.DateTo}
	argN := 4
	if f.LocationID != nil {
		where += fmt.Sprintf(" and ro.location_id = $%d", argN)
		args = append(args, *f.LocationID)
		argN++
	}
	if f.ProjectID != nil {
		where += fmt.Sprintf(" and ro.project_id = $%d", argN)
		args = append(args, *f.ProjectID)
		argN++
	}
	if f.PicUserID != nil {
		where += fmt.Sprintf(" and ro.pic_user_id = $%d", argN)
		args = append(args, *f.PicUserID)
		argN++
	}
	if f.PartnerID != nil {
		where += fmt.Sprintf(" and ro.partner_id = $%d", argN)
		args = append(args, *f.PartnerID)
		argN++
	}
	if f.ProgressStatus != "" {
		where += fmt.Sprintf(" and ro.progress_status = $%d", argN)
		args = append(args, f.ProgressStatus)
		argN++
	}
	if f.ItemID != nil {
		where += fmt.Sprintf(` and exists (
			select 1 from public.inv_repair_order_lines fl
			where fl.repair_order_id = ro.id and fl.item_id = $%d
		)`, argN)
		args = append(args, *f.ItemID)
		argN++
	}
	return where, args
}

func statusReportFromClause() string {
	return `
		from public.inv_repair_orders ro
		join public.inv_partners p on p.id = ro.partner_id
		join public.inv_locations l on l.id = ro.location_id
		join public.inv_repair_order_lines ln on ln.repair_order_id = ro.id
		left join public.inv_items i on i.id = ln.item_id`
}

func statusReportOrderBy(sort, order string) string {
	allowed := map[string]string{
		"order_date":      "ro.order_date",
		"repair_order_no": "ro.repair_order_no",
		"progress_status": "ro.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "ro.pic_name",
		"customer_name":   "p.company_name",
		"latest_update":   "ro.latest_update",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
	}
	col := allowed["order_date"]
	if c, ok := allowed[sort]; ok {
		col = c
	}
	ord := orderSQL(order)
	return fmt.Sprintf("%s %s, ln.line_no asc", col, ord)
}

func queryStatusReportRows(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f statusReportFilters, sort, order string, limit, offset int) ([]statusReportRow, int64, error) {
	where, args := buildStatusReportWhere(f, tenantID)
	orderClause := statusReportOrderBy(sort, order)
	q := fmt.Sprintf(`
		select ro.id, ln.id, ro.order_date, ro.date_seq, ro.repair_order_no, ro.progress_status,
		  l.location_name, ro.pic_name, p.company_name, ro.latest_update,
		  ln.item_code, ln.item_name, i.spec_name, ln.qty::float8, ln.remark,
		  count(*) over()
		%s
		where %s
		order by %s
		limit $%d offset $%d`,
		statusReportFromClause(), where, orderClause, len(args)+1, len(args)+2)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []statusReportRow
	var total int64
	for rows.Next() {
		var row statusReportRow
		var orderDate time.Time
		var dateSeq int
		var itemName string
		var specName *string
		if err := rows.Scan(
			&row.RepairOrderID, &row.LineID, &orderDate, &dateSeq, &row.RepairOrderNo, &row.ProgressStatus,
			&row.LocationName, &row.PicName, &row.CustomerName, &row.LatestUpdate,
			&row.ItemCode, &itemName, &specName, &row.Qty, &row.Remark, &total,
		); err != nil {
			return nil, 0, err
		}
		row.DateNoDisplay = formatDateNo(orderDate, dateSeq)
		row.ItemNameDisplay = formatItemNameDisplay(itemName, specName)
		out = append(out, row)
	}
	if out == nil {
		out = []statusReportRow{}
	}
	return out, total, nil
}

func queryStatusReportTotalQty(ctx context.Context, pool *pgxpool.Pool, tenantID int64, f statusReportFilters) (float64, error) {
	where, args := buildStatusReportWhere(f, tenantID)
	q := fmt.Sprintf(`select coalesce(sum(ln.qty), 0)::float8 %s where %s`, statusReportFromClause(), where)
	var total float64
	err := pool.QueryRow(ctx, q, args...).Scan(&total)
	return total, err
}

func listRepairOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	allowedSort := map[string]string{
		"order_date":      "ro.order_date",
		"repair_order_no": "ro.repair_order_no",
		"progress_status": "ro.progress_status",
		"location_name":   "l.location_name",
		"pic_name":        "ro.pic_name",
		"customer_name":   "p.company_name",
		"latest_update":   "ro.latest_update",
		"item_code":       "ln.item_code",
		"qty":             "ln.qty",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseStatusReportFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		p := httputil.ParseListParams(r, "order_date", allowedSort)
		offset := httputil.Offset(p)
		sortKey := strings.TrimSpace(r.URL.Query().Get("sort"))
		if sortKey == "" {
			sortKey = "order_date"
		}

		rows, total, err := queryStatusReportRows(r.Context(), pool, tu.TenantID, f, sortKey, p.Order, p.PageSize, offset)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status report.", "ERR_INTERNAL")
			return
		}
		totalQty, err := queryStatusReportTotalQty(r.Context(), pool, tu.TenantID, f)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load status summary.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Cache-Control", "private, max-age=15")
		response.JSON(w, http.StatusOK, response.Envelope{
			Success: true,
			Message: "OK",
			Data: statusReportPayload{
				Rows:    rows,
				Summary: statusReportSummary{TotalQty: totalQty},
			},
			Meta: &response.Meta{Page: p.Page, PerPage: p.PageSize, Total: total},
		})
	}
}

func exportRepairOrderStatusReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		f, errs := parseStatusReportFilters(r)
		if errs != nil {
			response.Validation(w, errs)
			return
		}
		rows, _, err := queryStatusReportRows(r.Context(), pool, tu.TenantID, f, "order_date", "desc", statusReportExportMaxRows, 0)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export status report.", "ERR_INTERNAL")
			return
		}

		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="repair-order-status.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{
			"Date-No", "Repair Order No", "Progress Status", "Location Name", "PIC Name",
			"Customer/Vendor Name", "Latest Update", "Item Code", "Item Name [Spec]", "Qty", "Remark",
		})
		for _, row := range rows {
			latest := ""
			if row.LatestUpdate != nil {
				latest = *row.LatestUpdate
			}
			remark := ""
			if row.Remark != nil {
				remark = *row.Remark
			}
			progress := "Received"
			if row.ProgressStatus == "finished" {
				progress = "Finished"
			}
			_ = cw.Write([]string{
				row.DateNoDisplay, row.RepairOrderNo, progress, row.LocationName, row.PicName,
				row.CustomerName, latest, row.ItemCode, row.ItemNameDisplay,
				strconv.FormatFloat(row.Qty, 'f', -1, 64), remark,
			})
		}
		cw.Flush()
	}
}

func patchRepairOrderProgressStatus(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body struct {
			ProgressStatus    string `json:"progress_status"`
			ReleaseLocationID *int64 `json:"release_location_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := defaultProgress(body.ProgressStatus)
		if body.ProgressStatus != "" && !isValidRepairProgress(body.ProgressStatus) {
			response.Validation(w, map[string]string{"progress_status": "Invalid progress status."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_repair_orders
			set progress_status = $1, updated_at = now()
			where id = $2 and tenant_id = $3 and deleted_at is null`,
			status, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Repair order not found.", "ERR_NOT_FOUND")
			return
		}

		if status == "released" {
			var serialID *int64
			var releaseLoc *int64
			_ = tx.QueryRow(r.Context(), `
				select serial_unit_id, release_location_id from public.inv_repair_orders where id = $1`, id).
				Scan(&serialID, &releaseLoc)
			if body.ReleaseLocationID != nil {
				releaseLoc = body.ReleaseLocationID
			}
			rel := int64(0)
			if releaseLoc != nil {
				rel = *releaseLoc
			}
			if err := applyRepairRMARelease(r.Context(), tx, tu.TenantID, id, rel, serialID); err != nil {
				response.Validation(w, map[string]string{"release_location_id": err.Error()})
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_order.progress_status", "inv_repair_order", &id, nil, body)
		ro, err := loadRepairOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load repair order.", "ERR_INTERNAL")
			return
		}
		response.OK(w, ro, "Updated.")
	}
}
