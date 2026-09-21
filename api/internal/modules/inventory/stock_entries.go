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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/day1commercial"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type StockEntry struct {
	ID                int64            `json:"id"`
	EntryNo           string           `json:"entry_no"`
	EntryDate         string           `json:"entry_date"`
	EntryType         string           `json:"entry_type"`
	FromLocationID    *int64           `json:"from_location_id,omitempty"`
	ToLocationID      *int64           `json:"to_location_id,omitempty"`
	FromLocation      string           `json:"from_location_name,omitempty"`
	ToLocation        string           `json:"to_location_name,omitempty"`
	Status            string           `json:"status"`
	Notes             *string          `json:"notes,omitempty"`
	PicUserID         *int64           `json:"pic_user_id,omitempty"`
	PicName           string           `json:"pic_name,omitempty"`
	ProjectID         *int64           `json:"project_id,omitempty"`
	ProjectName       string           `json:"project_name,omitempty"`
	RequestedByUserID *int64           `json:"requested_by_user_id,omitempty"`
	RequestedByName   string           `json:"requested_by_name,omitempty"`
	RequestedAt       *string          `json:"requested_at,omitempty"`
	ApprovedByUserID  *int64           `json:"approved_by_user_id,omitempty"`
	ApprovedByName    string           `json:"approved_by_name,omitempty"`
	ApprovedAt        *string          `json:"approved_at,omitempty"`
	PostedAt          *string          `json:"posted_at,omitempty"`
	UpdatedAt         string           `json:"updated_at,omitempty"`
	Lines             []StockEntryLine `json:"lines,omitempty"`
}

type StockEntryLine struct {
	ID       int64   `json:"id,omitempty"`
	LineNo   int     `json:"line_no"`
	ItemID   int64   `json:"item_id"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
	Remark   string  `json:"remark,omitempty"`
	// SerialLotCount is tracking attachments only (Wave 4 fills this; until then 0).
	SerialLotCount int `json:"serial_lot_count"`
}

// StockTransferLineRow is one item line on a transfer for the Location Transfer list.
type StockTransferLineRow struct {
	LineID            int64   `json:"line_id"`
	StockEntryID      int64   `json:"stock_entry_id"`
	EntryNo           string  `json:"entry_no"`
	Datetime          string  `json:"datetime"`
	EntryDate         string  `json:"entry_date"`
	ItemID            int64   `json:"item_id"`
	ItemCode          string  `json:"item_code"`
	ItemName          string  `json:"item_name"`
	FromLocationID    *int64  `json:"from_location_id,omitempty"`
	ToLocationID      *int64  `json:"to_location_id,omitempty"`
	FromLocationName  string  `json:"from_location_name"`
	ToLocationName    string  `json:"to_location_name"`
	QtyOut            float64 `json:"qty_out"`
	QtyIn             float64 `json:"qty_in"`
	SerialLotCount    int     `json:"serial_lot_count"`
	TransferredByID   *int64  `json:"transferred_by_user_id,omitempty"`
	TransferredByName string  `json:"transferred_by_name"`
	RequestedByUserID *int64  `json:"requested_by_user_id,omitempty"`
	RequestedByName   string  `json:"requested_by_name"`
	RequestedAt       *string `json:"requested_at,omitempty"`
	ApprovedByUserID  *int64  `json:"approved_by_user_id,omitempty"`
	ApprovedByName    string  `json:"approved_by_name"`
	ApprovedAt        *string `json:"approved_at,omitempty"`
	Reason            string  `json:"reason"`
	Remark            string  `json:"remark"`
	Status            string  `json:"status"`
	Total             int64   `json:"total,omitempty"`
}

type stockEntryBody struct {
	EntryDate      string             `json:"entry_date"`
	EntryType      string             `json:"entry_type"`
	FromLocationID *int64             `json:"from_location_id"`
	ToLocationID   *int64             `json:"to_location_id"`
	Notes          *string            `json:"notes"`
	PicUserID      *int64             `json:"pic_user_id"`
	PicName        *string            `json:"pic_name"`
	ProjectID      *int64             `json:"project_id"`
	ProjectName    *string            `json:"project_name"`
	Lines          []stockEntryLineIn `json:"lines"`
}

type stockEntryLineIn struct {
	ItemID int64   `json:"item_id"`
	Qty    float64 `json:"qty"`
	Remark string  `json:"remark"`
}

func registerStockEntryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).Get("/stock-entries", listStockEntries(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).Get("/stock-entries/transfer-lines", listStockTransferLines(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).Get("/stock-entries/{id}", getStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Post("/stock-entries", createStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Patch("/stock-entries/{id}", updateStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Delete("/stock-entries/{id}", deleteStockEntry(pool))
	r.With(auth.RequireSubmit("inventory.stock_entries_post")).Post("/stock-entries/{id}/post", postStockEntry(pool))
	registerStockEntryAttachmentRoutes(r, pool)
}

func listStockEntries(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"entry_date": "e.entry_date",
		"updated_at": "e.updated_at",
		"posted_at":  "coalesce(e.posted_at, e.updated_at)",
		"entry_no":   "e.entry_no",
		"status":     "e.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParamsWithDefaults(r, "updated_at", "desc", allowed)
		offset := httputil.Offset(p)

		where := "e.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2
		if et := strings.TrimSpace(r.URL.Query().Get("entry_type")); et != "" {
			where += fmt.Sprintf(" and e.entry_type = $%d", argN)
			args = append(args, et)
			argN++
		}
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and e.status = $%d", argN)
			args = append(args, st)
			argN++
		}

		q := fmt.Sprintf(`
			select e.id, e.entry_no, e.entry_date::text, e.entry_type,
			  e.from_location_id, e.to_location_id,
			  coalesce(fl.location_name, ''), coalesce(tl.location_name, ''),
			  e.status, e.notes,
			  e.pic_user_id, coalesce(e.pic_name, ''),
			  e.project_id, coalesce(e.project_name, ''),
			  e.requested_by_user_id, coalesce(ru.full_name, ''),
			  e.requested_at, e.approved_by_user_id, coalesce(au.full_name, ''),
			  e.approved_at, e.posted_at, e.updated_at,
			  count(*) over()
			from public.inv_stock_entries e
			left join public.inv_locations fl on fl.id = e.from_location_id
			left join public.inv_locations tl on tl.id = e.to_location_id
			left join public.users ru on ru.id = e.requested_by_user_id
			left join public.users au on au.id = e.approved_by_user_id
			where %s
			order by %s %s
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list stock entries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []StockEntry
		var total int64
		for rows.Next() {
			var x StockEntry
			var requestedAt, approvedAt, postedAt *time.Time
			var updatedAt time.Time
			if err := rows.Scan(
				&x.ID, &x.EntryNo, &x.EntryDate, &x.EntryType,
				&x.FromLocationID, &x.ToLocationID, &x.FromLocation, &x.ToLocation,
				&x.Status, &x.Notes,
				&x.PicUserID, &x.PicName,
				&x.ProjectID, &x.ProjectName,
				&x.RequestedByUserID, &x.RequestedByName,
				&requestedAt, &x.ApprovedByUserID, &x.ApprovedByName,
				&approvedAt, &postedAt, &updatedAt, &total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read entry.", "ERR_INTERNAL")
				return
			}
			x.RequestedAt = formatTSPtr(requestedAt)
			x.ApprovedAt = formatTSPtr(approvedAt)
			x.PostedAt = formatTSPtr(postedAt)
			x.UpdatedAt = updatedAt.Format(time.RFC3339)
			out = append(out, x)
		}
		if out == nil {
			out = []StockEntry{}
		}
		response.OK(w, map[string]any{"rows": out, "total": total}, "OK")
	}
}

func listStockTransferLines(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"datetime":   "coalesce(e.posted_at, e.updated_at, e.created_at)",
		"updated_at": "e.updated_at",
		"posted_at":  "coalesce(e.posted_at, e.updated_at)",
		"entry_no":   "e.entry_no",
		"entry_date": "e.entry_date",
		"status":     "e.status",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParamsWithDefaults(r, "datetime", "desc", allowed)
		offset := httputil.Offset(p)

		where := "e.tenant_id = $1 and e.entry_type = 'transfer'"
		args := []any{tu.TenantID}
		argN := 2
		if st := strings.TrimSpace(r.URL.Query().Get("status")); st != "" {
			where += fmt.Sprintf(" and e.status = $%d", argN)
			args = append(args, st)
			argN++
		}
		if p.Q != "" {
			where += fmt.Sprintf(` and (
			  e.entry_no ilike $%d or coalesce(e.notes,'') ilike $%d
			  or i.item_code ilike $%d or i.item_name ilike $%d
			  or coalesce(fl.location_name,'') ilike $%d or coalesce(tl.location_name,'') ilike $%d
			)`, argN, argN, argN, argN, argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		q := fmt.Sprintf(`
			select ln.id, e.id, e.entry_no,
			  coalesce(e.posted_at, e.updated_at, e.created_at),
			  e.entry_date::text,
			  ln.item_id, i.item_code, i.item_name,
			  e.from_location_id, e.to_location_id,
			  coalesce(fl.location_name, ''), coalesce(tl.location_name, ''),
			  ln.qty::float8,
			  coalesce(ln.remark, ''),
			  coalesce(e.notes, ''),
			  e.status,
			  e.requested_by_user_id, coalesce(ru.full_name, ''),
			  e.requested_at,
			  e.approved_by_user_id, coalesce(au.full_name, ''),
			  e.approved_at,
			  count(*) over()
			from public.inv_stock_entry_lines ln
			join public.inv_stock_entries e on e.id = ln.stock_entry_id
			join public.inv_items i on i.id = ln.item_id
			left join public.inv_locations fl on fl.id = e.from_location_id
			left join public.inv_locations tl on tl.id = e.to_location_id
			left join public.users ru on ru.id = e.requested_by_user_id
			left join public.users au on au.id = e.approved_by_user_id
			where %s
			order by %s %s, ln.line_no asc
			limit $%d offset $%d`,
			where, p.Sort, orderSQL(p.Order), argN, argN+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list transfer lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []StockTransferLineRow
		var total int64
		for rows.Next() {
			var row StockTransferLineRow
			var dt time.Time
			var requestedAt, approvedAt *time.Time
			if err := rows.Scan(
				&row.LineID, &row.StockEntryID, &row.EntryNo, &dt, &row.EntryDate,
				&row.ItemID, &row.ItemCode, &row.ItemName,
				&row.FromLocationID, &row.ToLocationID,
				&row.FromLocationName, &row.ToLocationName,
				&row.QtyOut, &row.Remark, &row.Reason, &row.Status,
				&row.RequestedByUserID, &row.RequestedByName, &requestedAt,
				&row.ApprovedByUserID, &row.ApprovedByName, &approvedAt,
				&total,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read transfer lines.", "ERR_INTERNAL")
				return
			}
			row.QtyIn = row.QtyOut
			row.SerialLotCount = 0
			row.Datetime = dt.Format(time.RFC3339)
			row.RequestedAt = formatTSPtr(requestedAt)
			row.ApprovedAt = formatTSPtr(approvedAt)
			if row.Status == "posted" {
				row.TransferredByID = row.ApprovedByUserID
				row.TransferredByName = row.ApprovedByName
			} else {
				row.TransferredByID = row.RequestedByUserID
				row.TransferredByName = row.RequestedByName
			}
			row.Total = total
			out = append(out, row)
		}
		if out == nil {
			out = []StockTransferLineRow{}
		}
		response.OK(w, map[string]any{"rows": out, "total": total}, "OK")
	}
}

func formatTSPtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

func getStockEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, entry, "OK")
	}
}

func loadStockEntry(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (StockEntry, error) {
	var e StockEntry
	var d time.Time
	var requestedAt, approvedAt, postedAt *time.Time
	var updatedAt time.Time
	err := pool.QueryRow(ctx, `
		select e.id, e.entry_no, e.entry_date, e.entry_type,
		  e.from_location_id, e.to_location_id,
		  coalesce(fl.location_name, ''), coalesce(tl.location_name, ''),
		  e.status, e.notes,
		  e.pic_user_id, coalesce(e.pic_name, ''),
		  e.project_id, coalesce(e.project_name, ''),
		  e.requested_by_user_id, coalesce(ru.full_name, ''),
		  e.requested_at, e.approved_by_user_id, coalesce(au.full_name, ''),
		  e.approved_at, e.posted_at, e.updated_at
		from public.inv_stock_entries e
		left join public.inv_locations fl on fl.id = e.from_location_id
		left join public.inv_locations tl on tl.id = e.to_location_id
		left join public.users ru on ru.id = e.requested_by_user_id
		left join public.users au on au.id = e.approved_by_user_id
		where e.id = $1 and e.tenant_id = $2`, id, tenantID).Scan(
		&e.ID, &e.EntryNo, &d, &e.EntryType,
		&e.FromLocationID, &e.ToLocationID, &e.FromLocation, &e.ToLocation,
		&e.Status, &e.Notes,
		&e.PicUserID, &e.PicName,
		&e.ProjectID, &e.ProjectName,
		&e.RequestedByUserID, &e.RequestedByName,
		&requestedAt, &e.ApprovedByUserID, &e.ApprovedByName,
		&approvedAt, &postedAt, &updatedAt)
	if err != nil {
		return StockEntry{}, err
	}
	e.EntryDate = d.Format("2006-01-02")
	e.RequestedAt = formatTSPtr(requestedAt)
	e.ApprovedAt = formatTSPtr(approvedAt)
	e.PostedAt = formatTSPtr(postedAt)
	e.UpdatedAt = updatedAt.Format(time.RFC3339)

	rows, err := pool.Query(ctx, `
		select l.id, l.line_no, l.item_id, i.item_code, i.item_name, l.qty::float8, coalesce(l.remark, '')
		from public.inv_stock_entry_lines l
		join public.inv_items i on i.id = l.item_id
		where l.stock_entry_id = $1 order by l.line_no`, id)
	if err != nil {
		return StockEntry{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln StockEntryLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.Remark); err != nil {
			return StockEntry{}, err
		}
		ln.SerialLotCount = 0
		e.Lines = append(e.Lines, ln)
	}
	if e.Lines == nil {
		e.Lines = []StockEntryLine{}
	}
	return e, nil
}

func validateStockEntryBody(body stockEntryBody) map[string]string {
	errs := map[string]string{}
	entryType := strings.TrimSpace(body.EntryType)
	switch entryType {
	case "transfer":
		if body.FromLocationID == nil || *body.FromLocationID <= 0 {
			errs["from_location_id"] = "Source location is required for transfer."
		}
		if body.ToLocationID == nil || *body.ToLocationID <= 0 {
			errs["to_location_id"] = "Destination location is required for transfer."
		}
		if body.FromLocationID != nil && body.ToLocationID != nil &&
			*body.FromLocationID > 0 && *body.ToLocationID > 0 &&
			*body.FromLocationID == *body.ToLocationID {
			errs["to_location_id"] = "Destination must be different from the source location."
		}
		notes := ""
		if body.Notes != nil {
			notes = strings.TrimSpace(*body.Notes)
		}
		if notes == "" {
			errs["notes"] = "Reason is required for a location transfer."
		}
	case "issue":
		if body.FromLocationID == nil || *body.FromLocationID <= 0 {
			errs["from_location_id"] = "Source location is required for issue."
		}
	case "receipt":
		if body.ToLocationID == nil || *body.ToLocationID <= 0 {
			errs["to_location_id"] = "Destination location is required for receipt."
		}
	default:
		errs["entry_type"] = "Use transfer, issue, or receipt."
	}
	if len(body.Lines) == 0 {
		errs["lines"] = "At least one line is required."
	}
	for i, ln := range body.Lines {
		if ln.ItemID <= 0 {
			errs[fmt.Sprintf("lines[%d].item_id", i)] = "Item is required."
		}
		if ln.Qty <= 0 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = "Quantity must be positive."
		}
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func createStockEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body stockEntryBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateStockEntryBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		entryDate := time.Now()
		if strings.TrimSpace(body.EntryDate) != "" {
			d, err := parseDate(body.EntryDate)
			if err != nil {
				response.Validation(w, map[string]string{"entry_date": "Invalid date."})
				return
			}
			entryDate = d
		}

		picName := ""
		if body.PicName != nil {
			picName = strings.TrimSpace(*body.PicName)
		}
		projectName := ""
		if body.ProjectName != nil {
			projectName = strings.TrimSpace(*body.ProjectName)
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		entryNo := fmt.Sprintf("SE-%s-%d", entryDate.Format("20060102"), time.Now().Unix()%10000)
		var entryID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.inv_stock_entries (
			  tenant_id, entry_date, entry_no, entry_type,
			  from_location_id, to_location_id, notes, created_by_user_id,
			  pic_user_id, pic_name, project_id, project_name,
			  requested_by_user_id, requested_at
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
			returning id`,
			tu.TenantID, entryDate.Format("2006-01-02"), entryNo, strings.TrimSpace(body.EntryType),
			body.FromLocationID, body.ToLocationID, body.Notes, tu.AppUserID,
			body.PicUserID, nullIfEmpty(picName), body.ProjectID, nullIfEmpty(projectName),
			tu.AppUserID).Scan(&entryID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert entry.", "ERR_INTERNAL")
			return
		}

		if err := replaceStockEntryLines(r.Context(), tx, tu.TenantID, entryID, body.Lines); err != nil {
			response.ValidationSmart(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save entry.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry_create", "inv_stock_entry", &entryID, nil, body)
		entry, _ := loadStockEntry(r.Context(), pool, tu.TenantID, entryID)
		response.OK(w, entry, "Stock entry created.")
	}
}

func nullIfEmpty(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

func updateStockEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		var body stockEntryBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateStockEntryBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		var status string
		err := pool.QueryRow(r.Context(), `
			select status from public.inv_stock_entries where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}
		if status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft entries can be edited."})
			return
		}

		entryDate := time.Now()
		if strings.TrimSpace(body.EntryDate) != "" {
			d, err := parseDate(body.EntryDate)
			if err != nil {
				response.Validation(w, map[string]string{"entry_date": "Invalid date."})
				return
			}
			entryDate = d
		}

		picName := ""
		if body.PicName != nil {
			picName = strings.TrimSpace(*body.PicName)
		}
		projectName := ""
		if body.ProjectName != nil {
			projectName = strings.TrimSpace(*body.ProjectName)
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries set
			  entry_date = $1, entry_type = $2,
			  from_location_id = $3, to_location_id = $4, notes = $5,
			  pic_user_id = $6, pic_name = $7, project_id = $8, project_name = $9,
			  updated_at = now()
			where id = $10 and tenant_id = $11 and status = 'draft'`,
			entryDate.Format("2006-01-02"), strings.TrimSpace(body.EntryType),
			body.FromLocationID, body.ToLocationID, body.Notes,
			body.PicUserID, nullIfEmpty(picName), body.ProjectID, nullIfEmpty(projectName),
			id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}

		_, _ = tx.Exec(r.Context(), `delete from public.inv_stock_entry_lines where stock_entry_id = $1`, id)
		if err := replaceStockEntryLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.ValidationSmart(w, map[string]string{"lines": err.Error()})
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save entry.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry_update", "inv_stock_entry", &id, nil, body)
		entry, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, entry, "Stock entry updated.")
	}
}

func deleteStockEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		tag, err := pool.Exec(r.Context(), `
			delete from public.inv_stock_entries where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Draft stock entry not found.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry_delete", "inv_stock_entry", &id, nil, nil)
		response.OK(w, nil, "Deleted.")
	}
}

func postStockEntry(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		entry, err := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}
		if entry.Status != "draft" {
			response.Validation(w, map[string]string{"status": "Only draft entries can be posted."})
			return
		}
		if entry.EntryType == "transfer" {
			notes := ""
			if entry.Notes != nil {
				notes = strings.TrimSpace(*entry.Notes)
			}
			if notes == "" {
				response.Validation(w, map[string]string{"notes": "Reason is required for a location transfer."})
				return
			}
			if entry.FromLocationID == nil || entry.ToLocationID == nil ||
				*entry.FromLocationID == *entry.ToLocationID {
				response.Validation(w, map[string]string{"to_location_id": "Destination must be different from the source location."})
				return
			}
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		for _, ln := range entry.Lines {
			reason := ""
			if entry.Notes != nil {
				reason = strings.TrimSpace(*entry.Notes)
			}
			switch entry.EntryType {
			case "receipt":
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.ToLocationID, ln.Qty, tu.AppUserID, "stock_entry", id, "receipt", reason); err != nil {
					response.ValidationSmart(w, map[string]string{"lines": err.Error()})
					return
				}
			case "issue":
				moveType := "issue"
				if reason == "internal_use" || reason == "product_defect" {
					moveType = reason
				}
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.FromLocationID, -ln.Qty, tu.AppUserID, "stock_entry", id, moveType, reason); err != nil {
					response.ValidationSmart(w, map[string]string{"lines": err.Error()})
					return
				}
			case "transfer":
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.FromLocationID, -ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_out", reason); err != nil {
					response.ValidationSmart(w, map[string]string{"lines": err.Error()})
					return
				}
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.ToLocationID, ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_in", reason); err != nil {
					response.ValidationSmart(w, map[string]string{"lines": err.Error()})
					return
				}
			}
		}

		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries set
			  status = 'posted', posted_at = now(),
			  approved_by_user_id = $3, approved_at = now(),
			  updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID, tu.AppUserID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Entry already posted.", "ERR_CONFLICT")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post entry.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry_post", "inv_stock_entry", &id, nil, nil)
		_, _, _ = day1commercial.EvaluateAndTransition(r.Context(), pool, tu.TenantID)
		posted, _ := loadStockEntry(r.Context(), pool, tu.TenantID, id)
		response.OK(w, posted, "Stock entry posted.")
	}
}

func replaceStockEntryLines(ctx context.Context, tx pgx.Tx, tenantID, entryID int64, lines []stockEntryLineIn) error {
	for i, ln := range lines {
		var exists bool
		_ = tx.QueryRow(ctx, `
			select exists(select 1 from public.inv_items where id = $1 and tenant_id = $2 and deleted_at is null)`,
			ln.ItemID, tenantID).Scan(&exists)
		if !exists {
			return fmt.Errorf("item %d not found", ln.ItemID)
		}
		_, err := tx.Exec(ctx, `
			insert into public.inv_stock_entry_lines (stock_entry_id, line_no, item_id, qty, remark)
			values ($1, $2, $3, $4, $5)`, entryID, i+1, ln.ItemID, ln.Qty, nullIfEmpty(strings.TrimSpace(ln.Remark)))
		if err != nil {
			return err
		}
	}
	return nil
}

// ApplyStockDelta updates location balances and records a stock movement (used by stock entries and manufacturing backflush).
// Optional reason is stored on inv_stock_movements.reason when provided.
func ApplyStockDelta(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, delta float64, userID int64, refType string, refID int64, movementType string, reason ...string) error {
	var qtyOnHand float64
	err := tx.QueryRow(ctx, `
		select qty_on_hand::float8 from public.inv_item_location_balances
		where tenant_id = $1 and item_id = $2 and location_id = $3 for update`,
		tenantID, itemID, locationID).Scan(&qtyOnHand)
	if err != nil {
		if delta < 0 {
			return fmt.Errorf("no balance at location for item %d", itemID)
		}
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand)
			values ($1, $2, $3, 0)`, tenantID, itemID, locationID)
		if err != nil {
			return err
		}
		qtyOnHand = 0
	}
	if qtyOnHand+delta < -0.0001 {
		return fmt.Errorf("not enough stock for this item (need more on hand)")
	}
	_, err = tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand + $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		delta, tenantID, itemID, locationID)
	if err != nil {
		return err
	}
	rsn := ""
	if len(reason) > 0 {
		rsn = strings.TrimSpace(reason[0])
	}
	var rsnArg any
	if rsn != "" {
		rsnArg = rsn
	}
	_, err = tx.Exec(ctx, `
		insert into public.inv_stock_movements
		  (tenant_id, item_id, location_id, qty_delta, movement_type, ref_type, ref_id, reason, created_by_user_id)
		values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		tenantID, itemID, locationID, delta, movementType, refType, refID, rsnArg, userID)
	return err
}
