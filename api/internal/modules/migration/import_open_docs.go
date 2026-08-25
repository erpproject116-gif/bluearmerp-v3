package migration

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/taxcalc"
)

var openSICanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "si_dr_no"}
var openSIRequired = []string{"source_doc_no", "partner", "date", "amount"}

var openAPCanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount", "vendor_invoice_no"}
var openAPRequired = []string{"source_doc_no", "partner", "date", "amount"}

var openPOCanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"}
var openPORequired = []string{"source_doc_no", "partner", "date", "item", "quantity"}

var openQuoCanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"}
var openQuoRequired = []string{"source_doc_no", "partner", "date", "item", "quantity"}

var openSOCanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"}
var openSORequired = []string{"source_doc_no", "partner", "date", "item", "quantity"}

var openPRCanonical = []string{"source_doc_no", "partner", "date", "item_code", "item", "quantity", "amount"}
var openPRRequired = []string{"source_doc_no", "date", "item", "quantity"}

var openRFQCanonical = []string{"source_doc_no", "date", "item_code", "item", "quantity", "notes"}
var openRFQRequired = []string{"source_doc_no", "date", "item", "quantity"}

var inTransitCanonical = []string{"item_code", "item", "quantity", "from_location", "to_location", "date"}
var inTransitRequired = []string{"quantity", "from_location", "to_location"}

func importOpenSIMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_si", false)
}
func previewOpenSIMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_si", true)
}
func importOpenAPMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_ap", false)
}
func previewOpenAPMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_ap", true)
}
func importOpenPOMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_po", false)
}
func previewOpenPOMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_po", true)
}
func importOpenQuoMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_quo", false)
}
func previewOpenQuoMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_quo", true)
}
func importOpenSOMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_so", false)
}
func previewOpenSOMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_so", true)
}
func importOpenPRMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_pr", false)
}
func previewOpenPRMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_pr", true)
}
func importOpenRFQMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_rfq", false)
}
func previewOpenRFQMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedOpenDocHandler(pool, "open_rfq", true)
}
func importInTransitMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedInTransitHandler(pool, false)
}
func previewInTransitMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedInTransitHandler(pool, true)
}

func openDocSpec(kind string) (canonical, required []string, wantKind string, needTax, needCurrency, needLocation, amountRequired, blockSerial bool) {
	switch kind {
	case "open_ap":
		return openAPCanonical, openAPRequired, "vendor", true, true, true, true, true
	case "open_po":
		return openPOCanonical, openPORequired, "vendor", true, true, true, true, false
	case "open_quo":
		return openQuoCanonical, openQuoRequired, "customer", true, true, true, false, false
	case "open_so":
		return openSOCanonical, openSORequired, "customer", true, true, true, false, false
	case "open_pr":
		return openPRCanonical, openPRRequired, "vendor", true, true, true, false, false
	case "open_rfq":
		return openRFQCanonical, openRFQRequired, "", false, false, false, false, false
	default: // open_si
		return openSICanonical, openSIRequired, "customer", true, true, true, true, true
	}
}

func mappedOpenDocHandler(pool *pgxpool.Pool, kind string, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		canonical, required, wantKind, needTax, needCurrency, needLocation, amountRequired, blockSerial := openDocSpec(kind)
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, kind, required, canonical)
		if !ok {
			return
		}
		job := parseJobDefaults(r)
		dry := forcePreview || job.DryRun
		if msg := requireJobDefaults(job, needTax, needCurrency, needLocation); msg != "" {
			response.Validation(w, map[string]string{"job": msg})
			return
		}
		var tt taxcalc.TaxType
		if needTax {
			var taxErr string
			tt, taxErr = loadTaxType(r.Context(), pool, tu.TenantID, job.TaxTypeID)
			if taxErr != "" {
				response.Validation(w, map[string]string{"tax_type_id": taxErr})
				return
			}
		}

		docs, groupErrs := groupBySourceDoc(rows, 2)
		result := importResult{}
		for _, e := range groupErrs {
			result.Failed++
			result.RowErrors = append(result.RowErrors, e)
		}

		for _, doc := range docs {
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, kind, doc.SourceDocNo); hit {
				result.Updated++
				continue
			}
			first := doc.Rows[0]
			firstRow := doc.RowNums[0]
			var partnerID int64
			if wantKind != "" || strings.TrimSpace(first["partner"]) != "" {
				var pErr string
				partnerID, pErr = lookupPartner(r.Context(), pool, tu.TenantID, "", first["partner"], "", wantKind)
				if pErr != "" {
					if kind == "open_pr" && strings.TrimSpace(first["partner"]) == "" {
						partnerID = 0
					} else if kind == "open_rfq" {
						partnerID = 0
					} else {
						failRow(&result, firstRow, pErr)
						continue
					}
				}
			}
			dateStr := strings.TrimSpace(first["date"])
			if _, err := time.Parse("2006-01-02", dateStr); err != nil {
				failRow(&result, firstRow, "date must be YYYY-MM-DD")
				continue
			}

			var lines []openLine
			docFail := false
			for i, row := range doc.Rows {
				rowNum := doc.RowNums[i]
				item, errMsg := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["item_code"]), strings.TrimSpace(row["item"]))
				if item.ID == 0 && strings.HasPrefix(errMsg, "unmatched item_code") {
					item, errMsg = lookupItem(r.Context(), pool, tu.TenantID, "", strings.TrimSpace(row["item"]))
				}
				if strings.TrimSpace(row["item"]) == "" && strings.TrimSpace(row["item_code"]) == "" && parseFloatDefault(row["amount"], 0) > 0 {
					failRow(&result, rowNum, "item is required (or map a catch-all product)")
					docFail = true
					continue
				}
				if errMsg != "" {
					failRow(&result, rowNum, errMsg)
					docFail = true
					continue
				}
				if blockSerial && item.TrackSerial {
					failRow(&result, rowNum, "serial-tracked items cannot be imported as open documents")
					docFail = true
					continue
				}
				qty := parseFloatDefault(row["quantity"], 0)
				amount := parseFloatDefault(row["amount"], 0)
				var unit, q float64
				var uerr string
				if amountRequired {
					unit, q, uerr = lineUnitPrice(qty, amount)
				} else {
					unit, q, uerr = lineUnitPriceOptional(qty, amount)
				}
				if uerr != "" {
					failRow(&result, rowNum, uerr)
					docFail = true
					continue
				}
				var amts taxcalc.LineAmounts
				if needTax {
					amts = taxcalc.ComputeLine(tt, unit, q, taxcalc.InputVatIncUnit)
				} else {
					amts = taxcalc.LineAmounts{UnitNonVat: unit, UnitVatInc: unit, NonVatTotal: unit * q, LineTotal: unit * q}
				}
				lines = append(lines, openLine{Item: item, Qty: q, Amt: amts, Row: rowNum, Notes: strings.TrimSpace(row["notes"])})
			}
			if docFail || len(lines) == 0 {
				continue
			}
			if dry {
				result.Created++
				continue
			}

			tx, err := pool.Begin(r.Context())
			if err != nil {
				failRow(&result, firstRow, err.Error())
				continue
			}
			var writeErr error
			switch kind {
			case "open_si":
				writeErr = insertOpenSale(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines, first["si_dr_no"])
			case "open_ap":
				writeErr = insertOpenBill(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines, first["vendor_invoice_no"])
			case "open_po":
				writeErr = insertOpenPO(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines)
			case "open_quo":
				writeErr = insertOpenQuotation(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines)
			case "open_so":
				writeErr = insertOpenSalesOrder(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines)
			case "open_pr":
				writeErr = insertOpenPurchaseRequest(r.Context(), tx, tu, job, dateStr, partnerID, doc, lines)
			case "open_rfq":
				writeErr = insertOpenRFQ(r.Context(), tx, tu, dateStr, doc, lines, first["notes"])
			}
			if writeErr != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, firstRow, writeErr.Error())
				continue
			}
			if err := tx.Commit(r.Context()); err != nil {
				failRow(&result, firstRow, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, dry)
	}
}

type openLine struct {
	Item  itemMatch
	Qty   float64
	Amt   taxcalc.LineAmounts
	Row   int
	Notes string
}

func insertOpenSale(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine, siDrNo string) error {
	var dateSeq int
	var salesNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, sales_no from public.allocate_sales_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &salesNo); err != nil {
		return err
	}
	var sub, tax, grand float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
	}
	notes := "Opening/cutover — remaining unpaid. Do not deduct stock."
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.sa_sales (
		  tenant_id, order_date, date_seq, sales_no,
		  tax_type_id, currency_id, partner_id, pic_name, location_id,
		  si_dr_no, notes, progress_status, template_code,
		  subtotal, tax_total, grand_total, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,'',$8,$9,$10,'unconfirmed','default',$11,$12,$13,$14,$15)
		returning id`,
		tu.TenantID, dateStr, dateSeq, salesNo,
		job.TaxTypeID, job.CurrencyID, partnerID, job.LocationID,
		nullIfEmpty(siDrNo), notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.sa_sales_lines (
			  sales_id, line_no, item_id, item_code, item_name,
			  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, i+1, ln.Item.ID, ln.Item.Code, ln.Item.Name,
			ln.Qty, ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_si", doc.SourceDocNo, id)
}

func insertOpenBill(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine, vendorNo string) error {
	var dateSeq int
	var invoiceNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, invoice_no from public.allocate_fin_supplier_invoice_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &invoiceNo); err != nil {
		return err
	}
	var sub, tax, grand float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
	}
	notes := "Opening/cutover — remaining payable. Goods already received; no GR."
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.fin_supplier_invoices (
		  tenant_id, invoice_date, date_seq, invoice_no,
		  tax_type_id, partner_id, currency_id, location_id,
		  vendor_invoice_no, notes, subtotal, tax_total, grand_total,
		  progress_status, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'unconfirmed',$14,$15)
		returning id`,
		tu.TenantID, dateStr, dateSeq, invoiceNo,
		job.TaxTypeID, partnerID, job.CurrencyID, job.LocationID,
		nullIfEmpty(vendorNo), notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.fin_supplier_invoice_lines (
			  supplier_invoice_id, line_no, item_id, item_code, item_name,
			  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, i+1, ln.Item.ID, ln.Item.Code, ln.Item.Name,
			ln.Qty, ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_ap", doc.SourceDocNo, id)
}

func insertOpenPO(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine) error {
	var dateSeq int
	var poNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, purchase_order_no from public.allocate_purchase_order_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &poNo); err != nil {
		return err
	}
	var sub, tax, grand float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
	}
	notes := "Opening/cutover — undelivered PO. Do not receive."
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.po_purchase_orders (
		  tenant_id, order_date, date_seq, purchase_order_no,
		  tax_type_id, currency_id, partner_id, pic_name, location_id,
		  status, notes, subtotal, tax_total, grand_total, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,'',$8,'draft',$9,$10,$11,$12,$13,$14)
		returning id`,
		tu.TenantID, dateStr, dateSeq, poNo,
		job.TaxTypeID, job.CurrencyID, partnerID, job.LocationID,
		notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	var partnerCode, partnerName string
	_ = tx.QueryRow(ctx, `select partner_code, company_name from public.inv_partners where id = $1`, partnerID).Scan(&partnerCode, &partnerName)
	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.po_purchase_order_lines (
			  purchase_order_id, line_no, partner_id, partner_code, partner_name,
			  item_id, item_code, item_name, qty, input_basis,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'vat_inc_unit',$10,$11,$12,$13,$14)`,
			id, i+1, partnerID, partnerCode, partnerName,
			ln.Item.ID, ln.Item.Code, ln.Item.Name, ln.Qty,
			ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_po", doc.SourceDocNo, id)
}

func insertOpenQuotation(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine) error {
	var dateSeq int
	var referenceNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, reference_no from public.allocate_quotation_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &referenceNo); err != nil {
		return err
	}
	var sub, tax, grand float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
	}
	notes := "Opening/cutover — open quotation. Unconfirmed; no stock impact."
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.quo_quotations (
		  tenant_id, order_date, date_seq, reference_no,
		  tax_type_id, currency_id, partner_id, pic_name, location_id,
		  notes, progress_status, subtotal, tax_total, grand_total, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,'',$8,$9,'unconfirmed',$10,$11,$12,$13,$14)
		returning id`,
		tu.TenantID, dateStr, dateSeq, referenceNo,
		job.TaxTypeID, job.CurrencyID, partnerID, job.LocationID,
		notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.quo_quotation_lines (
			  quotation_id, line_no, item_id, item_code, item_name,
			  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, i+1, ln.Item.ID, ln.Item.Code, ln.Item.Name,
			ln.Qty, ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_quo", doc.SourceDocNo, id)
}

func insertOpenSalesOrder(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine) error {
	var dateSeq int
	var salesOrderNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, sales_order_no from public.allocate_sales_order_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &salesOrderNo); err != nil {
		return err
	}
	var sub, tax, grand float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
	}
	notes := "Opening/cutover — open sales order. Unconfirmed; no stock reservation."
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.so_sales_orders (
		  tenant_id, order_date, date_seq, sales_order_no,
		  tax_type_id, currency_id, partner_id, pic_name, location_id,
		  notes, progress_status, subtotal, tax_total, grand_total, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,'',$8,$9,'unconfirmed',$10,$11,$12,$13,$14)
		returning id`,
		tu.TenantID, dateStr, dateSeq, salesOrderNo,
		job.TaxTypeID, job.CurrencyID, partnerID, job.LocationID,
		notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	for i, ln := range lines {
		_, err = tx.Exec(ctx, `
			insert into public.so_sales_order_lines (
			  sales_order_id, line_no, item_id, item_code, item_name,
			  qty, unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
			id, i+1, ln.Item.ID, ln.Item.Code, ln.Item.Name,
			ln.Qty, ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_so", doc.SourceDocNo, id)
}

func insertOpenPurchaseRequest(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, job jobDefaults, dateStr string, partnerID int64, doc groupedDoc, lines []openLine) error {
	var dateSeq int
	var prNo string
	if err := tx.QueryRow(ctx,
		`select date_seq, purchase_request_no from public.allocate_purchase_request_sequences($1, $2::date)`,
		tu.TenantID, dateStr).Scan(&dateSeq, &prNo); err != nil {
		return err
	}
	var sub, tax, grand, totalQty float64
	for _, ln := range lines {
		sub += ln.Amt.NonVatTotal
		tax += ln.Amt.TaxAmount
		grand += ln.Amt.LineTotal
		totalQty += ln.Qty
	}
	notes := "Opening/cutover — open purchase request. Unconfirmed."
	var partnerArg any
	if partnerID > 0 {
		partnerArg = partnerID
	}
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.pr_purchase_requests (
		  tenant_id, request_date, date_seq, purchase_request_no,
		  tax_type_id, currency_id, partner_id, pic_name, location_id,
		  progress_status, total_qty, notes, subtotal, tax_total, grand_total, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,$5,$6,$7,'',$8,'unconfirmed',$9,$10,$11,$12,$13,$14,$15)
		returning id`,
		tu.TenantID, dateStr, dateSeq, prNo,
		job.TaxTypeID, job.CurrencyID, partnerArg, job.LocationID,
		totalQty, notes, sub, tax, grand, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	var partnerCode, partnerName string
	if partnerID > 0 {
		_ = tx.QueryRow(ctx, `select partner_code, company_name from public.inv_partners where id = $1`, partnerID).Scan(&partnerCode, &partnerName)
	}
	for i, ln := range lines {
		var linePartner any
		if partnerID > 0 {
			linePartner = partnerID
		}
		_, err = tx.Exec(ctx, `
			insert into public.pr_purchase_request_lines (
			  purchase_request_id, line_no, partner_id, partner_code, partner_name,
			  item_id, item_code, item_name, qty, input_basis,
			  unit_non_vat, non_vat_total, tax_amount, unit_vat_inc, line_total
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'vat_inc_unit',$10,$11,$12,$13,$14)`,
			id, i+1, linePartner, partnerCode, partnerName,
			ln.Item.ID, ln.Item.Code, ln.Item.Name, ln.Qty,
			ln.Amt.UnitNonVat, ln.Amt.NonVatTotal, ln.Amt.TaxAmount, ln.Amt.UnitVatInc, ln.Amt.LineTotal)
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_pr", doc.SourceDocNo, id)
}

func insertOpenRFQ(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, dateStr string, doc groupedDoc, lines []openLine, headerNotes string) error {
	var seq int
	if err := tx.QueryRow(ctx, `
		select coalesce(max(date_seq), 0) + 1 from public.rfq_requests
		where tenant_id = $1 and rfq_date = $2::date`, tu.TenantID, dateStr).Scan(&seq); err != nil {
		return err
	}
	rfqNo := fmt.Sprintf("RFQ-%s-%03d", strings.ReplaceAll(dateStr, "-", ""), seq)
	notes := strings.TrimSpace(headerNotes)
	if notes == "" {
		notes = "Opening/cutover — open RFQ (draft)."
	}
	var id int64
	err := tx.QueryRow(ctx, `
		insert into public.rfq_requests (
		  tenant_id, rfq_date, date_seq, rfq_no, status, notes, created_by_user_id, mig_source_doc_no
		) values ($1,$2::date,$3,$4,'draft',$5,$6,$7)
		returning id`,
		tu.TenantID, dateStr, seq, rfqNo, notes, tu.AppUserID, doc.SourceDocNo,
	).Scan(&id)
	if err != nil {
		return err
	}
	for i, ln := range lines {
		itemID := any(ln.Item.ID)
		_, err = tx.Exec(ctx, `
			insert into public.rfq_request_lines (rfq_id, line_no, item_id, item_code, item_name, qty, notes)
			values ($1,$2,$3,$4,$5,$6,$7)`,
			id, i+1, itemID, ln.Item.Code, ln.Item.Name, ln.Qty, nullIfEmpty(ln.Notes))
		if err != nil {
			return err
		}
	}
	return rememberImport(ctx, tx, tu.TenantID, "open_rfq", doc.SourceDocNo, id)
}

func mappedInTransitHandler(pool *pgxpool.Pool, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, "in_transit", inTransitRequired, inTransitCanonical)
		if !ok {
			return
		}
		dry := forcePreview || parseJobDefaults(r).DryRun
		result := importResult{}
		type tline struct {
			ItemID int64
			Qty    float64
			Row    int
		}
		type bucket struct {
			From, To int64
			Date     string
			Lines    []tline
		}
		buckets := map[string]*bucket{}
		order := []string{}
		for i, row := range rows {
			rowNum := i + 2
			item, errMsg := lookupItem(r.Context(), pool, tu.TenantID, strings.TrimSpace(row["item_code"]), strings.TrimSpace(row["item"]))
			if item.ID == 0 && strings.HasPrefix(errMsg, "unmatched item_code") {
				item, errMsg = lookupItem(r.Context(), pool, tu.TenantID, "", strings.TrimSpace(row["item"]))
			}
			if errMsg != "" {
				failRow(&result, rowNum, errMsg)
				continue
			}
			if item.TrackSerial {
				failRow(&result, rowNum, "serial-tracked items cannot use in-transit qty")
				continue
			}
			qty := parseFloatDefault(row["quantity"], 0)
			if qty <= 0 {
				failRow(&result, rowNum, "quantity must be greater than 0")
				continue
			}
			fromID, fromErr := lookupLocation(r.Context(), pool, tu.TenantID, row["from_location"])
			if fromErr != "" {
				failRow(&result, rowNum, fromErr)
				continue
			}
			toID, toErr := lookupLocation(r.Context(), pool, tu.TenantID, row["to_location"])
			if toErr != "" {
				failRow(&result, rowNum, toErr)
				continue
			}
			dateStr := strings.TrimSpace(row["date"])
			if dateStr == "" {
				dateStr = time.Now().UTC().Format("2006-01-02")
			}
			if _, err := time.Parse("2006-01-02", dateStr); err != nil {
				failRow(&result, rowNum, "date must be YYYY-MM-DD")
				continue
			}
			key := fmt.Sprintf("%d|%d|%s", fromID, toID, dateStr)
			if _, ok := buckets[key]; !ok {
				buckets[key] = &bucket{From: fromID, To: toID, Date: dateStr}
				order = append(order, key)
			}
			buckets[key].Lines = append(buckets[key].Lines, tline{item.ID, qty, rowNum})
		}
		if dry {
			result.Created += len(order)
			writeImportResult(w, result, true)
			return
		}
		notes := "Opening/cutover in-transit"
		for _, key := range order {
			b := buckets[key]
			sourceNo := "in_transit:" + key
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, "in_transit", sourceNo); hit {
				result.Updated++
				continue
			}
			tx, err := pool.Begin(r.Context())
			if err != nil {
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			entryNo := fmt.Sprintf("SE-XFER-%s-%d", strings.ReplaceAll(b.Date, "-", ""), time.Now().UnixNano()%100000)
			var entryID int64
			err = tx.QueryRow(r.Context(), `
				insert into public.inv_stock_entries (
				  tenant_id, entry_date, entry_no, entry_type, from_location_id, to_location_id, notes, created_by_user_id, mig_source_doc_no
				) values ($1,$2::date,$3,'transfer',$4,$5,$6,$7,$8) returning id`,
				tu.TenantID, b.Date, entryNo, b.From, b.To, notes, tu.AppUserID, sourceNo).Scan(&entryID)
			if err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			okLines := true
			for i, ln := range b.Lines {
				if _, err = tx.Exec(r.Context(), `
					insert into public.inv_stock_entry_lines (stock_entry_id, line_no, item_id, qty)
					values ($1,$2,$3,$4)`, entryID, i+1, ln.ItemID, ln.Qty); err != nil {
					okLines = false
					failRow(&result, ln.Row, err.Error())
					break
				}
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, b.From, -ln.Qty, tu.AppUserID, "stock_entry", entryID, "transfer_out", notes); err != nil {
					okLines = false
					failRow(&result, ln.Row, err.Error())
					break
				}
				if err := inventory.ApplyStockDelta(r.Context(), tx, tu.TenantID, ln.ItemID, b.To, ln.Qty, tu.AppUserID, "stock_entry", entryID, "transfer_in", notes); err != nil {
					okLines = false
					failRow(&result, ln.Row, err.Error())
					break
				}
			}
			if !okLines {
				_ = tx.Rollback(r.Context())
				continue
			}
			if _, err = tx.Exec(r.Context(), `
				update public.inv_stock_entries set status = 'posted', posted_at = now(), updated_at = now() where id = $1`, entryID); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			if err := rememberImport(r.Context(), tx, tu.TenantID, "in_transit", sourceNo, entryID); err != nil {
				_ = tx.Rollback(r.Context())
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			if err := tx.Commit(r.Context()); err != nil {
				failRow(&result, b.Lines[0].Row, err.Error())
				continue
			}
			result.Created++
		}
		writeImportResult(w, result, false)
	}
}
