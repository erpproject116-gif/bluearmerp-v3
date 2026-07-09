package purchaseorder

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
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type SupplierQuotation struct {
	ID         int64                   `json:"id"`
	RFQID      int64                   `json:"rfq_id"`
	PartnerID  int64                   `json:"partner_id"`
	QuoteDate  string                  `json:"quote_date"`
	QuoteNo    string                  `json:"quote_no"`
	Status     string                  `json:"status"`
	ValidUntil *string                 `json:"valid_until,omitempty"`
	Notes      *string                 `json:"notes,omitempty"`
	GrandTotal float64                 `json:"grand_total"`
	Lines      []SupplierQuotationLine `json:"lines,omitempty"`
}

type SupplierQuotationLine struct {
	ID               int64   `json:"id,omitempty"`
	LineNo           int     `json:"line_no"`
	RFQRequestLineID *int64  `json:"rfq_request_line_id,omitempty"`
	ItemID           *int64  `json:"item_id,omitempty"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Qty              float64 `json:"qty"`
	UnitPrice        float64 `json:"unit_price"`
	LineTotal        float64 `json:"line_total"`
}

type supplierQuotationBody struct {
	RFQID      int64   `json:"rfq_id"`
	PartnerID  int64   `json:"partner_id"`
	QuoteDate  string  `json:"quote_date"`
	ValidUntil *string `json:"valid_until"`
	Notes      *string `json:"notes"`
	Lines      []struct {
		LineNo           int     `json:"line_no"`
		RFQRequestLineID *int64  `json:"rfq_request_line_id"`
		ItemID           *int64  `json:"item_id"`
		ItemCode         string  `json:"item_code"`
		ItemName         string  `json:"item_name"`
		Qty              float64 `json:"qty"`
		UnitPrice        float64 `json:"unit_price"`
	} `json:"lines"`
}

type rfqLineRef struct {
	ItemID   *int64
	ItemCode string
	ItemName string
	Qty      float64
}

func registerSupplierQuotationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("purchase_order.supplier_quotations", auth.AccessRead)).Get("/supplier-quotations", listSupplierQuotations(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations", auth.AccessRead)).Get("/supplier-quotations/{id}", getSupplierQuotation(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations", auth.AccessRead)).Get("/supplier-quotations/{id}/print", getSupplierQuotationPrint(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations", auth.AccessRead)).Get("/supplier-quotations/{id}/pdf", getSupplierQuotationPDF(pool))
	r.With(auth.RequirePermission("comms.send", auth.AccessWrite)).Post("/supplier-quotations/{id}/send-email", postSupplierQuotationSendEmail(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations_create", auth.AccessWrite)).Post("/supplier-quotations", createSupplierQuotation(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations_create", auth.AccessWrite)).Patch("/supplier-quotations/{id}", updateSupplierQuotation(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations_create", auth.AccessWrite)).Delete("/supplier-quotations/{id}", deleteSupplierQuotation(pool))
	r.With(auth.RequirePermission("purchase_order.supplier_quotations_create", auth.AccessWrite)).Patch("/supplier-quotations/{id}/status", patchSupplierQuotationStatus(pool))
}

func listSupplierQuotations(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		where := "q.tenant_id = $1"
		args := []any{tu.TenantID}
		argN := 2

		if rfqID, ok := optionalInt64Query(r, "rfq_id"); ok {
			where += fmt.Sprintf(" and q.rfq_id = $%d", argN)
			args = append(args, *rfqID)
			argN++
		}
		if status := strings.TrimSpace(r.URL.Query().Get("status")); status != "" {
			where += fmt.Sprintf(" and q.status = $%d", argN)
			args = append(args, status)
			argN++
		}
		if q := strings.TrimSpace(r.URL.Query().Get("q")); q != "" {
			where += fmt.Sprintf(" and (q.quote_no ilike $%d or exists (select 1 from public.inv_partners p where p.id = q.partner_id and p.company_name ilike $%d))", argN, argN)
			args = append(args, "%"+q+"%")
			argN++
		}

		rows, err := pool.Query(r.Context(), fmt.Sprintf(`
			select q.id, q.rfq_id, q.partner_id, q.quote_date::text, q.quote_no, q.status,
			  q.valid_until::text, q.notes, q.grand_total::float8,
			  (select count(*)::int from public.rfq_supplier_quotation_lines ln where ln.supplier_quotation_id = q.id) as line_count
			from public.rfq_supplier_quotations q
			where %s
			order by q.quote_date desc, q.id desc
			limit 100`, where), args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list supplier quotations.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		type row struct {
			SupplierQuotation
			LineCount int `json:"line_count"`
		}
		out := make([]row, 0, 32)
		for rows.Next() {
			var x row
			if err := rows.Scan(&x.ID, &x.RFQID, &x.PartnerID, &x.QuoteDate, &x.QuoteNo, &x.Status,
				&x.ValidUntil, &x.Notes, &x.GrandTotal, &x.LineCount); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read supplier quotation.", "ERR_INTERNAL")
				return
			}
			out = append(out, x)
		}
		if out == nil {
			out = []row{}
		}
		response.OK(w, out, "OK")
	}
}

func getSupplierQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		x, err := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, x, "OK")
	}
}

func loadSupplierQuotation(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (SupplierQuotation, error) {
	var x SupplierQuotation
	err := pool.QueryRow(ctx, `
		select id, rfq_id, partner_id, quote_date::text, quote_no, status,
		  valid_until::text, notes, grand_total::float8
		from public.rfq_supplier_quotations
		where id = $1 and tenant_id = $2`, id, tenantID).Scan(
		&x.ID, &x.RFQID, &x.PartnerID, &x.QuoteDate, &x.QuoteNo, &x.Status, &x.ValidUntil, &x.Notes, &x.GrandTotal)
	if err != nil {
		return SupplierQuotation{}, err
	}

	rows, err := pool.Query(ctx, `
		select id, line_no, rfq_request_line_id, item_id, qty::float8, unit_price::float8, line_total::float8
		from public.rfq_supplier_quotation_lines
		where supplier_quotation_id = $1
		order by line_no`, id)
	if err != nil {
		return SupplierQuotation{}, err
	}
	defer rows.Close()

	for rows.Next() {
		var ln SupplierQuotationLine
		if err := rows.Scan(&ln.ID, &ln.LineNo, &ln.RFQRequestLineID, &ln.ItemID, &ln.Qty, &ln.UnitPrice, &ln.LineTotal); err != nil {
			return SupplierQuotation{}, err
		}
		if ln.RFQRequestLineID != nil {
			_ = pool.QueryRow(ctx, `
				select item_code, item_name from public.rfq_request_lines
				where id = $1`, *ln.RFQRequestLineID).Scan(&ln.ItemCode, &ln.ItemName)
		}
		x.Lines = append(x.Lines, ln)
	}
	if x.Lines == nil {
		x.Lines = []SupplierQuotationLine{}
	}
	return x, nil
}

func createSupplierQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body supplierQuotationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSupplierQuotationBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create supplier quotation.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if err := assertRFQOwned(r.Context(), tx, tu.TenantID, body.RFQID); err != nil {
			response.Validation(w, map[string]string{"rfq_id": "RFQ not found."})
			return
		}

		rfqRef, err := loadRFQLineRefs(r.Context(), tx, body.RFQID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load RFQ lines.", "ERR_INTERNAL")
			return
		}

		quoteDate, _ := parseDate(body.QuoteDate)
		var seq int
		_ = tx.QueryRow(r.Context(), `
			select coalesce(max(date_seq), 0) + 1
			from public.rfq_requests
			where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, quoteDate).Scan(&seq)
		quoteNo := fmt.Sprintf("SQ-%s-%03d", quoteDate.Format("20060102"), seq)

		var grandTotal float64
		lineItems, errs := normalizeSupplierQuotationLines(body.Lines, rfqRef, &grandTotal)
		if errs != nil {
			response.Validation(w, errs)
			return
		}

		var id int64
		err = tx.QueryRow(r.Context(), `
			insert into public.rfq_supplier_quotations
			  (tenant_id, rfq_id, partner_id, quote_date, quote_no, status, valid_until, notes, grand_total)
			values ($1, $2, $3, $4::date, $5, 'received', $6::date, $7, $8)
			returning id`,
			tu.TenantID, body.RFQID, body.PartnerID, quoteDate.Format("2006-01-02"), quoteNo, body.ValidUntil, body.Notes, grandTotal).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create supplier quotation.", "ERR_INTERNAL")
			return
		}

		for i, ln := range lineItems {
			_, err = tx.Exec(r.Context(), `
				insert into public.rfq_supplier_quotation_lines
				  (supplier_quotation_id, rfq_request_line_id, line_no, item_id, qty, unit_price, line_total)
				values ($1, $2, $3, $4, $5, $6, $7)`,
				id, ln.RFQRequestLineID, i+1, ln.ItemID, ln.Qty, ln.UnitPrice, ln.LineTotal)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save supplier quotation lines.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save supplier quotation.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.supplier_quotation_create", "rfq_supplier_quotation", &id, nil, body)
		x, _ := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		response.OK(w, x, "Supplier quotation created.")
	}
}

func updateSupplierQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}

		var body supplierQuotationBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateSupplierQuotationBody(body); errs != nil {
			response.Validation(w, errs)
			return
		}

		before, err := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		if before.Status == "accepted" {
			response.Err(w, http.StatusConflict, "Accepted supplier quotations cannot be edited.", "ERR_CONFLICT")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update supplier quotation.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		if err := assertRFQOwned(r.Context(), tx, tu.TenantID, body.RFQID); err != nil {
			response.Validation(w, map[string]string{"rfq_id": "RFQ not found."})
			return
		}
		rfqRef, err := loadRFQLineRefs(r.Context(), tx, body.RFQID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load RFQ lines.", "ERR_INTERNAL")
			return
		}

		quoteDate, _ := parseDate(body.QuoteDate)
		var grandTotal float64
		lineItems, errs := normalizeSupplierQuotationLines(body.Lines, rfqRef, &grandTotal)
		if errs != nil {
			response.Validation(w, errs)
			return
		}

		tag, err := tx.Exec(r.Context(), `
			update public.rfq_supplier_quotations
			set rfq_id = $1, partner_id = $2, quote_date = $3::date,
			  valid_until = $4::date, notes = $5, grand_total = $6, updated_at = now()
			where id = $7 and tenant_id = $8`,
			body.RFQID, body.PartnerID, quoteDate.Format("2006-01-02"),
			body.ValidUntil, body.Notes, grandTotal, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := tx.Exec(r.Context(), `delete from public.rfq_supplier_quotation_lines where supplier_quotation_id = $1`, id); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update supplier quotation lines.", "ERR_INTERNAL")
			return
		}
		for i, ln := range lineItems {
			if _, err := tx.Exec(r.Context(), `
				insert into public.rfq_supplier_quotation_lines
				  (supplier_quotation_id, rfq_request_line_id, line_no, item_id, qty, unit_price, line_total)
				values ($1, $2, $3, $4, $5, $6, $7)`,
				id, ln.RFQRequestLineID, i+1, ln.ItemID, ln.Qty, ln.UnitPrice, ln.LineTotal); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to update supplier quotation lines.", "ERR_INTERNAL")
				return
			}
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save supplier quotation.", "ERR_INTERNAL")
			return
		}

		after, _ := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.supplier_quotation_update", "rfq_supplier_quotation", &id, before, after)
		x := after
		response.OK(w, x, "Supplier quotation updated.")
	}
}

func deleteSupplierQuotation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var status string
		if err := pool.QueryRow(r.Context(), `
			select status from public.rfq_supplier_quotations
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&status); err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "accepted" {
			response.Err(w, http.StatusConflict, "Accepted supplier quotations cannot be deleted.", "ERR_CONFLICT")
			return
		}
		if _, err := pool.Exec(r.Context(), `delete from public.rfq_supplier_quotations where id = $1 and tenant_id = $2`, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to delete supplier quotation.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.supplier_quotation_delete", "rfq_supplier_quotation", &id, nil, nil)
		response.OK(w, map[string]any{"id": id}, "Deleted.")
	}
}

func patchSupplierQuotationStatus(pool *pgxpool.Pool) http.HandlerFunc {
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
		if status != "accepted" && status != "rejected" && status != "received" && status != "draft" {
			response.Validation(w, map[string]string{"status": "Must be draft, received, accepted, or rejected."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var rfqID int64
		var prev string
		if err := tx.QueryRow(r.Context(), `
			select rfq_id, status from public.rfq_supplier_quotations
			where id = $1 and tenant_id = $2`, id, tu.TenantID).Scan(&rfqID, &prev); err != nil {
			response.Err(w, http.StatusNotFound, "Supplier quotation not found.", "ERR_NOT_FOUND")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.rfq_supplier_quotations
			set status = $1, updated_at = now()
			where id = $2 and tenant_id = $3`, status, id, tu.TenantID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}
		if status == "accepted" {
			_, _ = tx.Exec(r.Context(), `
				update public.rfq_supplier_quotations
				set status = 'rejected', updated_at = now()
				where tenant_id = $1 and rfq_id = $2 and id <> $3 and status in ('draft', 'received', 'accepted')`,
				tu.TenantID, rfqID, id)
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update status.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "purchase_order.supplier_quotation_status", "rfq_supplier_quotation", &id, map[string]any{
			"status": prev,
		}, map[string]any{
			"status": status,
		})
		x, _ := loadSupplierQuotation(r.Context(), pool, tu.TenantID, id)
		response.OK(w, x, "Supplier quotation status updated.")
	}
}

func validateSupplierQuotationBody(body supplierQuotationBody) map[string]string {
	errs := map[string]string{}
	if body.RFQID <= 0 {
		errs["rfq_id"] = "RFQ is required."
	}
	if body.PartnerID <= 0 {
		errs["partner_id"] = "Supplier is required."
	}
	if strings.TrimSpace(body.QuoteDate) == "" {
		errs["quote_date"] = "Quote date is required."
	} else if _, err := parseDate(body.QuoteDate); err != nil {
		errs["quote_date"] = "Invalid date. Use YYYY-MM-DD."
	}
	if body.ValidUntil != nil && strings.TrimSpace(*body.ValidUntil) != "" {
		if _, err := parseDate(*body.ValidUntil); err != nil {
			errs["valid_until"] = "Invalid date. Use YYYY-MM-DD."
		}
	}
	if len(body.Lines) == 0 {
		errs["lines"] = "At least one line is required."
	}
	if len(errs) > 0 {
		return errs
	}
	return nil
}

func assertRFQOwned(ctx context.Context, tx pgx.Tx, tenantID, rfqID int64) error {
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists(
		  select 1 from public.rfq_requests
		  where id = $1 and tenant_id = $2
		)`, rfqID, tenantID).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return fmt.Errorf("not found")
	}
	return nil
}

func loadRFQLineRefs(ctx context.Context, tx pgx.Tx, rfqID int64) (map[int64]rfqLineRef, error) {
	rows, err := tx.Query(ctx, `
		select id, item_id, item_code, item_name, qty::float8
		from public.rfq_request_lines
		where rfq_id = $1`, rfqID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int64]rfqLineRef{}
	for rows.Next() {
		var id int64
		var x rfqLineRef
		if err := rows.Scan(&id, &x.ItemID, &x.ItemCode, &x.ItemName, &x.Qty); err != nil {
			return nil, err
		}
		out[id] = x
	}
	return out, nil
}

func normalizeSupplierQuotationLines(lines []struct {
	LineNo           int     `json:"line_no"`
	RFQRequestLineID *int64  `json:"rfq_request_line_id"`
	ItemID           *int64  `json:"item_id"`
	ItemCode         string  `json:"item_code"`
	ItemName         string  `json:"item_name"`
	Qty              float64 `json:"qty"`
	UnitPrice        float64 `json:"unit_price"`
}, refs map[int64]rfqLineRef, grandTotal *float64) ([]SupplierQuotationLine, map[string]string) {
	errs := map[string]string{}
	out := make([]SupplierQuotationLine, 0, len(lines))
	for i, raw := range lines {
		ln := SupplierQuotationLine{
			LineNo:           i + 1,
			RFQRequestLineID: raw.RFQRequestLineID,
			ItemID:           raw.ItemID,
			ItemCode:         strings.TrimSpace(raw.ItemCode),
			ItemName:         strings.TrimSpace(raw.ItemName),
			Qty:              raw.Qty,
			UnitPrice:        raw.UnitPrice,
		}
		if raw.LineNo > 0 {
			ln.LineNo = raw.LineNo
		}
		if ln.RFQRequestLineID != nil {
			ref, ok := refs[*ln.RFQRequestLineID]
			if !ok {
				errs[fmt.Sprintf("lines[%d].rfq_request_line_id", i)] = "RFQ line not found."
				continue
			}
			ln.ItemID = ref.ItemID
			if ln.ItemCode == "" {
				ln.ItemCode = ref.ItemCode
			}
			if ln.ItemName == "" {
				ln.ItemName = ref.ItemName
			}
			if ln.Qty <= 0 {
				ln.Qty = ref.Qty
			}
		}
		if ln.Qty <= 0 {
			errs[fmt.Sprintf("lines[%d].qty", i)] = "Quantity must be positive."
			continue
		}
		if ln.UnitPrice < 0 {
			errs[fmt.Sprintf("lines[%d].unit_price", i)] = "Unit price cannot be negative."
			continue
		}
		if ln.ItemName == "" {
			errs[fmt.Sprintf("lines[%d].item_name", i)] = "Item is required."
			continue
		}
		ln.LineTotal = ln.Qty * ln.UnitPrice
		*grandTotal += ln.LineTotal
		out = append(out, ln)
	}
	if len(out) == 0 && len(errs) == 0 {
		errs["lines"] = "At least one valid line is required."
	}
	if len(errs) > 0 {
		return nil, errs
	}
	return out, nil
}
