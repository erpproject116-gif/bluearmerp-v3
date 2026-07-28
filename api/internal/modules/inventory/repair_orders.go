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
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const entityRepairOrder = "inv_repair_order"

type RepairOrderLine struct {
	ID            int64    `json:"id,omitempty"`
	LineNo        int      `json:"line_no"`
	ItemID        *int64   `json:"item_id,omitempty"`
	ItemCode      string   `json:"item_code"`
	ItemName      string   `json:"item_name"`
	ProblemIssue  *string  `json:"problem_issue,omitempty"`
	ServiceCharge *float64 `json:"service_charge,omitempty"`
	TaxType       *string  `json:"tax_type,omitempty"`
	Qty           float64  `json:"qty"`
	Mop           *string  `json:"mop,omitempty"`
	SerialLotNo   *string  `json:"serial_lot_no,omitempty"`
	Remark        *string  `json:"remark,omitempty"`
}

type RepairOrder struct {
	ID                      int64             `json:"id"`
	OrderDate               string            `json:"order_date"`
	DateSeq                 int               `json:"date_seq"`
	DateNoDisplay           string            `json:"date_no_display"`
	RepairOrderNo           string            `json:"repair_order_no"`
	PartnerID               int64             `json:"partner_id"`
	CustomerName            string            `json:"customer_name"`
	PicUserID               *int64            `json:"pic_user_id,omitempty"`
	PicName                 string            `json:"pic_name"`
	LocationID              int64             `json:"location_id"`
	LocationName            string            `json:"location_name,omitempty"`
	ProjectID               *int64            `json:"project_id,omitempty"`
	ProjectName             *string           `json:"project_name,omitempty"`
	TechnicianName          *string           `json:"technician_name,omitempty"`
	ProgressStatus          string            `json:"progress_status"`
	ScheduledCompletionDate *string           `json:"scheduled_completion_date,omitempty"`
	LatestUpdate            *string           `json:"latest_update,omitempty"`
	RepairDetails           *string           `json:"repair_details,omitempty"`
	SalesID                 *int64            `json:"sales_id,omitempty"`
	SalesLineID             *int64            `json:"sales_line_id,omitempty"`
	SerialUnitID            *int64            `json:"serial_unit_id,omitempty"`
	ReleaseLocationID       *int64            `json:"release_location_id,omitempty"`
	SalesNo                 *string           `json:"sales_no,omitempty"`
	SerialNo                *string           `json:"serial_no,omitempty"`
	Lines                   []RepairOrderLine `json:"lines,omitempty"`
	CustomValues            map[string]any    `json:"custom_values,omitempty"`
}

type repairOrderBody struct {
	OrderDate               string            `json:"order_date"`
	PartnerID               int64             `json:"partner_id"`
	PicUserID               *int64            `json:"pic_user_id"`
	PicName                 string            `json:"pic_name"`
	LocationID              int64             `json:"location_id"`
	ProjectID               *int64            `json:"project_id"`
	ProjectName             *string           `json:"project_name"`
	TechnicianName          *string           `json:"technician_name"`
	ProgressStatus          string            `json:"progress_status"`
	ScheduledCompletionDate *string           `json:"scheduled_completion_date"`
	LatestUpdate            *string           `json:"latest_update"`
	RepairDetails           *string           `json:"repair_details"`
	SalesID                 *int64            `json:"sales_id"`
	SalesLineID             *int64            `json:"sales_line_id"`
	SerialUnitID            *int64            `json:"serial_unit_id"`
	ReleaseLocationID       *int64            `json:"release_location_id"`
	ReceiveToRMA            bool              `json:"receive_to_rma"`
	Lines                   []RepairOrderLine `json:"lines"`
	CustomValues            map[string]any    `json:"custom_values"`
}

func registerRepairOrderRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/repair-orders/preview-sequences", previewRepairSequences(pool))
	r.Get("/repair-orders/rma-candidates", listRMACandidates(pool))
	r.Get("/repair-orders/status-report/export", exportRepairOrderStatusReport(pool))
	r.Get("/repair-orders/status-report", listRepairOrderStatusReport(pool))
	r.Get("/repair-orders", listRepairOrders(pool))
	r.Get("/repair-orders/{id}/print", getRepairOrderPrint(pool))
	r.Patch("/repair-orders/{id}/progress-status", patchRepairOrderProgressStatus(pool))
	r.Get("/repair-orders/{id}", getRepairOrder(pool))
	r.Post("/repair-orders", createRepairOrder(pool))
	r.Patch("/repair-orders/{id}", updateRepairOrder(pool))
	r.Delete("/repair-orders/{id}", deleteRepairOrder(pool))
	r.Get("/after-sales/users", lookupAfterSalesUsers(pool))
}

func formatDateNo(orderDate time.Time, dateSeq int) string {
	return fmt.Sprintf("%02d/%02d/%04d-%d",
		orderDate.Month(), orderDate.Day(), orderDate.Year(), dateSeq)
}

func parseDate(s string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(s))
}

func optionalDate(s *string) (*time.Time, error) {
	if s == nil || strings.TrimSpace(*s) == "" {
		return nil, nil
	}
	t, err := parseDate(*s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func datePtrToStr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format("2006-01-02")
	return &s
}

func previewRepairSequences(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("order_date"))
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		orderDate, err := parseDate(dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		var dateSeq int
		var repairOrderNo string
		err = pool.QueryRow(r.Context(),
			`select date_seq, repair_order_no from public.preview_repair_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &repairOrderNo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to preview sequences.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{
			"date_seq":          dateSeq,
			"repair_order_no":   repairOrderNo,
			"date_no_display":   formatDateNo(orderDate, dateSeq),
		}, "OK")
	}
}

func listRepairOrders(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"order_date":                "ro.order_date",
		"repair_order_no":           "ro.repair_order_no",
		"latest_update":             "ro.latest_update",
		"customer_name":             "p.company_name",
		"pic_name":                  "ro.pic_name",
		"scheduled_completion_date": "ro.scheduled_completion_date",
		"progress_status":           "ro.progress_status",
		"created_at":                "ro.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "order_date", allowed)
		offset := httputil.Offset(p)

		where := "ro.tenant_id = $1 and ro.deleted_at is null"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(` and (
				ro.repair_order_no ilike $%d or ro.latest_update ilike $%d or
				p.company_name ilike $%d or ro.pic_name ilike $%d)`, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		progress := strings.TrimSpace(r.URL.Query().Get("progress_status"))
		if progress == "received" || progress == "finished" {
			where += fmt.Sprintf(" and ro.progress_status = $%d", argN)
			args = append(args, progress)
			argN++
		} else if p.Status == "received" || p.Status == "finished" {
			where += fmt.Sprintf(" and ro.progress_status = $%d", argN)
			args = append(args, p.Status)
			argN++
		}

		scope, argN := tu.PicScopeSQL("ro.pic_user_id", argN, &args)
		where += scope

		order := orderSQL(p.Order)
		q := fmt.Sprintf(`
			select ro.id, ro.order_date, ro.date_seq, ro.repair_order_no,
			  ro.partner_id, p.company_name, ro.pic_user_id, ro.pic_name,
			  ro.location_id, ro.progress_status, ro.scheduled_completion_date,
			  ro.latest_update, count(*) over()
			from public.inv_repair_orders ro
			join public.inv_partners p on p.id = ro.partner_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, order, argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list repair orders.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		type listRow struct {
			ID                      int64
			OrderDate               time.Time
			DateSeq                 int
			RepairOrderNo           string
			PartnerID               int64
			CustomerName            string
			PicUserID               *int64
			PicName                 string
			LocationID              int64
			ProgressStatus          string
			ScheduledCompletionDate *time.Time
			LatestUpdate            *string
			Total                   int64
		}

		var out []RepairOrder
		var total int64
		for rows.Next() {
			var row listRow
			if err := rows.Scan(&row.ID, &row.OrderDate, &row.DateSeq, &row.RepairOrderNo,
				&row.PartnerID, &row.CustomerName, &row.PicUserID, &row.PicName,
				&row.LocationID, &row.ProgressStatus, &row.ScheduledCompletionDate,
				&row.LatestUpdate, &row.Total); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read repair orders.", "ERR_INTERNAL")
				return
			}
			total = row.Total
			out = append(out, RepairOrder{
				ID:                      row.ID,
				OrderDate:               row.OrderDate.Format("2006-01-02"),
				DateSeq:                 row.DateSeq,
				DateNoDisplay:           formatDateNo(row.OrderDate, row.DateSeq),
				RepairOrderNo:           row.RepairOrderNo,
				PartnerID:               row.PartnerID,
				CustomerName:            row.CustomerName,
				PicUserID:               row.PicUserID,
				PicName:                 row.PicName,
				LocationID:              row.LocationID,
				ProgressStatus:          row.ProgressStatus,
				ScheduledCompletionDate: datePtrToStr(row.ScheduledCompletionDate),
				LatestUpdate:            row.LatestUpdate,
			})
		}
		if out == nil {
			out = []RepairOrder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getRepairOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		ro, err := loadRepairOrder(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Repair order not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, ro, "OK")
	}
}

func loadRepairOrder(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (RepairOrder, error) {
	var ro RepairOrder
	var orderDate time.Time
	var sched *time.Time
	var projectName, tech, latest, details *string

	err := pool.QueryRow(ctx, `
		select ro.id, ro.order_date, ro.date_seq, ro.repair_order_no,
		  ro.partner_id, p.company_name, ro.pic_user_id, ro.pic_name,
		  ro.location_id, l.location_name, ro.project_id, ro.project_name,
		  ro.technician_name, ro.progress_status, ro.scheduled_completion_date,
		  ro.latest_update, ro.repair_details,
		  ro.sales_id, ro.sales_line_id, ro.serial_unit_id, ro.release_location_id,
		  s.sales_no, su.serial_no
		from public.inv_repair_orders ro
		join public.inv_partners p on p.id = ro.partner_id
		join public.inv_locations l on l.id = ro.location_id
		left join public.sa_sales s on s.id = ro.sales_id
		left join public.inv_serial_units su on su.id = ro.serial_unit_id
		where ro.id = $1 and ro.tenant_id = $2 and ro.deleted_at is null`,
		id, tenantID).Scan(
		&ro.ID, &orderDate, &ro.DateSeq, &ro.RepairOrderNo,
		&ro.PartnerID, &ro.CustomerName, &ro.PicUserID, &ro.PicName,
		&ro.LocationID, &ro.LocationName, &ro.ProjectID, &projectName,
		&tech, &ro.ProgressStatus, &sched, &latest, &details,
		&ro.SalesID, &ro.SalesLineID, &ro.SerialUnitID, &ro.ReleaseLocationID,
		&ro.SalesNo, &ro.SerialNo,
	)
	if err != nil {
		return RepairOrder{}, err
	}
	ro.OrderDate = orderDate.Format("2006-01-02")
	ro.DateNoDisplay = formatDateNo(orderDate, ro.DateSeq)
	ro.ProjectName = projectName
	ro.TechnicianName = tech
	ro.ScheduledCompletionDate = datePtrToStr(sched)
	ro.LatestUpdate = latest
	ro.RepairDetails = details

	lines, err := loadRepairOrderLines(ctx, pool, id)
	if err != nil {
		return RepairOrder{}, err
	}
	ro.Lines = lines
	ro.CustomValues = attachCustom(ctx, pool, tenantID, entityRepairOrder, id)
	return ro, nil
}

func loadRepairOrderLines(ctx context.Context, pool *pgxpool.Pool, orderID int64) ([]RepairOrderLine, error) {
	rows, err := pool.Query(ctx, `
		select id, line_no, item_id, item_code, item_name, problem_issue,
		  service_charge::float8, tax_type, qty::float8, mop, serial_lot_no, remark
		from public.inv_repair_order_lines
		where repair_order_id = $1
		order by line_no`, orderID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var lines []RepairOrderLine
	for rows.Next() {
		var ln RepairOrderLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName,
			&ln.ProblemIssue, &ln.ServiceCharge, &ln.TaxType, &ln.Qty, &ln.Mop, &ln.SerialLotNo, &ln.Remark); err != nil {
			return nil, err
		}
		lines = append(lines, ln)
	}
	if lines == nil {
		lines = []RepairOrderLine{}
	}
	return lines, nil
}

func createRepairOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body repairOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateRepairOrderBody(body, true); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date. Use YYYY-MM-DD."})
			return
		}
		sched, err := optionalDate(body.ScheduledCompletionDate)
		if err != nil {
			response.Validation(w, map[string]string{"scheduled_completion_date": "Invalid date."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var dateSeq int
		var repairOrderNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, repair_order_no from public.allocate_repair_order_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &repairOrderNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate sequences.", "ERR_INTERNAL")
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_repair_orders (
			  tenant_id, order_date, date_seq, repair_order_no,
			  partner_id, pic_user_id, pic_name, location_id,
			  project_id, project_name, technician_name, progress_status,
			  scheduled_completion_date, latest_update, repair_details,
			  sales_id, sales_line_id, serial_unit_id, release_location_id
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
			returning id`,
			tu.TenantID, orderDate, dateSeq, repairOrderNo,
			body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName), body.LocationID,
			body.ProjectID, body.ProjectName, body.TechnicianName, defaultProgress(body.ProgressStatus),
			sched, body.LatestUpdate, body.RepairDetails,
			body.SalesID, body.SalesLineID, body.SerialUnitID, body.ReleaseLocationID).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert repair order.", "ERR_INTERNAL")
			return
		}

		if body.ReceiveToRMA || (body.SerialUnitID != nil && *body.SerialUnitID > 0) {
			if err := applyRepairRMAReceive(r.Context(), tx, tu.TenantID, id, body.LocationID, body.SalesID, body.SalesLineID, body.SerialUnitID); err != nil {
				response.Validation(w, map[string]string{"serial_unit_id": err.Error()})
				return
			}
		}
		if defaultProgress(body.ProgressStatus) == "released" {
			relLoc := int64(0)
			if body.ReleaseLocationID != nil {
				relLoc = *body.ReleaseLocationID
			}
			if err := applyRepairRMARelease(r.Context(), tx, tu.TenantID, id, relLoc, body.SerialUnitID); err != nil {
				response.Validation(w, map[string]string{"release_location_id": err.Error()})
				return
			}
		}

		if err := replaceRepairOrderLines(r.Context(), tx, id, body.Lines); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityRepairOrder, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_order.create", "inv_repair_order", &id, nil, body)
		ro, _ := loadRepairOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, ro, "Created.")
	}
}

func updateRepairOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body repairOrderBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateRepairOrderBody(body, false); errs != nil {
			response.Validation(w, errs)
			return
		}

		orderDate, err := parseDate(body.OrderDate)
		if err != nil {
			response.Validation(w, map[string]string{"order_date": "Invalid date."})
			return
		}
		sched, err := optionalDate(body.ScheduledCompletionDate)
		if err != nil {
			response.Validation(w, map[string]string{"scheduled_completion_date": "Invalid date."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_repair_orders set
			  order_date = $1, partner_id = $2, pic_user_id = $3, pic_name = $4,
			  location_id = $5, project_id = $6, project_name = $7, technician_name = $8,
			  progress_status = $9, scheduled_completion_date = $10,
			  latest_update = $11, repair_details = $12,
			  sales_id = $13, sales_line_id = $14, serial_unit_id = coalesce($15, serial_unit_id),
			  release_location_id = $16,
			  updated_at = now()
			where id = $17 and tenant_id = $18 and deleted_at is null`,
			orderDate, body.PartnerID, body.PicUserID, strings.TrimSpace(body.PicName),
			body.LocationID, body.ProjectID, body.ProjectName, body.TechnicianName,
			defaultProgress(body.ProgressStatus), sched, body.LatestUpdate, body.RepairDetails,
			body.SalesID, body.SalesLineID, body.SerialUnitID, body.ReleaseLocationID,
			id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Repair order not found.", "ERR_NOT_FOUND")
			return
		}

		if body.ReceiveToRMA || (body.SerialUnitID != nil && *body.SerialUnitID > 0 && defaultProgress(body.ProgressStatus) == "received") {
			if err := applyRepairRMAReceive(r.Context(), tx, tu.TenantID, id, body.LocationID, body.SalesID, body.SalesLineID, body.SerialUnitID); err != nil {
				response.Validation(w, map[string]string{"serial_unit_id": err.Error()})
				return
			}
		}
		if defaultProgress(body.ProgressStatus) == "released" {
			relLoc := int64(0)
			if body.ReleaseLocationID != nil {
				relLoc = *body.ReleaseLocationID
			}
			var serialID *int64 = body.SerialUnitID
			if serialID == nil {
				_ = tx.QueryRow(r.Context(), `select serial_unit_id from public.inv_repair_orders where id = $1`, id).Scan(&serialID)
			}
			if err := applyRepairRMARelease(r.Context(), tx, tu.TenantID, id, relLoc, serialID); err != nil {
				response.Validation(w, map[string]string{"release_location_id": err.Error()})
				return
			}
		}

		if err := replaceRepairOrderLines(r.Context(), tx, id, body.Lines); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save lines.", "ERR_INTERNAL")
			return
		}
		if errs := saveCustom(r.Context(), tx, tu.TenantID, entityRepairOrder, id, body.CustomValues); errs != nil {
			response.Validation(w, errs)
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.repair_order.update", "inv_repair_order", &id, nil, body)
		ro, _ := loadRepairOrder(r.Context(), pool, tu.TenantID, id)
		response.OK(w, ro, "Updated.")
	}
}

func deleteRepairOrder(pool *pgxpool.Pool) http.HandlerFunc {
	return softDeleteHandler(pool, "inv_repair_orders", "inventory.repair_order.delete", "inv_repair_order")
}

func replaceRepairOrderLines(ctx context.Context, tx pgx.Tx, orderID int64, lines []RepairOrderLine) error {
	if _, err := tx.Exec(ctx, `delete from public.inv_repair_order_lines where repair_order_id = $1`, orderID); err != nil {
		return err
	}
	for i, ln := range lines {
		lineNo := ln.LineNo
		if lineNo <= 0 {
			lineNo = i + 1
		}
		_, err := tx.Exec(ctx, `
			insert into public.inv_repair_order_lines (
			  repair_order_id, line_no, item_id, item_code, item_name,
			  problem_issue, service_charge, tax_type, qty, mop, serial_lot_no, remark
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
			orderID, lineNo, ln.ItemID, strings.TrimSpace(ln.ItemCode), strings.TrimSpace(ln.ItemName),
			ln.ProblemIssue, ln.ServiceCharge, ln.TaxType, ln.Qty, ln.Mop, ln.SerialLotNo, ln.Remark)
		if err != nil {
			return err
		}
	}
	return nil
}

func validateRepairOrderBody(b repairOrderBody, create bool) map[string]string {
	errs := map[string]string{}
	if create && strings.TrimSpace(b.OrderDate) == "" {
		errs["order_date"] = "Order date is required."
	}
	if b.PartnerID <= 0 {
		errs["partner_id"] = "Customer is required."
	}
	if b.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if b.ProgressStatus != "" && !isValidRepairProgress(b.ProgressStatus) {
		errs["progress_status"] = "Invalid progress status."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func isValidRepairProgress(s string) bool {
	switch s {
	case "received", "diagnosing", "repairing", "awaiting_parts", "finished", "released":
		return true
	default:
		return false
	}
}

func defaultProgress(s string) string {
	if isValidRepairProgress(s) {
		return s
	}
	return "received"
}

func lookupAfterSalesUsers(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		limit := 20
		var rows pgx.Rows
		var err error
		if q == "" {
			rows, err = pool.Query(r.Context(), `
				select id, full_name, email from public.users
				where tenant_id = $1 and status = 'active'
				order by full_name limit $2`, tu.TenantID, limit)
		} else {
			rows, err = pool.Query(r.Context(), `
				select id, full_name, email from public.users
				where tenant_id = $1 and status = 'active'
				  and (full_name ilike $2 or email ilike $2)
				order by full_name limit $3`, tu.TenantID, "%"+q+"%", limit)
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to lookup users.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		type userRow struct {
			ID       int64  `json:"id"`
			FullName string `json:"full_name"`
			Email    string `json:"email"`
		}
		var out []userRow
		for rows.Next() {
			var u userRow
			if err := rows.Scan(&u.ID, &u.FullName, &u.Email); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read users.", "ERR_INTERNAL")
				return
			}
			out = append(out, u)
		}
		if out == nil {
			out = []userRow{}
		}
		response.OK(w, out, "OK")
	}
}
