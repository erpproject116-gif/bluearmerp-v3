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

const maxPackScanBatchSize = 100

type PackScanStatus string

const (
	PackScanAccepted         PackScanStatus = "accepted"
	PackScanDuplicate        PackScanStatus = "duplicate"
	PackScanInvalidContainer PackScanStatus = "invalid_container"
	PackScanIdempotentReplay PackScanStatus = "idempotent_replay"
	PackScanEmpty            PackScanStatus = "empty"
	PackScanBatchDuplicate   PackScanStatus = "batch_duplicate"
	PackScanSessionClosed    PackScanStatus = "session_closed"
)

type PackSessionRow struct {
	ID              int64  `json:"id"`
	PackNo          string `json:"pack_no"`
	SalesOrderID    *int64 `json:"sales_order_id,omitempty"`
	SalesOrderNo    string `json:"sales_order_no,omitempty"`
	LocationID      int64  `json:"location_id"`
	LocationName    string `json:"location_name,omitempty"`
	Status          string `json:"status"`
	Notes           *string `json:"notes,omitempty"`
	CreatedByUserID *int64  `json:"created_by_user_id,omitempty"`
	CompletedAt     *string `json:"completed_at,omitempty"`
	CreatedAt       string  `json:"created_at"`
	UpdatedAt       string  `json:"updated_at"`
	Lines           []PackSessionLineRow `json:"lines,omitempty"`
}

type PackSessionLineRow struct {
	ID          int64   `json:"id"`
	LineNo      int     `json:"line_no"`
	ItemID      int64   `json:"item_id"`
	ItemCode    string  `json:"item_code,omitempty"`
	ItemName    string  `json:"item_name,omitempty"`
	ContainerID *int64  `json:"container_id,omitempty"`
	ContainerNo string  `json:"container_no,omitempty"`
	LotBatchID  *int64  `json:"lot_batch_id,omitempty"`
	LotNo       string  `json:"lot_no,omitempty"`
	Qty         float64 `json:"qty"`
}

type packSessionBody struct {
	SalesOrderID *int64  `json:"sales_order_id"`
	LocationID   int64   `json:"location_id"`
	Notes        *string `json:"notes"`
}

type packScanInput struct {
	ClientPackID string
	ContainerNo  string
	ContainerID  int64
	Qty          float64
}

type packScanResult struct {
	ClientPackID string         `json:"client_pack_id,omitempty"`
	ContainerNo  string         `json:"container_no"`
	Qty          float64        `json:"qty,omitempty"`
	Status       PackScanStatus `json:"status"`
	LineID       *int64         `json:"line_id,omitempty"`
	Message      string         `json:"message,omitempty"`
}

type packScanBatchBody struct {
	Scans []struct {
		ClientPackID string  `json:"client_pack_id"`
		ContainerNo  string  `json:"container_no"`
		ContainerID  int64   `json:"container_id"`
		Qty          float64 `json:"qty"`
	} `json:"scans"`
}

func registerPackSessionRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/pack-sessions", listPackSessions(pool))
	r.Get("/pack-sessions/{id}", getPackSession(pool))
	r.Post("/pack-sessions", createPackSession(pool))
	r.Post("/pack-sessions/{id}/scans/batch", batchPackSessionScans(pool))
	r.Post("/pack-sessions/{id}/complete", completePackSession(pool))
}

func listPackSessions(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"pack_no":    "ps.pack_no",
		"status":     "ps.status",
		"created_at": "ps.created_at",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "created_at", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		where := "ps.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and ps.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if id, ok := optionalInt64Query(r, "location_id"); ok {
			where += fmt.Sprintf(" and ps.location_id = $%d", argN)
			args = append(args, *id)
			argN++
		}

		sortCol := allowed[p.Sort]
		if sortCol == "" {
			sortCol = "ps.created_at"
		}

		q := fmt.Sprintf(`
			select ps.id, ps.pack_no, ps.sales_order_id, coalesce(so.sales_order_no, ''),
			  ps.location_id, coalesce(loc.location_name, ''), ps.status, ps.notes,
			  ps.created_by_user_id, ps.completed_at, ps.created_at, ps.updated_at,
			  count(*) over()
			from public.inv_pack_sessions ps
			left join public.so_sales_orders so on so.id = ps.sales_order_id
			left join public.inv_locations loc on loc.id = ps.location_id
			where %s
			order by %s %s
			limit $%d offset $%d`, where, sortCol, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list pack sessions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []PackSessionRow
		var total int64
		for rows.Next() {
			var row PackSessionRow
			var completed *time.Time
			var createdAt, updatedAt time.Time
			if err := rows.Scan(
				&row.ID, &row.PackNo, &row.SalesOrderID, &row.SalesOrderNo,
				&row.LocationID, &row.LocationName, &row.Status, &row.Notes,
				&row.CreatedByUserID, &completed, &createdAt, &updatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read pack sessions.", "ERR_INTERNAL")
				return
			}
			row.CompletedAt = formatTimePtr(completed)
			row.CreatedAt = createdAt.Format(time.RFC3339)
			row.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, row)
		}
		if out == nil {
			out = []PackSessionRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func getPackSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := loadPackSession(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pack session not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func createPackSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body packSessionBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if body.LocationID <= 0 {
			response.Validation(w, map[string]string{"location_id": "Location is required."})
			return
		}
		var locTenant int64
		if err := pool.QueryRow(r.Context(), `select tenant_id from public.inv_locations where id = $1`, body.LocationID).Scan(&locTenant); err != nil || locTenant != tu.TenantID {
			response.Validation(w, map[string]string{"location_id": "Invalid location."})
			return
		}
		if body.SalesOrderID != nil && *body.SalesOrderID > 0 {
			var ok bool
			_ = pool.QueryRow(r.Context(), `select exists(select 1 from public.so_sales_orders where id=$1 and tenant_id=$2)`, *body.SalesOrderID, tu.TenantID).Scan(&ok)
			if !ok {
				response.Validation(w, map[string]string{"sales_order_id": "Sales order not found."})
				return
			}
		}

		packNo := fmt.Sprintf("PACK-%s-%04d", time.Now().UTC().Format("20060102"), time.Now().Unix()%10000)
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.inv_pack_sessions (
			  tenant_id, pack_no, sales_order_id, location_id, notes, created_by_user_id
			) values ($1,$2,$3,$4,$5,$6)
			returning id`,
			tu.TenantID, packNo, body.SalesOrderID, body.LocationID, body.Notes, tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create pack session.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.pack_session_create", "inv_pack_session", &id, nil, body)
		row, _ := loadPackSession(r.Context(), pool, tu.TenantID, id)
		response.OK(w, row, "Pack session created.")
	}
}

func batchPackSessionScans(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body packScanBatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Scans) == 0 {
			response.Validation(w, map[string]string{"scans": "At least one scan is required."})
			return
		}
		if len(body.Scans) > maxPackScanBatchSize {
			response.Validation(w, map[string]string{"scans": fmt.Sprintf("Maximum %d scans per batch.", maxPackScanBatchSize)})
			return
		}

		inputs := make([]packScanInput, len(body.Scans))
		for i, sc := range body.Scans {
			inputs[i] = packScanInput{
				ClientPackID: sc.ClientPackID,
				ContainerNo:  sc.ContainerNo,
				ContainerID:  sc.ContainerID,
				Qty:          sc.Qty,
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process scans.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		results, err := processPackScans(r.Context(), tx, tu.TenantID, sessionID, inputs)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				response.Err(w, http.StatusNotFound, "Pack session not found.", "ERR_NOT_FOUND")
				return
			}
			if err.Error() == "only open pack sessions accept scans" {
				response.Validation(w, map[string]string{"status": "Only open pack sessions accept scans."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to process scans.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to process scans.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.pack_session_scan_batch", "inv_pack_session", &sessionID, nil, map[string]any{"count": len(body.Scans)})
		response.OK(w, map[string]any{"results": results}, "Batch processed.")
	}
}

func completePackSession(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to complete pack session.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var status string
		err = tx.QueryRow(r.Context(), `
			select status from public.inv_pack_sessions
			where id = $1 and tenant_id = $2 for update`, sessionID, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Pack session not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "open" {
			response.Validation(w, map[string]string{"status": "Only open pack sessions can be completed."})
			return
		}

		var lineCount int
		if err := tx.QueryRow(r.Context(), `
			select count(*) from public.inv_pack_session_lines where pack_session_id = $1`, sessionID).Scan(&lineCount); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count lines.", "ERR_INTERNAL")
			return
		}
		if lineCount == 0 {
			response.Validation(w, map[string]string{"lines": "At least one packed line is required."})
			return
		}

		_, err = tx.Exec(r.Context(), `
			update public.inv_containers c
			set status = 'shipped', updated_at = now()
			from public.inv_pack_session_lines psl
			where psl.pack_session_id = $1 and psl.container_id = c.id and c.status = 'in_stock'`,
			sessionID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update containers.", "ERR_INTERNAL")
			return
		}

		tag, err := tx.Exec(r.Context(), `
			update public.inv_pack_sessions
			set status = 'completed', completed_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'open'`, sessionID, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Pack session already completed.", "ERR_CONFLICT")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to complete pack session.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.pack_session_complete", "inv_pack_session", &sessionID, nil, nil)
		row, _ := loadPackSession(r.Context(), pool, tu.TenantID, sessionID)
		response.OK(w, row, "Pack session completed.")
	}
}

func loadPackSession(ctx context.Context, q pgxpoolConn, tenantID, id int64) (PackSessionRow, error) {
	var row PackSessionRow
	var completed *time.Time
	var createdAt, updatedAt time.Time
	err := q.QueryRow(ctx, `
		select ps.id, ps.pack_no, ps.sales_order_id, coalesce(so.sales_order_no, ''),
		  ps.location_id, coalesce(loc.location_name, ''), ps.status, ps.notes,
		  ps.created_by_user_id, ps.completed_at, ps.created_at, ps.updated_at
		from public.inv_pack_sessions ps
		left join public.so_sales_orders so on so.id = ps.sales_order_id
		left join public.inv_locations loc on loc.id = ps.location_id
		where ps.id = $1 and ps.tenant_id = $2`, id, tenantID).Scan(
		&row.ID, &row.PackNo, &row.SalesOrderID, &row.SalesOrderNo,
		&row.LocationID, &row.LocationName, &row.Status, &row.Notes,
		&row.CreatedByUserID, &completed, &createdAt, &updatedAt)
	if err != nil {
		return PackSessionRow{}, err
	}
	row.CompletedAt = formatTimePtr(completed)
	row.CreatedAt = createdAt.Format(time.RFC3339)
	row.UpdatedAt = updatedAt.Format(time.RFC3339)

	lineRows, err := q.Query(ctx, `
		select psl.id, psl.line_no, psl.item_id, coalesce(i.item_code, ''), coalesce(i.item_name, ''),
		  psl.container_id, coalesce(c.container_no, ''), psl.lot_batch_id, coalesce(lb.lot_no, ''),
		  psl.qty::float8
		from public.inv_pack_session_lines psl
		left join public.inv_items i on i.id = psl.item_id
		left join public.inv_containers c on c.id = psl.container_id
		left join public.inv_lot_batches lb on lb.id = psl.lot_batch_id
		where psl.pack_session_id = $1
		order by psl.line_no`, id)
	if err != nil {
		return PackSessionRow{}, err
	}
	defer lineRows.Close()
	for lineRows.Next() {
		var ln PackSessionLineRow
		if err := lineRows.Scan(
			&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName,
			&ln.ContainerID, &ln.ContainerNo, &ln.LotBatchID, &ln.LotNo, &ln.Qty,
		); err != nil {
			return PackSessionRow{}, err
		}
		row.Lines = append(row.Lines, ln)
	}
	if row.Lines == nil {
		row.Lines = []PackSessionLineRow{}
	}
	return row, nil
}

func processPackScans(ctx context.Context, tx pgx.Tx, tenantID, sessionID int64, scans []packScanInput) ([]packScanResult, error) {
	var status string
	var locationID int64
	if err := tx.QueryRow(ctx, `
		select status, location_id from public.inv_pack_sessions
		where id = $1 and tenant_id = $2 for update`, sessionID, tenantID).Scan(&status, &locationID); err != nil {
		return nil, err
	}
	if status != "open" {
		return nil, errors.New("only open pack sessions accept scans")
	}

	nextLineNo := 0
	_ = tx.QueryRow(ctx, `
		select coalesce(max(line_no), 0) from public.inv_pack_session_lines where pack_session_id = $1`, sessionID).Scan(&nextLineNo)

	seenClient := map[string]bool{}
	results := make([]packScanResult, 0, len(scans))

	for _, sc := range scans {
		res := packScanResult{
			ClientPackID: sc.ClientPackID,
			ContainerNo:  strings.TrimSpace(sc.ContainerNo),
		}

		if sc.ClientPackID != "" {
			if seenClient[sc.ClientPackID] {
				res.Status = PackScanBatchDuplicate
				res.Message = "Duplicate client pack id in batch."
				results = append(results, res)
				continue
			}
			seenClient[sc.ClientPackID] = true

			var lineID int64
			var containerNo string
			var qty float64
			err := tx.QueryRow(ctx, `
				select psl.id, coalesce(c.container_no, ''), psl.qty::float8
				from public.inv_pack_session_lines psl
				left join public.inv_containers c on c.id = psl.container_id
				where psl.pack_session_id = $1 and psl.client_pack_id = $2::uuid`,
				sessionID, sc.ClientPackID).Scan(&lineID, &containerNo, &qty)
			if err == nil {
				res.Status = PackScanIdempotentReplay
				res.LineID = &lineID
				res.ContainerNo = containerNo
				res.Qty = qty
				results = append(results, res)
				continue
			}
		}

		var containerID int64
		var itemID int64
		var lotBatchID *int64
		var netWeight float64
		var containerNo string
		var containerStatus string
		var containerLoc int64

		if sc.ContainerID > 0 {
			err := tx.QueryRow(ctx, `
				select c.id, c.container_no, c.item_id, c.lot_batch_id, c.net_weight_kg::float8, c.status, c.location_id
				from public.inv_containers c
				where c.id = $1 and c.tenant_id = $2`,
				sc.ContainerID, tenantID).Scan(&containerID, &containerNo, &itemID, &lotBatchID, &netWeight, &containerStatus, &containerLoc)
			if err != nil {
				res.Status = PackScanInvalidContainer
				res.Message = "Container not found."
				results = append(results, res)
				continue
			}
		} else if res.ContainerNo != "" {
			err := tx.QueryRow(ctx, `
				select c.id, c.container_no, c.item_id, c.lot_batch_id, c.net_weight_kg::float8, c.status, c.location_id
				from public.inv_containers c
				where c.tenant_id = $1 and lower(btrim(c.container_no)) = lower(btrim($2::text)) and c.status <> 'void'
				order by c.id desc limit 1`, tenantID, res.ContainerNo).Scan(&containerID, &containerNo, &itemID, &lotBatchID, &netWeight, &containerStatus, &containerLoc)
			if err != nil {
				res.Status = PackScanInvalidContainer
				res.Message = "Container not found."
				results = append(results, res)
				continue
			}
		} else {
			res.Status = PackScanEmpty
			res.Message = "Container number or id is required."
			results = append(results, res)
			continue
		}

		res.ContainerNo = containerNo
		if containerStatus != "in_stock" && containerStatus != "opened" {
			res.Status = PackScanInvalidContainer
			res.Message = "Container is not available for packing."
			results = append(results, res)
			continue
		}
		if containerLoc != locationID {
			res.Status = PackScanInvalidContainer
			res.Message = "Container location does not match pack session."
			results = append(results, res)
			continue
		}

		qty := sc.Qty
		if qty <= 0 {
			qty = netWeight
		}
		res.Qty = qty
		if qty <= 0 {
			res.Status = PackScanEmpty
			res.Message = "Quantity must be greater than zero."
			results = append(results, res)
			continue
		}

		nextLineNo++
		var clientPackArg any
		if sc.ClientPackID != "" {
			clientPackArg = sc.ClientPackID
		}

		var lineID int64
		err := tx.QueryRow(ctx, `
			insert into public.inv_pack_session_lines (
			  pack_session_id, line_no, item_id, container_id, lot_batch_id, qty, client_pack_id
			) values ($1,$2,$3,$4,$5,$6,$7::uuid)
			returning id`,
			sessionID, nextLineNo, itemID, containerID, lotBatchID, qty, clientPackArg).Scan(&lineID)
		if err != nil {
			if strings.Contains(strings.ToLower(err.Error()), "unique") {
				res.Status = PackScanDuplicate
				res.Message = "Container already packed in this session."
			} else {
				res.Status = PackScanDuplicate
				res.Message = "Failed to record pack line."
			}
			results = append(results, res)
			continue
		}

		res.Status = PackScanAccepted
		res.LineID = &lineID
		results = append(results, res)
	}

	return results, nil
}
