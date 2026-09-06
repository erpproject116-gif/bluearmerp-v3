package manufacturing

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/openlines"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var ErrSalesOrderNotFound = errors.New("sales order not found")

type docflowValidationError struct {
	fields map[string]string
}

func (e *docflowValidationError) Error() string { return "validation failed" }

func docflowValidation(fields map[string]string) error {
	return &docflowValidationError{fields: fields}
}

func AsDocflowValidation(err error) (map[string]string, bool) {
	var ve *docflowValidationError
	if errors.As(err, &ve) {
		return ve.fields, true
	}
	return nil, false
}

type openSalesOrderLineForWO struct {
	SalesOrderLineID int64   `json:"sales_order_line_id"`
	LineNo           int     `json:"line_no"`
	ItemID           *int64  `json:"item_id,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Description      *string `json:"description,omitempty"`
	OpenQty          float64 `json:"open_qty"`
	UnitVatInc       float64 `json:"unit_vat_inc"`
	Remark           *string `json:"remark,omitempty"`
}

type openSalesOrderSlipLineForWO struct {
	SalesOrderID     int64    `json:"sales_order_id"`
	SalesOrderLineID int64    `json:"sales_order_line_id"`
	DateNoDisplay    string   `json:"date_no_display"`
	ReferenceNo      string   `json:"reference_no"`
	ProgressStatus   string   `json:"progress_status"`
	CustomerName     string   `json:"customer_name"`
	LocationID       int64    `json:"location_id"`
	LocationName     string   `json:"location_name"`
	PartnerID        int64    `json:"partner_id"`
	ItemID           *int64   `json:"item_id,omitempty"`
	ItemCode         string   `json:"item_code"`
	ItemName         string   `json:"item_name"`
	Description      *string  `json:"description,omitempty"`
	Qty              float64  `json:"qty"`
	BalanceQty       float64  `json:"balance_qty"`
	UnitVatInc       float64  `json:"unit_vat_inc"`
	Remark           *string  `json:"remark,omitempty"`
	TrackSerial      bool     `json:"track_serial,omitempty"`
	PlannedSerialNos []string `json:"planned_serial_nos,omitempty"`
}

func listOpenSalesOrderSlipLinesForWO(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", map[string]string{
			"order_date":    "so.order_date",
			"reference_no":  "so.sales_order_no",
			"customer_name": "pt.company_name",
			"item_code":     "ln.item_code",
		})
		pageSize := openlines.PageSize(r, p.PageSize)
		offset := (p.Page - 1) * pageSize

		where := `so.tenant_id = $1 and so.deleted_at is null
			and so.progress_status in ('unconfirmed', 'e_approval', 'in_progress', 'completed')
			and ln.item_id is not null
			and (ln.qty - coalesce(req.requested, 0)) > 0.0001
			and exists (
			  select 1 from public.mfg_boms b
			  where b.tenant_id = so.tenant_id
			    and b.finished_item_id = ln.item_id
			    and b.is_active = true
			)`
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				so.sales_order_no ilike $%d or pt.company_name ilike $%d or
				ln.item_code ilike $%d or ln.item_name ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			CustomerColumn: "so.partner_id",
			LocationColumn: "so.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply data scopes.", "ERR_INTERNAL")
			return
		}
		where += dsScope

		q := fmt.Sprintf(`
			select so.id, ln.id, so.order_date, so.date_seq, so.sales_order_no, so.progress_status,
			  pt.company_name, so.location_id, l.location_name, so.partner_id,
			  ln.item_id, ln.item_code, ln.item_name, ln.description,
			  ln.qty::float8,
			  (ln.qty - coalesce(req.requested, 0))::float8,
			  ln.unit_vat_inc::float8, ln.remark,
			  coalesce(i.track_serial, false),
			  coalesce(ln.planned_serial_nos, '{}'),
			  count(*) over()
			from public.so_sales_orders so
			join public.inv_partners pt on pt.id = so.partner_id
			join public.inv_locations l on l.id = so.location_id
			join public.so_sales_order_lines ln on ln.sales_order_id = so.id
			left join public.inv_items i on i.id = ln.item_id
			left join (
			  select source_sales_order_line_id, sum(qty_to_produce) as requested
			  from public.mfg_work_orders
			  where source_sales_order_line_id is not null
			    and status not in ('cancelled', 'completed')
			  group by source_sales_order_line_id
			) req on req.source_sales_order_line_id = ln.id
			where %s
			order by so.order_date desc, ln.line_no asc
			limit $%d offset $%d`, where, argN, argN+1)
		args = append(args, pageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list sales order lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		out := []openSalesOrderSlipLineForWO{}
		var total int64
		for rows.Next() {
			var ln openSalesOrderSlipLineForWO
			var orderDate time.Time
			var dateSeq int
			if err := rows.Scan(
				&ln.SalesOrderID, &ln.SalesOrderLineID, &orderDate, &dateSeq, &ln.ReferenceNo, &ln.ProgressStatus,
				&ln.CustomerName, &ln.LocationID, &ln.LocationName, &ln.PartnerID,
				&ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Description,
				&ln.Qty, &ln.BalanceQty, &ln.UnitVatInc, &ln.Remark,
				&ln.TrackSerial, &ln.PlannedSerialNos, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read sales order lines.", "ERR_INTERNAL")
				return
			}
			ln.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			out = append(out, ln)
		}
		response.OKList(w, out, p.Page, pageSize, total)
	}
}

func createWorkOrderFromSalesOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		soID, err := strconv.ParseInt(chi.URLParam(r, "soId"), 10, 64)
		if err != nil || soID <= 0 {
			response.Validation(w, map[string]string{"soId": "Invalid sales order id."})
			return
		}
		id, err := CreateWorkOrdersFromSalesOrder(r.Context(), pool, tu, soID)
		if err != nil {
			if fields, ok := AsDocflowValidation(err); ok {
				response.Validation(w, fields)
				return
			}
			if errors.Is(err, ErrSalesOrderNotFound) {
				response.Err(w, http.StatusNotFound, "Sales order not found.", "ERR_NOT_FOUND")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create work order.", "ERR_INTERNAL")
			return
		}
		row, _ := loadWorkOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Created.")
	}
}

func openSalesOrderLineBalanceSQL() string {
	return `
		select ln.id, ln.line_no, ln.item_id, ln.item_code, ln.item_name, ln.description,
		  (ln.qty - coalesce(req.requested, 0))::float8, ln.unit_vat_inc::float8, ln.remark
		from public.so_sales_order_lines ln
		left join (
		  select source_sales_order_line_id, sum(qty_to_produce) as requested
		  from public.mfg_work_orders
		  where source_sales_order_line_id is not null
		    and status not in ('cancelled', 'completed')
		  group by source_sales_order_line_id
		) req on req.source_sales_order_line_id = ln.id`
}

// CreateWorkOrdersFromSalesOrder creates draft work orders from open sales order lines.
func CreateWorkOrdersFromSalesOrder(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soID int64) (int64, error) {
	var existingID int64
	err := pool.QueryRow(ctx, `
		select id from public.mfg_work_orders
		where tenant_id = $1 and source_sales_order_id = $2
		order by id desc limit 1`, tu.TenantID, soID).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	var locationID int64
	err = pool.QueryRow(ctx, `
		select location_id from public.so_sales_orders
		where id = $1 and tenant_id = $2 and deleted_at is null`, soID, tu.TenantID).Scan(&locationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrSalesOrderNotFound
		}
		return 0, err
	}

	rows, err := pool.Query(ctx, openSalesOrderLineBalanceSQL()+`
		where ln.sales_order_id = $1
		order by ln.line_no`, soID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	type soLine struct {
		lineID   int64
		itemID   *int64
		itemCode string
		openQty  float64
	}
	var lines []soLine
	for rows.Next() {
		var ln openSalesOrderLineForWO
		if err := rows.Scan(&ln.SalesOrderLineID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName,
			&ln.Description, &ln.OpenQty, &ln.UnitVatInc, &ln.Remark); err != nil {
			return 0, err
		}
		if ln.OpenQty <= 0.0001 || ln.ItemID == nil {
			continue
		}
		lines = append(lines, soLine{lineID: ln.SalesOrderLineID, itemID: ln.ItemID, itemCode: ln.ItemCode, openQty: ln.OpenQty})
	}
	if len(lines) == 0 {
		return 0, docflowValidation(map[string]string{"lines": "No open lines available on this sales order."})
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	orderDate := time.Now()
	var firstID int64
	created := 0
	var missingBOM []string
	// Surgical ECS patch: default FG QC to released (full processpolicy wiring needs full redeploy).
	inspectionStatus := "released"
	for _, ln := range lines {
		var bomID int64
		err := tx.QueryRow(ctx, `
			select id from public.mfg_boms
			where tenant_id = $1 and finished_item_id = $2 and is_active = true
			order by id desc limit 1`, tu.TenantID, *ln.itemID).Scan(&bomID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				label := strings.TrimSpace(ln.itemCode)
				if label == "" {
					label = fmt.Sprintf("item#%d", *ln.itemID)
				}
				missingBOM = append(missingBOM, label)
				continue
			}
			return 0, err
		}
		woNo := fmt.Sprintf("WO-%s-%04d", orderDate.Format("20060102"), time.Now().UnixNano()%10000+int64(created))
		lineID := ln.lineID
		var id int64
		err = tx.QueryRow(ctx, `
			insert into public.mfg_work_orders (
			  tenant_id, work_order_no, bom_id, finished_item_id, location_id,
			  qty_to_produce, order_date, source_sales_order_id, source_sales_order_line_id,
			  inspection_status, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6,$7::date,$8,$9,$10,$11)
			returning id`,
			tu.TenantID, woNo, bomID, *ln.itemID, locationID, ln.openQty,
			orderDate.Format("2006-01-02"), soID, lineID, inspectionStatus, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			return 0, err
		}
		if firstID == 0 {
			firstID = id
		}
		created++
	}
	if created == 0 {
		msg := "No open lines with an active BOM on this sales order."
		if len(missingBOM) > 0 {
			msg = fmt.Sprintf("No active BOM for item(s): %s. Create a BOM under Production → BOMs first.", strings.Join(missingBOM, ", "))
		}
		return 0, docflowValidation(map[string]string{"lines": msg})
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, err
	}
	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "manufacturing.work_order_create_from_sales_order", "mfg_work_order", &firstID, nil, map[string]any{"sales_order_id": soID, "created_count": created})
	return firstID, nil
}

func optionalInt64Query(r *http.Request, key string) (*int64, bool) {
	v := strings.TrimSpace(r.URL.Query().Get(key))
	if v == "" {
		return nil, false
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return nil, true
	}
	return &n, true
}

func formatDateNoDisplay(d time.Time, seq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d", d.Month(), d.Day(), d.Year(), seq)
}
