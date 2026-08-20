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
func importInTransitMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedInTransitHandler(pool, false)
}
func previewInTransitMapped(pool *pgxpool.Pool) http.HandlerFunc {
	return mappedInTransitHandler(pool, true)
}

func mappedOpenDocHandler(pool *pgxpool.Pool, kind string, forcePreview bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		canonical, required := openSICanonical, openSIRequired
		wantKind := "customer"
		switch kind {
		case "open_ap":
			canonical, required = openAPCanonical, openAPRequired
			wantKind = "vendor"
		case "open_po":
			canonical, required = openPOCanonical, openPORequired
			wantKind = "vendor"
		}
		tu, _ := auth.FromContext(r.Context())
		rows, ok := readMapped(w, r, pool, kind, required, canonical)
		if !ok {
			return
		}
		job := parseJobDefaults(r)
		dry := forcePreview || job.DryRun
		if msg := requireJobDefaults(job, true, true, true); msg != "" {
			response.Validation(w, map[string]string{"job": msg})
			return
		}
		tt, taxErr := loadTaxType(r.Context(), pool, tu.TenantID, job.TaxTypeID)
		if taxErr != "" {
			response.Validation(w, map[string]string{"tax_type_id": taxErr})
			return
		}

		docs, groupErrs := groupBySourceDoc(rows, 2)
		result := importResult{}
		for _, e := range groupErrs {
			result.Failed++
			result.RowErrors = append(result.RowErrors, e)
		}

		for _, doc := range docs {
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, kind, doc.SourceDocNo); hit && !dry {
				result.Updated++
				continue
			}
			if hit, _ := alreadyImported(r.Context(), pool, tu.TenantID, kind, doc.SourceDocNo); hit && dry {
				result.Updated++
				continue
			}
			first := doc.Rows[0]
			firstRow := doc.RowNums[0]
			partnerID, pErr := lookupPartner(r.Context(), pool, tu.TenantID, "", first["partner"], "", wantKind)
			if pErr != "" {
				failRow(&result, firstRow, pErr)
				continue
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
					// Header remaining only: one catch-all needs an item. Fail closed.
					failRow(&result, rowNum, "item is required (or map a catch-all product)")
					docFail = true
					continue
				}
				if errMsg != "" {
					failRow(&result, rowNum, errMsg)
					docFail = true
					continue
				}
				if item.TrackSerial {
					failRow(&result, rowNum, "serial-tracked items cannot be imported as open documents")
					docFail = true
					continue
				}
				qty := parseFloatDefault(row["quantity"], 0)
				amount := parseFloatDefault(row["amount"], 0)
				unit, q, uerr := lineUnitPrice(qty, amount)
				if uerr != "" {
					failRow(&result, rowNum, uerr)
					docFail = true
					continue
				}
				amts := taxcalc.ComputeLine(tt, unit, q, taxcalc.InputVatIncUnit)
				lines = append(lines, openLine{Item: item, Qty: q, Amt: amts, Row: rowNum})
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
	Item itemMatch
	Qty  float64
	Amt  taxcalc.LineAmounts
	Row  int
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
