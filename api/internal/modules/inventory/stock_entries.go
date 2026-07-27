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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type StockEntry struct {
	ID             int64            `json:"id"`
	EntryNo        string           `json:"entry_no"`
	EntryDate      string           `json:"entry_date"`
	EntryType      string           `json:"entry_type"`
	FromLocationID *int64           `json:"from_location_id,omitempty"`
	ToLocationID   *int64           `json:"to_location_id,omitempty"`
	FromLocation   string           `json:"from_location_name,omitempty"`
	ToLocation     string           `json:"to_location_name,omitempty"`
	Status         string           `json:"status"`
	Notes          *string          `json:"notes,omitempty"`
	Lines          []StockEntryLine `json:"lines,omitempty"`
}

type StockEntryLine struct {
	ID       int64   `json:"id,omitempty"`
	LineNo   int     `json:"line_no"`
	ItemID   int64   `json:"item_id"`
	ItemCode string  `json:"item_code"`
	ItemName string  `json:"item_name"`
	Qty      float64 `json:"qty"`
}

type stockEntryBody struct {
	EntryDate      string             `json:"entry_date"`
	EntryType      string             `json:"entry_type"`
	FromLocationID *int64             `json:"from_location_id"`
	ToLocationID   *int64             `json:"to_location_id"`
	Notes          *string            `json:"notes"`
	Lines          []stockEntryLineIn `json:"lines"`
}

type stockEntryLineIn struct {
	ItemID int64   `json:"item_id"`
	Qty    float64 `json:"qty"`
}

func registerStockEntryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).Get("/stock-entries", listStockEntries(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessRead)).Get("/stock-entries/{id}", getStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Post("/stock-entries", createStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Patch("/stock-entries/{id}", updateStockEntry(pool))
	r.With(auth.RequirePermission("inventory.stock_entries", auth.AccessWrite)).Delete("/stock-entries/{id}", deleteStockEntry(pool))
	r.With(auth.RequireSubmit("inventory.stock_entries_post")).Post("/stock-entries/{id}/post", postStockEntry(pool))
}

func listStockEntries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select e.id, e.entry_no, e.entry_date::text, e.entry_type,
			  e.from_location_id, e.to_location_id,
			  coalesce(fl.location_name, ''), coalesce(tl.location_name, ''),
			  e.status, e.notes
			from public.inv_stock_entries e
			left join public.inv_locations fl on fl.id = e.from_location_id
			left join public.inv_locations tl on tl.id = e.to_location_id
			where e.tenant_id = $1
			order by e.entry_date desc, e.id desc
			limit 50`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list stock entries.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []StockEntry
		for rows.Next() {
			var x StockEntry
			if err := rows.Scan(&x.ID, &x.EntryNo, &x.EntryDate, &x.EntryType,
				&x.FromLocationID, &x.ToLocationID, &x.FromLocation, &x.ToLocation,
				&x.Status, &x.Notes); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read entry.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []StockEntry{}
		}
		response.OK(w, out, "OK")
	}
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
	err := pool.QueryRow(ctx, `
		select e.id, e.entry_no, e.entry_date, e.entry_type,
		  e.from_location_id, e.to_location_id,
		  coalesce(fl.location_name, ''), coalesce(tl.location_name, ''),
		  e.status, e.notes
		from public.inv_stock_entries e
		left join public.inv_locations fl on fl.id = e.from_location_id
		left join public.inv_locations tl on tl.id = e.to_location_id
		where e.id = $1 and e.tenant_id = $2`, id, tenantID).Scan(
		&e.ID, &e.EntryNo, &d, &e.EntryType,
		&e.FromLocationID, &e.ToLocationID, &e.FromLocation, &e.ToLocation,
		&e.Status, &e.Notes)
	if err != nil {
		return StockEntry{}, err
	}
	e.EntryDate = d.Format("2006-01-02")

	rows, err := pool.Query(ctx, `
		select l.id, l.line_no, l.item_id, i.item_code, i.item_name, l.qty::float8
		from public.inv_stock_entry_lines l
		join public.inv_items i on i.id = l.item_id
		where l.stock_entry_id = $1 order by l.line_no`, id)
	if err != nil {
		return StockEntry{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln StockEntryLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty); err != nil {
			return StockEntry{}, err
		}
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
			  from_location_id, to_location_id, notes, created_by_user_id
			) values ($1, $2::date, $3, $4, $5, $6, $7, $8) returning id`,
			tu.TenantID, entryDate.Format("2006-01-02"), entryNo, strings.TrimSpace(body.EntryType),
			body.FromLocationID, body.ToLocationID, body.Notes, tu.AppUserID).Scan(&entryID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert entry.", "ERR_INTERNAL")
			return
		}

		if err := replaceStockEntryLines(r.Context(), tx, tu.TenantID, entryID, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
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

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update entry.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries set
			  entry_date = $1, entry_type = $2,
			  from_location_id = $3, to_location_id = $4, notes = $5, updated_at = now()
			where id = $6 and tenant_id = $7 and status = 'draft'`,
			entryDate.Format("2006-01-02"), strings.TrimSpace(body.EntryType),
			body.FromLocationID, body.ToLocationID, body.Notes, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Stock entry not found.", "ERR_NOT_FOUND")
			return
		}

		_, _ = tx.Exec(r.Context(), `delete from public.inv_stock_entry_lines where stock_entry_id = $1`, id)
		if err := replaceStockEntryLines(r.Context(), tx, tu.TenantID, id, body.Lines); err != nil {
			response.Validation(w, map[string]string{"lines": err.Error()})
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
					response.Validation(w, map[string]string{"lines": err.Error()})
					return
				}
			case "issue":
				moveType := "issue"
				if reason == "internal_use" || reason == "product_defect" {
					moveType = reason
				}
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.FromLocationID, -ln.Qty, tu.AppUserID, "stock_entry", id, moveType, reason); err != nil {
					response.Validation(w, map[string]string{"lines": err.Error()})
					return
				}
			case "transfer":
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.FromLocationID, -ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_out", reason); err != nil {
					response.Validation(w, map[string]string{"lines": err.Error()})
					return
				}
				if err := ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, *entry.ToLocationID, ln.Qty, tu.AppUserID, "stock_entry", id, "transfer_in", reason); err != nil {
					response.Validation(w, map[string]string{"lines": err.Error()})
					return
				}
			}
		}

		tag, err := tx.Exec(r.Context(), `
			update public.inv_stock_entries set status = 'posted', posted_at = now(), updated_at = now()
			where id = $1 and tenant_id = $2 and status = 'draft'`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusConflict, "Entry already posted.", "ERR_CONFLICT")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post entry.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.stock_entry_post", "inv_stock_entry", &id, nil, nil)
		entry.Status = "posted"
		response.OK(w, entry, "Stock entry posted.")
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
			insert into public.inv_stock_entry_lines (stock_entry_id, line_no, item_id, qty)
			values ($1, $2, $3, $4)`, entryID, i+1, ln.ItemID, ln.Qty)
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
		return fmt.Errorf("insufficient stock for item %d", itemID)
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
