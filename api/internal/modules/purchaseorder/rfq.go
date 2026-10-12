package purchaseorder

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth/datascope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/branchiso"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const rfqFormEntity = "rfq_request"

type RFQ struct {
	ID                int64          `json:"id"`
	RfqNo             string         `json:"rfq_no"`
	RfqDate           string         `json:"rfq_date"`
	Status            string         `json:"status"`
	LocationID        *int64         `json:"location_id,omitempty"`
	LocationName      string         `json:"location_name,omitempty"`
	PurchaseRequestID *int64         `json:"purchase_request_id,omitempty"`
	Notes             *string        `json:"notes,omitempty"`
	LineCount         int            `json:"line_count,omitempty"`
	Lines             []RFQLine      `json:"lines,omitempty"`
	CustomValues      map[string]any `json:"custom_values,omitempty"`
}

type RFQLine struct {
	ID                    int64   `json:"id,omitempty"`
	LineNo                int     `json:"line_no"`
	PurchaseRequestLineID *int64  `json:"purchase_request_line_id,omitempty"`
	ItemID                *int64  `json:"item_id,omitempty"`
	ItemCode              string  `json:"item_code"`
	ItemName              string  `json:"item_name"`
	Qty                   float64 `json:"qty"`
	UnitID                *int64  `json:"unit_id,omitempty"`
	UnitCode              string  `json:"unit_code,omitempty"`
	Notes                 *string `json:"notes,omitempty"`
}

func registerRFQRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq", listRFQs(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}", getRFQ(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations", auth.AccessRead)).Get("/rfq/{id}/comparison", getRFQComparison(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}/print", getRFQPrint(pool))
	r.With(auth.RequirePermission("purchase_order.rfq", auth.AccessRead)).Get("/rfq/{id}/pdf", getRFQPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/rfq/{id}/send-email", postRFQSendEmail(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Post("/rfq", createRFQ(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Post("/rfq/from-purchase-request/{prId}", createRFQFromPurchaseRequest(pool))
	r.With(auth.RequirePermission("purchase_order.rfq_create", auth.AccessWrite)).Patch("/rfq/{id}/status", patchRFQStatus(pool))
}

func listRFQs(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParamsWithDefaults(r, "rfq_date", "desc", map[string]string{
			"rfq_date": "r.rfq_date",
			"rfq_no":   "r.rfq_no",
			"status":   "r.status",
			"id":       "r.id",
		})
		args := []any{tu.TenantID}
		argN := 2
		dsScope, argN, err := datascope.ApplyUserScopesSQL(r.Context(), pool, tu, datascope.ListFilter{
			LocationColumn: "r.location_id",
		}, argN, &args)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to apply location scope.", "ERR_INTERNAL")
			return
		}
		where := fmt.Sprintf("where r.tenant_id = $1%s", dsScope)
		if clause, statusArg, apply := rfqListStatusFilter(r.URL.Query().Get("view"), p.Status); apply {
			if statusArg != "" {
				where += fmt.Sprintf(clause, argN)
				args = append(args, statusArg)
				argN++
			} else {
				where += clause
			}
		}
		if p.Q != "" {
			where += fmt.Sprintf(" and (r.rfq_no ilike $%d or coalesce(r.notes, '') ilike $%d)", argN, argN)
			args = append(args, "%"+p.Q+"%")
			argN++
		}

		var total int64
		countQ := "select count(*) from public.rfq_requests r " + where
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list RFQs.", "ERR_INTERNAL")
			return
		}

		q := fmt.Sprintf(`
			select r.id, r.rfq_no, r.rfq_date::text, r.status, r.location_id, coalesce(l.location_name, ''),
			  r.purchase_request_id, r.notes,
			  (select count(*)::int from public.rfq_request_lines ln where ln.rfq_id = r.id)
			from public.rfq_requests r
			left join public.inv_locations l on l.id = r.location_id and l.tenant_id = r.tenant_id
			%s
			order by %s %s, r.id desc
			limit $%d offset $%d`, where, p.Sort, p.Order, argN, argN+1)
		args = append(args, p.PageSize, httputil.Offset(p))
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list RFQs.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []RFQ
		for rows.Next() {
			var x RFQ
			if err := rows.Scan(&x.ID, &x.RfqNo, &x.RfqDate, &x.Status, &x.LocationID, &x.LocationName,
				&x.PurchaseRequestID, &x.Notes, &x.LineCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read RFQ.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []RFQ{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

// rfqListStatusFilter limits the RFQ list. Outstanding is sent. History is closed and cancelled.
// A status argument is returned only when the clause contains a placeholder.
func rfqListStatusFilter(view, status string) (clause, arg string, apply bool) {
	switch strings.TrimSpace(view) {
	case "outstanding":
		return " and r.status = 'sent'", "", true
	case "history":
		return " and r.status in ('closed', 'cancelled')", "", true
	}
	switch strings.TrimSpace(status) {
	case "draft", "sent", "closed", "cancelled":
		return " and r.status = $%d", status, true
	default:
		return "", "", false
	}
}

func getRFQ(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, _ := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		hdr, err := loadRFQ(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, hdr, "OK")
	}
}

type rfqComparisonQuote struct {
	Supplier   string  `json:"supplier"`
	QuoteNo    string  `json:"quote_no"`
	UnitPrice  float64 `json:"unit_price"`
	LineTotal  float64 `json:"line_total"`
	ValidUntil *string `json:"valid_until,omitempty"`
}

type rfqComparisonGroup struct {
	RFQRequestLineID *int64               `json:"rfq_request_line_id,omitempty"`
	ItemCode         string               `json:"item_code"`
	ItemName         string               `json:"item_name"`
	Quotes           []rfqComparisonQuote `json:"quotes"`
}

type rfqCompareLine struct {
	RFQRequestLineID *int64
	QuotationLineID  int64
	ItemCode         string
	ItemName         string
	Supplier         string
	QuoteNo          string
	UnitPrice        float64
	LineTotal        float64
	ValidUntil       *string
}

func groupRfqComparison(lines []rfqCompareLine) []rfqComparisonGroup {
	out := make([]rfqComparisonGroup, 0)
	index := map[int64]int{}
	for _, ln := range lines {
		quote := rfqComparisonQuote{
			Supplier:   ln.Supplier,
			QuoteNo:    ln.QuoteNo,
			UnitPrice:  ln.UnitPrice,
			LineTotal:  ln.LineTotal,
			ValidUntil: ln.ValidUntil,
		}
		if ln.RFQRequestLineID == nil || *ln.RFQRequestLineID <= 0 {
			name := strings.TrimSpace(ln.ItemName)
			if name == "" {
				name = "Unlinked quote"
			}
			out = append(out, rfqComparisonGroup{
				ItemCode: ln.ItemCode,
				ItemName: name,
				Quotes:   []rfqComparisonQuote{quote},
			})
			continue
		}
		id := *ln.RFQRequestLineID
		if i, ok := index[id]; ok {
			out[i].Quotes = append(out[i].Quotes, quote)
			continue
		}
		idCopy := id
		index[id] = len(out)
		out = append(out, rfqComparisonGroup{
			RFQRequestLineID: &idCopy,
			ItemCode:         ln.ItemCode,
			ItemName:         ln.ItemName,
			Quotes:           []rfqComparisonQuote{quote},
		})
	}
	return out
}

func getRFQComparison(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var exists int64
		if err := pool.QueryRow(r.Context(), `
			select id from public.rfq_requests where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&exists); err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select ln.rfq_request_line_id, ln.id,
			  coalesce(rl.item_code, it.item_code, ''),
			  coalesce(rl.item_name, it.item_name, ''),
			  coalesce(p.company_name, ''),
			  q.quote_no,
			  ln.unit_price::float8, ln.line_total::float8,
			  q.valid_until::text
			from public.rfq_supplier_quotation_lines ln
			join public.rfq_supplier_quotations q on q.id = ln.supplier_quotation_id
			left join public.rfq_request_lines rl on rl.id = ln.rfq_request_line_id
			left join public.inv_items it on it.id = ln.item_id
			left join public.inv_partners p on p.id = q.partner_id
			where q.tenant_id = $1 and q.rfq_id = $2
			order by rl.line_no nulls last, ln.id`, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to compare quotations.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var lines []rfqCompareLine
		for rows.Next() {
			var ln rfqCompareLine
			if err := rows.Scan(&ln.RFQRequestLineID, &ln.QuotationLineID, &ln.ItemCode, &ln.ItemName,
				&ln.Supplier, &ln.QuoteNo, &ln.UnitPrice, &ln.LineTotal, &ln.ValidUntil); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read quotations.", "ERR_INTERNAL")
				return
			}
			lines = append(lines, ln)
		}
		response.OK(w, map[string]any{"groups": groupRfqComparison(lines)}, "OK")
	}
}

func loadRFQ(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (RFQ, error) {
	var hdr RFQ
	var d time.Time
	err := pool.QueryRow(ctx, `
		select r.id, r.rfq_no, r.rfq_date, r.status, r.location_id, coalesce(l.location_name, ''),
		  r.purchase_request_id, r.notes
		from public.rfq_requests r
		left join public.inv_locations l on l.id = r.location_id and l.tenant_id = r.tenant_id
		where r.id = $1 and r.tenant_id = $2`, id, tenantID).Scan(
		&hdr.ID, &hdr.RfqNo, &d, &hdr.Status, &hdr.LocationID, &hdr.LocationName,
		&hdr.PurchaseRequestID, &hdr.Notes)
	if err != nil {
		return RFQ{}, err
	}
	hdr.RfqDate = d.Format("2006-01-02")

	rows, err := pool.Query(ctx, `
		select id, line_no, purchase_request_line_id, item_id, item_code, item_name, qty::float8, unit_id, coalesce(unit_code, ''), notes
		from public.rfq_request_lines where rfq_id = $1 order by line_no`, id)
	if err != nil {
		return RFQ{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var ln RFQLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.PurchaseRequestLineID, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.UnitID, &ln.UnitCode, &ln.Notes); err != nil {
			return RFQ{}, err
		}
		hdr.Lines = append(hdr.Lines, ln)
	}
	if hdr.Lines == nil {
		hdr.Lines = []RFQLine{}
	}
	hdr.LineCount = len(hdr.Lines)
	if vals, err := customfields.LoadValues(ctx, pool, tenantID, rfqFormEntity, id); err == nil && len(vals) > 0 {
		hdr.CustomValues = vals
	}
	return hdr, nil
}

func createRFQ(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body struct {
			PurchaseRequestID *int64         `json:"purchase_request_id"`
			LocationID        *int64         `json:"location_id"`
			Notes             *string        `json:"notes"`
			CustomValues      map[string]any `json:"custom_values"`
			Lines             []struct {
				ItemID   *int64  `json:"item_id"`
				ItemCode string  `json:"item_code"`
				ItemName string  `json:"item_name"`
				Qty      float64 `json:"qty"`
				UnitID   *int64  `json:"unit_id"`
				UnitCode string  `json:"unit_code"`
				Notes    *string `json:"notes"`
			} `json:"lines"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Lines) == 0 {
			response.Validation(w, map[string]string{"lines": "At least one line is required."})
			return
		}

		locID, locErr := resolveRFQLocationID(r.Context(), pool, tu, body.LocationID, body.PurchaseRequestID)
		if locErr != nil {
			if locErr == branchiso.ErrForbiddenLocation || locErr == branchiso.ErrIsolationClosed {
				response.Err(w, http.StatusForbidden, "Branch not allowed for this user.", "ERR_FORBIDDEN")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to resolve branch.", "ERR_INTERNAL")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create RFQ.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		rfqDate := time.Now()
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1 from public.rfq_requests
			where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, rfqDate.Format("2006-01-02")).Scan(&seq)
		rfqNo := fmt.Sprintf("RFQ-%s-%03d", rfqDate.Format("20060102"), seq)

		var rfqID int64
		err = tx.QueryRow(r.Context(), `
			insert into public.rfq_requests (tenant_id, rfq_date, date_seq, rfq_no, purchase_request_id, location_id, notes, created_by_user_id)
			values ($1, $2::date, $3, $4, $5, $6, $7, $8) returning id`,
			tu.TenantID, rfqDate.Format("2006-01-02"), seq, rfqNo, body.PurchaseRequestID, locID, body.Notes, tu.AppUserID).Scan(&rfqID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to insert RFQ.", "ERR_INTERNAL")
			return
		}

		for i, ln := range body.Lines {
			if ln.Qty <= 0 {
				response.Validation(w, map[string]string{fmt.Sprintf("lines[%d].qty", i): "Quantity must be positive."})
				return
			}
			itemCode := strings.TrimSpace(ln.ItemCode)
			itemName := strings.TrimSpace(ln.ItemName)
			if ln.ItemID != nil && *ln.ItemID > 0 {
				_ = tx.QueryRow(r.Context(), `
					select item_code, item_name from public.inv_items
					where id = $1 and tenant_id = $2 and deleted_at is null`,
					*ln.ItemID, tu.TenantID).Scan(&itemCode, &itemName)
			} else if itemName == "" && itemCode == "" {
				response.Validation(w, map[string]string{
					fmt.Sprintf("lines[%d].item_name", i): "Enter a product name or code (inventory registration is optional on RFQ).",
				})
				return
			}
			unitID, unitCode := inventory.ResolveLineUnit(r.Context(), tx, tu.TenantID, ln.ItemID, ln.UnitID, ln.UnitCode)
			_, err = tx.Exec(r.Context(), `
				insert into public.rfq_request_lines (rfq_id, line_no, item_id, item_code, item_name, qty, unit_id, unit_code, notes)
				values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
				rfqID, i+1, ln.ItemID, itemCode, itemName, ln.Qty, unitID, unitCode, ln.Notes)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to insert line.", "ERR_INTERNAL")
				return
			}
		}

		if cerrs := customfields.ValidateAndSave(r.Context(), tx, tu.TenantID, rfqFormEntity, rfqID, body.CustomValues); len(cerrs) > 0 {
			response.Validation(w, cerrs)
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save RFQ.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_create", "rfq_request", &rfqID, nil, body)
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, rfqID)
		response.OK(w, hdr, "RFQ created.")
	}
}

func createRFQFromPurchaseRequest(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		prID, err := strconv.ParseInt(chi.URLParam(r, "prId"), 10, 64)
		if err != nil || prID <= 0 {
			response.Validation(w, map[string]string{"prId": "Invalid purchase request id."})
			return
		}

		var body struct {
			Notes *string `json:"notes"`
		}
		if r.ContentLength > 0 {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				response.Validation(w, map[string]string{"body": "Invalid JSON."})
				return
			}
		}

		rfqID, created, err := CreateRFQFromPurchaseRequest(r.Context(), pool, tu, prID, body.Notes)
		if err != nil {
			var fields *rfqFieldError
			if errors.As(err, &fields) {
				response.Validation(w, fields.fields)
				return
			}
			if errors.Is(err, ErrPurchaseRequestNotFound) {
				response.Err(w, http.StatusNotFound, "Purchase request not found.", "ERR_NOT_FOUND")
				return
			}
			if errors.Is(err, errNoOpenRFQLines) {
				response.Validation(w, map[string]string{"lines": "No open lines available on this purchase request."})
				return
			}
			if errors.Is(err, branchiso.ErrForbiddenLocation) || errors.Is(err, branchiso.ErrIsolationClosed) {
				response.Err(w, http.StatusForbidden, "Branch not allowed for this user.", "ERR_FORBIDDEN")
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to create RFQ.", "ERR_INTERNAL")
			return
		}
		if !created {
			writeExistingRFQ(w, r, pool, tu.TenantID, rfqID)
			return
		}
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, rfqID)
		response.OK(w, hdr, "RFQ created from purchase request.")
	}
}

var errNoOpenRFQLines = errors.New("no open lines available on this purchase request")

type rfqFieldError struct {
	fields map[string]string
}

func (e *rfqFieldError) Error() string {
	for k, v := range e.fields {
		return k + ": " + v
	}
	return "validation"
}

// CreateRFQFromPurchaseRequest creates one RFQ from a purchase request, or returns the existing non-cancelled RFQ.
func CreateRFQFromPurchaseRequest(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, prID int64, notes *string) (int64, bool, error) {
	var prLocationID *int64
	err := pool.QueryRow(ctx, `
		select location_id from public.pr_purchase_requests
		where id = $1 and tenant_id = $2 and deleted_at is null`, prID, tu.TenantID).Scan(&prLocationID)
	if err != nil {
		return 0, false, ErrPurchaseRequestNotFound
	}

	if existingID, found, findErr := findOpenRFQForPurchaseRequest(ctx, pool, tu.TenantID, prID); findErr != nil {
		return 0, false, findErr
	} else if found {
		return existingID, false, nil
	}

	locID, locErr := resolveRFQLocationID(ctx, pool, tu, prLocationID, &prID)
	if locErr != nil {
		return 0, false, locErr
	}

	rows, err := pool.Query(ctx, `
		select ln.id, ln.item_id, ln.item_code, ln.item_name,
		  greatest(ln.qty - coalesce(sl.slipped, 0), 0)::float8 as open_qty,
		  ln.unit_id, coalesce(ln.unit_code, ''), ln.remark
		from public.pr_purchase_request_lines ln
		left join (
		  select purchase_request_line_id, sum(qty) as slipped
		  from public.pr_purchase_request_slip_lines
		  group by purchase_request_line_id
		) sl on sl.purchase_request_line_id = ln.id
		where ln.purchase_request_id = $1
		order by ln.line_no`, prID)
	if err != nil {
		return 0, false, err
	}
	defer rows.Close()

	lines := make([]RFQLine, 0, 8)
	for rows.Next() {
		var ln RFQLine
		var prLineID int64
		if err := rows.Scan(&prLineID, &ln.ItemID, &ln.ItemCode, &ln.ItemName, &ln.Qty, &ln.UnitID, &ln.UnitCode, &ln.Notes); err != nil {
			return 0, false, err
		}
		lineID := prLineID
		ln.PurchaseRequestLineID = &lineID
		ln.ItemCode = strings.TrimSpace(ln.ItemCode)
		ln.ItemName = strings.TrimSpace(ln.ItemName)
		if ln.Qty <= 0 || (ln.ItemID == nil && ln.ItemName == "") {
			continue
		}
		lines = append(lines, ln)
	}
	if len(lines) == 0 {
		return 0, false, errNoOpenRFQLines
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, false, err
	}
	defer tx.Rollback(ctx)

	var lockedPR int64
	if err := tx.QueryRow(ctx, `
		select id from public.pr_purchase_requests
		where id = $1 and tenant_id = $2 and deleted_at is null
		for update`, prID, tu.TenantID).Scan(&lockedPR); err != nil {
		return 0, false, ErrPurchaseRequestNotFound
	}
	if existingID, found, findErr := findOpenRFQForPurchaseRequest(ctx, tx, tu.TenantID, prID); findErr != nil {
		return 0, false, findErr
	} else if found {
		return existingID, false, nil
	}

	rfqDate := time.Now()
	var seq int
	_ = tx.QueryRow(ctx, `
		select coalesce(max(date_seq), 0) + 1 from public.rfq_requests
		where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, rfqDate.Format("2006-01-02")).Scan(&seq)
	rfqNo := fmt.Sprintf("RFQ-%s-%03d", rfqDate.Format("20060102"), seq)

	var rfqID int64
	err = tx.QueryRow(ctx, `
		insert into public.rfq_requests (tenant_id, rfq_date, date_seq, rfq_no, purchase_request_id, location_id, notes, created_by_user_id)
		values ($1, $2::date, $3, $4, $5, $6, $7, $8)
		returning id`,
		tu.TenantID, rfqDate.Format("2006-01-02"), seq, rfqNo, prID, locID, notes, tu.AppUserID).Scan(&rfqID)
	if err != nil {
		return 0, false, err
	}

	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.rfq_request_lines (
			  rfq_id, line_no, item_id, item_code, item_name, qty, unit_id, unit_code, notes, purchase_request_line_id
			) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
			rfqID, i+1, ln.ItemID, ln.ItemCode, ln.ItemName, ln.Qty, ln.UnitID, nullIfEmpty(ln.UnitCode), ln.Notes, ln.PurchaseRequestLineID)
		if err != nil {
			return 0, false, err
		}
	}

	if cerrs := customfields.ValidateAndSave(ctx, tx, tu.TenantID, rfqFormEntity, rfqID, nil); len(cerrs) > 0 {
		return 0, false, &rfqFieldError{fields: cerrs}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, false, err
	}

	_ = audit.Log(ctx, pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_create_from_pr", "rfq_request", &rfqID, nil, map[string]any{
		"purchase_request_id": prID,
		"line_count":          len(lines),
	})
	return rfqID, true, nil
}

func findOpenRFQForPurchaseRequest(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, tenantID, prID int64) (int64, bool, error) {
	var id int64
	err := q.QueryRow(ctx, `
		select id from public.rfq_requests
		where tenant_id = $1 and purchase_request_id = $2 and status <> 'cancelled'
		order by id desc
		limit 1`, tenantID, prID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	return id, true, nil
}

func writeExistingRFQ(w http.ResponseWriter, r *http.Request, pool *pgxpool.Pool, tenantID, rfqID int64) {
	hdr, err := loadRFQ(r.Context(), pool, tenantID, rfqID)
	if err != nil {
		response.Err(w, http.StatusInternalServerError, "Failed to load RFQ.", "ERR_INTERNAL")
		return
	}
	response.OK(w, hdr, "RFQ already exists for this purchase request.")
}

func patchRFQStatus(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]bool{
		"draft":     true,
		"sent":      true,
		"closed":    true,
		"cancelled": true,
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		status := strings.TrimSpace(body.Status)
		if !allowed[status] {
			response.Validation(w, map[string]string{"status": "Must be draft, sent, closed, or cancelled."})
			return
		}

		var prev string
		if err := pool.QueryRow(r.Context(), `
			select status from public.rfq_requests
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&prev); err != nil {
			response.Err(w, http.StatusNotFound, "RFQ not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := pool.Exec(r.Context(), `
			update public.rfq_requests
			set status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, status, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update RFQ status.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.rfq_patch_status", "rfq_request", &id, map[string]any{
			"status": prev,
		}, map[string]any{
			"status": status,
		})
		hdr, _ := loadRFQ(r.Context(), pool, tu.TenantID, id)
		response.OK(w, hdr, "RFQ status updated.")
	}
}

// resolveRFQLocationID picks location for a new RFQ: explicit body > PR location >
// Active branch > home. Asserts commercial access when isolation is on.
func resolveRFQLocationID(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, explicit *int64, prID *int64) (*int64, error) {
	if explicit != nil && *explicit > 0 {
		if err := branchiso.AssertCommercialLocationAccess(ctx, pool, tu, *explicit); err != nil {
			return nil, err
		}
		id := *explicit
		return &id, nil
	}
	if prID != nil && *prID > 0 {
		var prLoc *int64
		err := pool.QueryRow(ctx, `
			select location_id from public.pr_purchase_requests
			where id = $1 and tenant_id = $2 and deleted_at is null`, *prID, tu.TenantID).Scan(&prLoc)
		if err == nil && prLoc != nil && *prLoc > 0 {
			if err := branchiso.AssertCommercialLocationAccess(ctx, pool, tu, *prLoc); err != nil {
				return nil, err
			}
			return prLoc, nil
		}
	}
	if tu.ActiveBranchID > 0 {
		if err := branchiso.AssertCommercialLocationAccess(ctx, pool, tu, tu.ActiveBranchID); err != nil {
			return nil, err
		}
		id := tu.ActiveBranchID
		return &id, nil
	}
	if tu.HomeLocationID > 0 {
		if err := branchiso.AssertCommercialLocationAccess(ctx, pool, tu, tu.HomeLocationID); err != nil {
			return nil, err
		}
		id := tu.HomeLocationID
		return &id, nil
	}
	return nil, nil
}
