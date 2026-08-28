package inventory

import (
	"context"
	"encoding/json"
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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxContainerBatchSize = 100

type ContainerScanStatus string

const (
	ContainerScanAccepted         ContainerScanStatus = "accepted"
	ContainerScanDuplicate        ContainerScanStatus = "duplicate"
	ContainerScanLineFull         ContainerScanStatus = "line_full"
	ContainerScanInvalidLine      ContainerScanStatus = "invalid_line"
	ContainerScanIdempotentReplay ContainerScanStatus = "idempotent_replay"
	ContainerScanEmpty            ContainerScanStatus = "empty"
	ContainerScanBatchDuplicate   ContainerScanStatus = "batch_duplicate"
)

type ContainerScanInput struct {
	ClientScanID       string
	GoodsReceiptLineID int64
	ContainerNo        string
	ContainerType      string
	GrossWeightKg      *float64
	TareWeightKg       *float64
	NetWeightKg        float64
	LotNo              string
	ExpiryDate         *time.Time
}

type ContainerScanResult struct {
	ClientScanID string              `json:"client_scan_id,omitempty"`
	ContainerNo  string              `json:"container_no"`
	NetWeightKg  float64             `json:"net_weight_kg,omitempty"`
	Status       ContainerScanStatus `json:"status"`
	ContainerID  *int64              `json:"container_id,omitempty"`
	LotID        *int64              `json:"lot_id,omitempty"`
	Message      string              `json:"message,omitempty"`
}

type ContainerLineRow struct {
	ID       int64   `json:"id"`
	ItemID   int64   `json:"item_id"`
	ItemCode string  `json:"item_code,omitempty"`
	ItemName string  `json:"item_name,omitempty"`
	WeightKg float64 `json:"weight_kg"`
	Notes    *string `json:"notes,omitempty"`
}

type ContainerRow struct {
	ID                 int64              `json:"id"`
	ContainerNo        string             `json:"container_no"`
	ContainerType      string             `json:"container_type"`
	ItemID             int64              `json:"item_id"`
	ItemCode           string             `json:"item_code,omitempty"`
	ItemName           string             `json:"item_name,omitempty"`
	LotBatchID         *int64             `json:"lot_batch_id,omitempty"`
	LotNo              string             `json:"lot_no,omitempty"`
	LocationID         int64              `json:"location_id"`
	LocationName       string             `json:"location_name,omitempty"`
	Status             string             `json:"status"`
	GrossWeightKg      *float64           `json:"gross_weight_kg,omitempty"`
	TareWeightKg       *float64           `json:"tare_weight_kg,omitempty"`
	NetWeightKg        float64            `json:"net_weight_kg"`
	GoodsReceiptLineID *int64             `json:"goods_receipt_line_id,omitempty"`
	ReceivedAt         *string            `json:"received_at,omitempty"`
	OpenedAt           *string            `json:"opened_at,omitempty"`
	CreatedAt          string             `json:"created_at"`
	UpdatedAt          string             `json:"updated_at"`
	Lines              []ContainerLineRow `json:"lines,omitempty"`
}

type containerBody struct {
	ContainerNo   string   `json:"container_no"`
	ContainerType string   `json:"container_type"`
	ItemID        int64    `json:"item_id"`
	LocationID    int64    `json:"location_id"`
	LotBatchID    *int64   `json:"lot_batch_id"`
	GrossWeightKg *float64 `json:"gross_weight_kg"`
	TareWeightKg    *float64 `json:"tare_weight_kg"`
	NetWeightKg   float64  `json:"net_weight_kg"`
}

type containerOpenLineBody struct {
	ItemID   int64   `json:"item_id"`
	WeightKg float64 `json:"weight_kg"`
	Notes    *string `json:"notes"`
}

type containerOpenBody struct {
	Lines []containerOpenLineBody `json:"lines"`
}

type grContainerLineState struct {
	GRLineID    int64
	GRID        int64
	LocationID  int64
	ExpectedQty float64
	ReceivedQty float64
	TrackLot    bool
	CatchWeight bool
	ItemID      int64
	ItemCode    string
	ShelfDays   *int
}

func registerContainerRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/containers", listContainers(pool))
	r.Get("/containers/{id}", getContainer(pool))
	r.Post("/containers", createContainer(pool))
	r.Patch("/containers/{id}", updateContainer(pool))
	r.Post("/containers/{id}/open", openContainer(pool))
}

func listContainers(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"container_no":  "c.container_no",
		"item_code":     "i.item_code",
		"status":        "c.status",
		"net_weight_kg": "c.net_weight_kg",
		"created_at":    "c.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		offset := httputil.Offset(p)

		where := "c.tenant_id = $1 and c.status <> 'void'"
		args := []any{tu.TenantID}
		argN := 2

		if p.Q != "" {
			where += fmt.Sprintf(" and (c.container_no ilike $%d or i.item_code ilike $%d or i.item_name ilike $%d)", argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and c.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if id, ok := optionalInt64Query(r, "item_id"); ok {
			where += fmt.Sprintf(" and c.item_id = $%d", argN)
			args = append(args, *id)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and c.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "c.created_at"
		}

		q := fmt.Sprintf(`
			select c.id, c.container_no, c.container_type, c.item_id,
			  coalesce(i.item_code, ''), coalesce(i.item_name, ''),
			  c.lot_batch_id, coalesce(lb.lot_no, ''),
			  c.location_id, coalesce(loc.location_name, ''),
			  c.status, c.gross_weight_kg::float8, c.tare_weight_kg::float8, c.net_weight_kg::float8,
			  c.goods_receipt_line_id, c.received_at, c.opened_at,
			  c.created_at, c.updated_at, count(*) over()
			from public.inv_containers c
			join public.inv_items i on i.id = c.item_id
			left join public.inv_lot_batches lb on lb.id = c.lot_batch_id
			left join public.inv_locations loc on loc.id = c.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list containers.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []ContainerRow
		var total int64
		for rows.Next() {
			row, err := scanContainerListRow(rows)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read containers.", "ERR_INTERNAL")
				return
			}
			total = row.total
			out = append(out, row.row)
		}
		if out == nil {
			out = []ContainerRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

type containerListScan struct {
	row   ContainerRow
	total int64
}

func scanContainerListRow(rows pgx.Rows) (containerListScan, error) {
	var out containerListScan
	var recv, opened *time.Time
	var createdAt, updatedAt time.Time
	if err := rows.Scan(
		&out.row.ID, &out.row.ContainerNo, &out.row.ContainerType, &out.row.ItemID,
		&out.row.ItemCode, &out.row.ItemName,
		&out.row.LotBatchID, &out.row.LotNo,
		&out.row.LocationID, &out.row.LocationName,
		&out.row.Status, &out.row.GrossWeightKg, &out.row.TareWeightKg, &out.row.NetWeightKg,
		&out.row.GoodsReceiptLineID, &recv, &opened,
		&createdAt, &updatedAt, &out.total,
	); err != nil {
		return containerListScan{}, err
	}
	out.row.ReceivedAt = formatTimePtr(recv)
	out.row.OpenedAt = formatTimePtr(opened)
	out.row.CreatedAt = createdAt.Format(time.RFC3339)
	out.row.UpdatedAt = updatedAt.Format(time.RFC3339)
	return out, nil
}

func getContainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadContainer(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Container not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createContainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body containerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateContainerBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}
		containerNo := strings.TrimSpace(body.ContainerNo)
		if containerNo == "" {
			containerNo = autoContainerNo("ITEM")
		}
		containerType := strings.TrimSpace(body.ContainerType)
		if containerType == "" {
			containerType = "box"
		}

		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_containers (
			  tenant_id, container_no, container_type, item_id, lot_batch_id, location_id,
			  status, gross_weight_kg, tare_weight_kg, net_weight_kg
			) values ($1,$2,$3,$4,$5,$6,'in_stock',$7,$8,$9)
			returning id`,
			tu.TenantID, containerNo, containerType, body.ItemID, body.LotBatchID, body.LocationID,
			body.GrossWeightKg, body.TareWeightKg, body.NetWeightKg,
		).Scan(&id)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				response.Validation(w, map[string]string{"container_no": "Container number already exists."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create container.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.container_create", "inv_container", &id, nil, body)
		row, _ := loadContainer(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Container created.")
	}
}

func updateContainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body containerBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.NetWeightKg <= 0 {
			response.Validation(w, map[string]string{"net_weight_kg": "Net weight must be greater than zero."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.inv_containers set
			  container_type = coalesce(nullif($1, ''), container_type),
			  gross_weight_kg = $2, tare_weight_kg = $3, net_weight_kg = $4,
			  updated_at = now()
			where id = $5 and tenant_id = $6 and status in ('in_stock', 'opened')`,
			strings.TrimSpace(body.ContainerType), body.GrossWeightKg, body.TareWeightKg, body.NetWeightKg, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Container not found or cannot be updated.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.container_update", "inv_container", &id, nil, body)
		row, _ := loadContainer(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Container updated.")
	}
}

func openContainer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body containerOpenBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one cut line is required."})
			return
		}
		for i, ln := range body.Lines {
			if ln.ItemID <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].item_id", i): "Item is required."})
				return
			}
			if ln.WeightKg <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].weight_kg", i): "Weight must be greater than zero."})
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open container.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.inv_containers
			where id = $1 and tenant_id = $2 for update`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Container not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "in_stock" {
			response.Validation(w, map[string]string{"status": "Only in-stock containers can be opened."})
			return
		}

		for _, ln := range body.Lines {
			var ok bool
			_ = tx.QueryRow(r.Context(), `
				select exists(select 1 from public.inv_items where id=$1 and tenant_id=$2 and deleted_at is null)`,
				ln.ItemID, tu.TenantID).Scan(&ok)
			if !ok {
				response.Validation(w, map[string]string{"lines": fmt.Sprintf("Item %d not found.", ln.ItemID)})
				return
			}
			_, err = tx.Exec(r.Context(), `
				insert into public.inv_container_lines (container_id, item_id, weight_kg, notes)
				values ($1, $2, $3, $4)`, id, ln.ItemID, ln.WeightKg, ln.Notes)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to record cut line.", "ERR_INTERNAL")
				return
			}
		}

		_, err = tx.Exec(r.Context(), `
			update public.inv_containers
			set status = 'opened', opened_at = now(), updated_at = now()
			where id = $1`, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open container.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to open container.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.container_open", "inv_container", &id, nil, body)
		row, _ := loadContainer(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Container opened.")
	}
}

func loadContainer(ctx context.Context, q pgxpoolConn, tenantID, id int64) (ContainerRow, error) {
	var row ContainerRow
	var recv, opened *time.Time
	var createdAt, updatedAt time.Time
	err := q.QueryRow(ctx, `
		select c.id, c.container_no, c.container_type, c.item_id,
		  coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  c.lot_batch_id, coalesce(lb.lot_no, ''),
		  c.location_id, coalesce(loc.location_name, ''),
		  c.status, c.gross_weight_kg::float8, c.tare_weight_kg::float8, c.net_weight_kg::float8,
		  c.goods_receipt_line_id, c.received_at, c.opened_at, c.created_at, c.updated_at
		from public.inv_containers c
		join public.inv_items i on i.id = c.item_id
		left join public.inv_lot_batches lb on lb.id = c.lot_batch_id
		left join public.inv_locations loc on loc.id = c.location_id
		where c.id = $1 and c.tenant_id = $2 and c.status <> 'void'`, id, tenantID).Scan(
		&row.ID, &row.ContainerNo, &row.ContainerType, &row.ItemID,
		&row.ItemCode, &row.ItemName,
		&row.LotBatchID, &row.LotNo,
		&row.LocationID, &row.LocationName,
		&row.Status, &row.GrossWeightKg, &row.TareWeightKg, &row.NetWeightKg,
		&row.GoodsReceiptLineID, &recv, &opened, &createdAt, &updatedAt)
	if err != nil {
		return ContainerRow{}, err
	}
	row.ReceivedAt = formatTimePtr(recv)
	row.OpenedAt = formatTimePtr(opened)
	row.CreatedAt = createdAt.Format(time.RFC3339)
	row.UpdatedAt = updatedAt.Format(time.RFC3339)

	lineRows, err := q.Query(ctx, `
		select cl.id, cl.item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  cl.weight_kg::float8, cl.notes
		from public.inv_container_lines cl
		left join public.inv_items i on i.id = cl.item_id
		where cl.container_id = $1
		order by cl.id`, id)
	if err != nil {
		return ContainerRow{}, err
	}
	defer lineRows.Close()
	for lineRows.Next() {
		var ln ContainerLineRow
		if err := lineRows.Scan(&ln.ID, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.WeightKg, &ln.Notes); err != nil {
			return ContainerRow{}, err
		}
		row.Lines = append(row.Lines, ln)
	}
	if row.Lines == nil {
		row.Lines = []ContainerLineRow{}
	}
	return row, nil
}

func validateContainerBody(b containerBody) map[string]string {
	errs := map[string]string{}
	if b.ItemID <= 0 {
		errs["item_id"] = "Item is required."
	}
	if b.LocationID <= 0 {
		errs["location_id"] = "Location is required."
	}
	if b.NetWeightKg <= 0 {
		errs["net_weight_kg"] = "Net weight must be greater than zero."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func autoContainerNo(itemCode string) string {
	code := strings.TrimSpace(itemCode)
	if code == "" {
		code = "ITEM"
	}
	return fmt.Sprintf("CNT-%s-%s", time.Now().UTC().Format("20060102"), code)
}

func resolveNetWeightKg(net, gross, tare float64, grossPtr, tarePtr *float64) float64 {
	if net > 0 {
		return net
	}
	g := gross
	if grossPtr != nil && *grossPtr > 0 {
		g = *grossPtr
	}
	t := tare
	if tarePtr != nil && *tarePtr > 0 {
		t = *tarePtr
	}
	if g > 0 {
		n := g - t
		if n > 0 {
			return n
		}
	}
	return 0
}

func loadGRContainerLineState(ctx context.Context, tx pgx.Tx, lineID int64) (grContainerLineState, error) {
	var st grContainerLineState
	err := tx.QueryRow(ctx, `
		select grl.id, grl.goods_receipt_id, gr.location_id,
		  grl.expected_qty::float8, grl.received_qty::float8,
		  coalesce(i.track_lot, false), coalesce(i.catch_weight, false),
		  coalesce(i.id, 0), coalesce(i.item_code, ''), i.default_shelf_life_days
		from public.gr_goods_receipt_lines grl
		join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		join public.po_purchase_order_lines pol on pol.id = grl.purchase_order_line_id
		left join public.inv_items i on i.id = pol.item_id
		where grl.id = $1`, lineID).Scan(
		&st.GRLineID, &st.GRID, &st.LocationID,
		&st.ExpectedQty, &st.ReceivedQty, &st.TrackLot, &st.CatchWeight,
		&st.ItemID, &st.ItemCode, &st.ShelfDays,
	)
	return st, err
}

func lookupIdempotentContainerLot(ctx context.Context, tx pgx.Tx, lineID int64, clientScanID string) (containerID, lotID int64, containerNo string, netWeight float64, ok bool) {
	if clientScanID == "" {
		return 0, 0, "", 0, false
	}
	err := tx.QueryRow(ctx, `
		select coalesce(gll.container_id, 0), gll.id, coalesce(gll.lot_no, ''), gll.qty::float8
		from public.gr_goods_receipt_line_lots gll
		where gll.goods_receipt_line_id = $1 and gll.client_scan_id = $2::uuid`,
		lineID, clientScanID).Scan(&containerID, &lotID, &containerNo, &netWeight)
	if err != nil || containerID <= 0 {
		return 0, 0, "", 0, false
	}
	return containerID, lotID, containerNo, netWeight, true
}

// ProcessContainerScans records weighed containers on a draft goods receipt (mirrors lot batch scan).
func ProcessContainerScans(ctx context.Context, tx pgx.Tx, tenantID, grID int64, scans []ContainerScanInput) ([]ContainerScanResult, error) {
	if len(scans) == 0 {
		return nil, errors.New("at least one container entry is required")
	}
	if len(scans) > maxContainerBatchSize {
		return nil, fmt.Errorf("maximum %d container entries per batch", maxContainerBatchSize)
	}

	var status string
	if err := tx.QueryRow(ctx, `
		select status from public.gr_goods_receipts
		where id = $1 and tenant_id = $2
		for update`, grID, tenantID).Scan(&status); err != nil {
		return nil, err
	}
	if status != "draft" {
		return nil, errors.New("only draft goods receipts accept containers")
	}

	lineCache := map[int64]grContainerLineState{}
	getLine := func(lineID int64) (grContainerLineState, error) {
		if st, ok := lineCache[lineID]; ok {
			return st, nil
		}
		st, err := loadGRContainerLineState(ctx, tx, lineID)
		if err != nil {
			return grContainerLineState{}, err
		}
		lineCache[lineID] = st
		return st, nil
	}

	seenInBatch := map[string]bool{}
	lineSeq := map[int64]int{}
	addedPerLine := map[int64]float64{}
	results := make([]ContainerScanResult, 0, len(scans))

	for _, sc := range scans {
		res := ContainerScanResult{
			ClientScanID: sc.ClientScanID,
			ContainerNo:  strings.TrimSpace(sc.ContainerNo),
		}

		if sc.GoodsReceiptLineID <= 0 {
			res.Status = ContainerScanInvalidLine
			res.Message = "Line is required."
			results = append(results, res)
			continue
		}

		netWeight := resolveNetWeightKg(sc.NetWeightKg, 0, 0, sc.GrossWeightKg, sc.TareWeightKg)
		res.NetWeightKg = netWeight
		if netWeight <= 0 {
			res.Status = ContainerScanEmpty
			res.Message = "Net weight must be greater than zero."
			results = append(results, res)
			continue
		}

		containerNo := strings.TrimSpace(sc.ContainerNo)
		if containerNo != "" {
			batchKey := fmt.Sprintf("%d:%s", sc.GoodsReceiptLineID, containerNo)
			if seenInBatch[batchKey] {
				res.Status = ContainerScanBatchDuplicate
				res.Message = "Duplicate container in batch."
				results = append(results, res)
				continue
			}
			seenInBatch[batchKey] = true
		}

		if containerID, lotID, cNo, qty, ok := lookupIdempotentContainerLot(ctx, tx, sc.GoodsReceiptLineID, sc.ClientScanID); ok {
			res.Status = ContainerScanIdempotentReplay
			res.ContainerID = &containerID
			res.LotID = &lotID
			res.ContainerNo = cNo
			res.NetWeightKg = qty
			results = append(results, res)
			continue
		}

		line, err := getLine(sc.GoodsReceiptLineID)
		if err != nil || line.GRID != grID {
			res.Status = ContainerScanInvalidLine
			res.Message = "Line not found on this goods receipt."
			results = append(results, res)
			continue
		}
		if !line.TrackLot {
			res.Status = ContainerScanInvalidLine
			res.Message = "Item does not track lots."
			results = append(results, res)
			continue
		}

		if containerNo == "" {
			lineSeq[line.GRLineID]++
			containerNo = fmt.Sprintf("%s-%03d", autoContainerNo(line.ItemCode), lineSeq[line.GRLineID])
		}
		res.ContainerNo = containerNo

		extra := addedPerLine[sc.GoodsReceiptLineID]
		if line.ReceivedQty+extra+netWeight > line.ExpectedQty+0.0001 {
			res.Status = ContainerScanLineFull
			res.Message = "Container weight exceeds open line quantity."
			results = append(results, res)
			continue
		}

		containerType := strings.TrimSpace(sc.ContainerType)
		if containerType == "" {
			containerType = "box"
		}

		lotNo := strings.TrimSpace(sc.LotNo)
		if lotNo == "" {
			lotNo = containerNo
		}

		expiry := sc.ExpiryDate
		if expiry == nil && line.ShelfDays != nil && *line.ShelfDays > 0 {
			d := time.Now().UTC().AddDate(0, 0, *line.ShelfDays)
			t := time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
			expiry = &t
		}

		var clientScanArg any
		if sc.ClientScanID != "" {
			clientScanArg = sc.ClientScanID
		}

		var containerID int64
		err = tx.QueryRow(ctx, `
			insert into public.inv_containers (
			  tenant_id, container_no, container_type, item_id, location_id,
			  status, gross_weight_kg, tare_weight_kg, net_weight_kg, goods_receipt_line_id
			) values ($1,$2,$3,$4,$5,'in_stock',$6,$7,$8,$9)
			returning id`,
			tenantID, containerNo, containerType, line.ItemID, line.LocationID,
			sc.GrossWeightKg, sc.TareWeightKg, netWeight, sc.GoodsReceiptLineID,
		).Scan(&containerID)
		if err != nil {
			res.Status = ContainerScanDuplicate
			res.Message = "Failed to record container."
			results = append(results, res)
			continue
		}

		var lotID int64
		err = tx.QueryRow(ctx, `
			insert into public.gr_goods_receipt_line_lots (
			  goods_receipt_line_id, lot_no, qty, expiry_date, client_scan_id, container_id
			) values ($1, $2, $3, $4, $5::uuid, $6)
			on conflict (goods_receipt_line_id, lot_no) do update set
			  qty = gr_goods_receipt_line_lots.qty + excluded.qty,
			  expiry_date = coalesce(excluded.expiry_date, gr_goods_receipt_line_lots.expiry_date),
			  client_scan_id = coalesce(gr_goods_receipt_line_lots.client_scan_id, excluded.client_scan_id),
			  container_id = coalesce(gr_goods_receipt_line_lots.container_id, excluded.container_id)
			returning id`,
			sc.GoodsReceiptLineID, lotNo, netWeight, expiry, clientScanArg, containerID).Scan(&lotID)
		if err != nil {
			res.Status = ContainerScanDuplicate
			res.Message = "Failed to record lot entry."
			results = append(results, res)
			continue
		}

		addedPerLine[sc.GoodsReceiptLineID] += netWeight
		res.Status = ContainerScanAccepted
		res.ContainerID = &containerID
		res.LotID = &lotID
		results = append(results, res)
	}

	for lineID, addQty := range addedPerLine {
		if addQty <= 0 {
			continue
		}
		_, err := tx.Exec(ctx, `
			update public.gr_goods_receipt_lines
			set received_qty = received_qty + $1
			where id = $2`, addQty, lineID)
		if err != nil {
			return nil, err
		}
	}

	return results, nil
}

// LinkContainersAfterGoodsReceiptPost sets lot_batch_id on containers after GR posting creates lot batches.
func LinkContainersAfterGoodsReceiptPost(ctx context.Context, tx pgx.Tx, tenantID, grLineID, itemID, locationID int64, receiptAt time.Time) error {
	_, err := tx.Exec(ctx, `
		update public.inv_containers c
		set lot_batch_id = lb.id,
		    received_at = $5,
		    updated_at = now()
		from public.gr_goods_receipt_line_lots gll
		join public.inv_lot_batches lb
		  on lb.tenant_id = $1 and lb.item_id = $2 and lb.lot_no = gll.lot_no and lb.location_id = $3
		where gll.goods_receipt_line_id = $4
		  and gll.container_id = c.id
		  and c.tenant_id = $1
		  and c.lot_batch_id is null`, tenantID, itemID, locationID, grLineID, receiptAt)
	return err
}
