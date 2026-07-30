package finance

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type unmatchedPaymentRow struct {
	PaymentType   string  `json:"payment_type"`
	PaymentID     int64   `json:"payment_id"`
	PaymentDate   string  `json:"payment_date"`
	DocumentNo    string  `json:"document_no"`
	PartnerName   string  `json:"partner_name"`
	PaymentMethod string  `json:"payment_method"`
	ReferenceNo   string  `json:"reference_no,omitempty"`
	Amount        float64 `json:"amount"`
}

type bankStatementPlaceholder struct {
	ID            int64   `json:"id"`
	BankAccountID int64   `json:"bank_account_id"`
	StatementDate string  `json:"statement_date"`
	ReferenceNo   string  `json:"reference_no,omitempty"`
	Description   string  `json:"description,omitempty"`
	Amount        float64 `json:"amount"`
	IsMatched     bool    `json:"is_matched"`
}

const (
	statementImportMaxRows  = 500
	statementImportMaxBytes = 5 << 20
)

var (
	statementImportRequiredHeaders = []string{"date", "reference", "description", "amount"}
	statementImportOptionalHeaders = []string{"bank_account_code"}
	statementImportAllHeaders      = append(append([]string{}, statementImportRequiredHeaders...), statementImportOptionalHeaders...)
	statementImportExample         = []string{"2026-01-15", "CHK-1001", "Customer deposit", "15000.00", "BDO-MAIN"}
)

type statementImportRowError struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

type statementImportResult struct {
	Created   int                       `json:"created"`
	Failed    int                       `json:"failed"`
	RowErrors []statementImportRowError `json:"row_errors,omitempty"`
}

type validatedStatementImportRow struct {
	rowNum        int
	bankAccountID int64
	statementDate time.Time
	referenceNo   string
	description   string
	amount        float64
}

func registerBankReconciliationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/bank-reconciliation/unmatched", listUnmatchedPayments(pool))
	r.Get("/bank-reconciliation/statement-lines", listBankStatementLines(pool))
	r.Get("/bank-reconciliation/statement-lines/import-template", bankStatementImportTemplateHandler())
	r.Post("/bank-reconciliation/statement-lines/import", importBankStatementLines(pool))
	r.Post("/bank-reconciliation/match", matchBankStatementLine(pool))
}

func bankStatementImportTemplateHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="bank-statement-import-template.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write(statementImportAllHeaders)
		_ = cw.Write(statementImportExample)
		cw.Flush()
	}
}

func importBankStatementLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if err := r.ParseMultipartForm(statementImportMaxBytes); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid upload."})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "CSV file is required."})
			return
		}
		defer file.Close()

		defaultBankAccountID := int64(0)
		if v := strings.TrimSpace(r.FormValue("bank_account_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"bank_account_id": "Invalid bank account id."})
				return
			}
			defaultBankAccountID = id
		}

		records, err := csv.NewReader(file).ReadAll()
		if err != nil {
			response.Validation(w, map[string]string{"file": "Could not read CSV."})
			return
		}
		if len(records) < 2 {
			response.Validation(w, map[string]string{"file": "CSV must include a header row and at least one data row."})
			return
		}
		colIdx, err := mapStatementCSVHeaders(records[0], statementImportRequiredHeaders)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}

		dataRows := records[1:]
		if len(dataRows) > statementImportMaxRows {
			response.Validation(w, map[string]string{"file": fmt.Sprintf("Maximum %d rows per import.", statementImportMaxRows)})
			return
		}

		bankCodeCache := map[string]int64{}
		result := statementImportResult{}
		var valid []validatedStatementImportRow
		for i, raw := range dataRows {
			rowNum := i + 2
			if isEmptyStatementCSVRow(raw) {
				continue
			}
			row := extractStatementCSVRow(raw, colIdx, statementImportAllHeaders)
			parsed, err := parseStatementImportRow(r.Context(), pool, tu.TenantID, row, defaultBankAccountID, bankCodeCache)
			if err != nil {
				result.Failed++
				result.RowErrors = append(result.RowErrors, statementImportRowError{Row: rowNum, Message: err.Error()})
				continue
			}
			parsed.rowNum = rowNum
			valid = append(valid, parsed)
		}
		if len(valid) == 0 && result.Failed == 0 {
			response.Validation(w, map[string]string{"file": "No data rows found."})
			return
		}
		if len(valid) == 0 {
			msg := fmt.Sprintf("Imported 0 row(s); %d failed.", result.Failed)
			response.OK(w, result, msg)
			return
		}

		createdIDs, err := bulkImportStatementLines(r.Context(), pool, tu.TenantID, valid)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Import failed: "+err.Error(), "ERR_INTERNAL")
			return
		}
		result.Created = len(createdIDs)
		_ = audit.LogSync(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_statement.import_batch", "fin_bank_statement_line", nil, nil, map[string]any{
			"imported_count":           result.Created,
			"skipped_validation_count":   result.Failed,
			"created_ids":              createdIDs,
			"default_bank_account_id":  defaultBankAccountID,
		})
		msg := fmt.Sprintf("Imported %d statement line(s).", result.Created)
		if result.Failed > 0 {
			msg = fmt.Sprintf("Imported %d statement line(s); %d failed validation.", result.Created, result.Failed)
		}
		response.OK(w, result, msg)
	}
}

func parseStatementImportRow(ctx context.Context, pool *pgxpool.Pool, tenantID int64, row map[string]string, defaultBankAccountID int64, bankCodeCache map[string]int64) (validatedStatementImportRow, error) {
	dateRaw := strings.TrimSpace(row["date"])
	if dateRaw == "" {
		return validatedStatementImportRow{}, fmt.Errorf("date is required")
	}
	stmtDate, err := time.Parse("2006-01-02", dateRaw)
	if err != nil {
		return validatedStatementImportRow{}, fmt.Errorf("date must be YYYY-MM-DD")
	}

	amountRaw := strings.TrimSpace(row["amount"])
	if amountRaw == "" {
		return validatedStatementImportRow{}, fmt.Errorf("amount is required")
	}
	amount, err := strconv.ParseFloat(amountRaw, 64)
	if err != nil {
		return validatedStatementImportRow{}, fmt.Errorf("amount must be a number")
	}
	if amount == 0 {
		return validatedStatementImportRow{}, fmt.Errorf("amount cannot be zero")
	}

	bankAccountID := defaultBankAccountID
	code := strings.TrimSpace(row["bank_account_code"])
	if code != "" {
		if id, ok := bankCodeCache[code]; ok {
			bankAccountID = id
		} else {
			var id int64
			err := pool.QueryRow(ctx, `
				select id from public.fin_bank_accounts
				where tenant_id = $1 and bank_account_code = $2 and deleted_at is null`,
				tenantID, code,
			).Scan(&id)
			if err != nil {
				return validatedStatementImportRow{}, fmt.Errorf("bank account code not found: %s", code)
			}
			bankCodeCache[code] = id
			bankAccountID = id
		}
	}
	if bankAccountID <= 0 {
		return validatedStatementImportRow{}, fmt.Errorf("bank account is required (select an account above or add bank_account_code column)")
	}

	return validatedStatementImportRow{
		bankAccountID: bankAccountID,
		statementDate: stmtDate,
		referenceNo:   strings.TrimSpace(row["reference"]),
		description:   strings.TrimSpace(row["description"]),
		amount:        amount,
	}, nil
}

func bulkImportStatementLines(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rows []validatedStatementImportRow) ([]int64, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var ids []int64
	for _, row := range rows {
		var id int64
		err := tx.QueryRow(ctx, `
			insert into public.fin_bank_statement_lines (
			  tenant_id, bank_account_id, statement_date, reference_no, description, amount
			) values ($1, $2, $3::date, nullif($4, ''), nullif($5, ''), $6)
			returning id`,
			tenantID, row.bankAccountID, row.statementDate.Format("2006-01-02"),
			row.referenceNo, row.description, row.amount,
		).Scan(&id)
		if err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return ids, nil
}

func mapStatementCSVHeaders(headerRow []string, expected []string) (map[string]int, error) {
	idx := map[string]int{}
	for i, h := range headerRow {
		key := strings.ToLower(strings.TrimSpace(h))
		if key == "" {
			continue
		}
		idx[key] = i
	}
	for _, col := range expected {
		if _, ok := idx[col]; !ok {
			return nil, fmt.Errorf("missing required column: %s", col)
		}
	}
	return idx, nil
}

func extractStatementCSVRow(raw []string, colIdx map[string]int, headers []string) map[string]string {
	row := make(map[string]string, len(headers))
	for _, col := range headers {
		i := colIdx[col]
		if i < len(raw) {
			row[col] = strings.TrimSpace(raw[i])
		}
	}
	return row
}

func isEmptyStatementCSVRow(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

func listUnmatchedPayments(pool *pgxpool.Pool) http.HandlerFunc {
	allowed := map[string]string{
		"payment_date": "payment_date", "amount": "amount", "document_no": "document_no",
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "payment_date", allowed)
		if p.Order == "" {
			p.Order = "desc"
		}
		offset := httputil.Offset(p)

		bankAccountID := int64(0)
		if v := strings.TrimSpace(r.URL.Query().Get("bank_account_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"bank_account_id": "Invalid bank account id."})
				return
			}
			bankAccountID = id
		}

		base := `
		select payment_type, payment_id, payment_date, document_no, partner_name, payment_method,
		  coalesce(reference_no, ''), amount
		from (
		  select 'official_receipt'::text as payment_type, r.id as payment_id, r.receipt_date as payment_date,
		    r.receipt_no as document_no, coalesce(p.company_name, '') as partner_name,
		    r.payment_method, r.reference_no, r.amount_total::float8 as amount
		  from public.fin_official_receipts r
		  left join public.inv_partners p on p.id = r.partner_id
		  where r.tenant_id = $1 and r.deleted_at is null
		    and r.payment_method in ('check', 'bank_transfer')
		    and not exists (
		      select 1 from public.fin_bank_statement_lines bsl
		      where bsl.tenant_id = r.tenant_id
		        and bsl.matched_payment_type = 'official_receipt'
		        and bsl.matched_payment_id = r.id
		    )
		  union all
		  select 'payment_voucher'::text, pv.id, pv.payment_date,
		    pv.payment_no, coalesce(p.company_name, ''),
		    pv.payment_method, pv.reference_no, pv.amount_total::float8
		  from public.fin_payment_vouchers pv
		  left join public.inv_partners p on p.id = pv.partner_id
		  where pv.tenant_id = $1 and pv.deleted_at is null
		    and pv.payment_method in ('check', 'bank_transfer')
		    and not exists (
		      select 1 from public.fin_bank_statement_lines bsl
		      where bsl.tenant_id = pv.tenant_id
		        and bsl.matched_payment_type = 'payment_voucher'
		        and bsl.matched_payment_id = pv.id
		    )
		) unmatched`

		args := []any{tu.TenantID}
		n := 2
		if bankAccountID > 0 {
			base = fmt.Sprintf(`
			select payment_type, payment_id, payment_date, document_no, partner_name, payment_method,
			  coalesce(reference_no, ''), amount
			from (
			  select 'official_receipt'::text as payment_type, r.id as payment_id, r.receipt_date as payment_date,
			    r.receipt_no as document_no, coalesce(p.company_name, '') as partner_name,
			    r.payment_method, r.reference_no, r.amount_total::float8 as amount
			  from public.fin_official_receipts r
			  left join public.inv_partners p on p.id = r.partner_id
			  where r.tenant_id = $1 and r.deleted_at is null
			    and r.payment_method in ('check', 'bank_transfer')
			    and not exists (
			      select 1 from public.fin_bank_statement_lines bsl
			      where bsl.tenant_id = r.tenant_id and bsl.bank_account_id = $%d
			        and bsl.matched_payment_type = 'official_receipt'
			        and bsl.matched_payment_id = r.id
			    )
			  union all
			  select 'payment_voucher'::text, pv.id, pv.payment_date,
			    pv.payment_no, coalesce(p.company_name, ''),
			    pv.payment_method, pv.reference_no, pv.amount_total::float8
			  from public.fin_payment_vouchers pv
			  left join public.inv_partners p on p.id = pv.partner_id
			  where pv.tenant_id = $1 and pv.deleted_at is null
			    and pv.payment_method in ('check', 'bank_transfer')
			    and not exists (
			      select 1 from public.fin_bank_statement_lines bsl
			      where bsl.tenant_id = pv.tenant_id and bsl.bank_account_id = $%d
			        and bsl.matched_payment_type = 'payment_voucher'
			        and bsl.matched_payment_id = pv.id
			    )
			) unmatched`, n, n)
			args = append(args, bankAccountID)
			n++
		}

		countQ := fmt.Sprintf("select count(*) from (%s) sub", base)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count unmatched payments.", "ERR_INTERNAL")
			return
		}

		args = append(args, p.PageSize, offset)
		q := fmt.Sprintf("select * from (%s) sub order by %s %s limit $%d offset $%d", base, p.Sort, orderSQL(p.Order), n, n+1)
		rows, err := pool.Query(r.Context(), q, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load unmatched payments.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []unmatchedPaymentRow
		for rows.Next() {
			var row unmatchedPaymentRow
			var paymentDate any
			if err := rows.Scan(
				&row.PaymentType, &row.PaymentID, &paymentDate, &row.DocumentNo,
				&row.PartnerName, &row.PaymentMethod, &row.ReferenceNo, &row.Amount,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read unmatched payments.", "ERR_INTERNAL")
				return
			}
			row.PaymentDate = fmt.Sprint(paymentDate)
			if len(row.PaymentDate) >= 10 {
				row.PaymentDate = row.PaymentDate[:10]
			}
			out = append(out, row)
		}
		if out == nil {
			out = []unmatchedPaymentRow{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listBankStatementLines(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		p := httputil.ParseListParams(r, "statement_date", map[string]string{"amount": "amount"})
		offset := httputil.Offset(p)

		where := "bsl.tenant_id = $1"
		args := []any{tu.TenantID}
		n := 2
		if v := strings.TrimSpace(r.URL.Query().Get("bank_account_id")); v != "" {
			id, err := strconv.ParseInt(v, 10, 64)
			if err != nil || id <= 0 {
				response.Validation(w, map[string]string{"bank_account_id": "Invalid bank account id."})
				return
			}
			where += fmt.Sprintf(" and bsl.bank_account_id = $%d", n)
			args = append(args, id)
			n++
		}
		if r.URL.Query().Get("unmatched_only") == "true" {
			where += " and bsl.matched_payment_id is null"
		}

		countQ := fmt.Sprintf(`select count(*) from public.fin_bank_statement_lines bsl where %s`, where)
		var total int64
		if err := pool.QueryRow(r.Context(), countQ, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count statement lines.", "ERR_INTERNAL")
			return
		}

		listQ := fmt.Sprintf(`
			select bsl.id, bsl.bank_account_id, bsl.statement_date,
			  coalesce(bsl.reference_no, ''), coalesce(bsl.description, ''),
			  bsl.amount::float8, (bsl.matched_payment_id is not null)
			from public.fin_bank_statement_lines bsl
			where %s
			order by bsl.statement_date desc, bsl.id desc
			limit $%d offset $%d`, where, n, n+1)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), listQ, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load statement lines.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()

		var out []bankStatementPlaceholder
		for rows.Next() {
			var row bankStatementPlaceholder
			var stmtDate any
			if err := rows.Scan(
				&row.ID, &row.BankAccountID, &stmtDate,
				&row.ReferenceNo, &row.Description, &row.Amount, &row.IsMatched,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read statement lines.", "ERR_INTERNAL")
				return
			}
			row.StatementDate = fmt.Sprint(stmtDate)
			if len(row.StatementDate) >= 10 {
				row.StatementDate = row.StatementDate[:10]
			}
			out = append(out, row)
		}
		if out == nil {
			out = []bankStatementPlaceholder{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

type bankReconciliationMatchBody struct {
	StatementLineID int64  `json:"statement_line_id"`
	PaymentType     string `json:"payment_type"`
	PaymentID       int64  `json:"payment_id"`
}

func matchBankStatementLine(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bankReconciliationMatchBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		body.PaymentType = strings.TrimSpace(strings.ToLower(body.PaymentType))
		if body.StatementLineID <= 0 {
			response.Validation(w, map[string]string{"statement_line_id": "Statement line id is required."})
			return
		}
		if body.PaymentID <= 0 {
			response.Validation(w, map[string]string{"payment_id": "Payment id is required."})
			return
		}
		if body.PaymentType != "official_receipt" && body.PaymentType != "payment_voucher" {
			response.Validation(w, map[string]string{"payment_type": "Payment type must be official_receipt or payment_voucher."})
			return
		}

		var lineExists bool
		err := pool.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.fin_bank_statement_lines
			  where id = $1 and tenant_id = $2 and matched_payment_id is null
			)`, body.StatementLineID, tu.TenantID).Scan(&lineExists)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate statement line.", "ERR_INTERNAL")
			return
		}
		if !lineExists {
			response.Validation(w, map[string]string{"statement_line_id": "Statement line is not available for matching."})
			return
		}

		var paymentExists bool
		if body.PaymentType == "official_receipt" {
			err = pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.fin_official_receipts
				  where id = $1 and tenant_id = $2 and deleted_at is null
				)`, body.PaymentID, tu.TenantID).Scan(&paymentExists)
		} else {
			err = pool.QueryRow(r.Context(), `
				select exists(
				  select 1 from public.fin_payment_vouchers
				  where id = $1 and tenant_id = $2 and deleted_at is null
				)`, body.PaymentID, tu.TenantID).Scan(&paymentExists)
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate payment.", "ERR_INTERNAL")
			return
		}
		if !paymentExists {
			response.Validation(w, map[string]string{"payment_id": "Payment record not found."})
			return
		}

		var duplicateMatch bool
		err = pool.QueryRow(r.Context(), `
			select exists(
			  select 1 from public.fin_bank_statement_lines
			  where tenant_id = $1 and matched_payment_type = $2 and matched_payment_id = $3
			)`, tu.TenantID, body.PaymentType, body.PaymentID).Scan(&duplicateMatch)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to validate payment match state.", "ERR_INTERNAL")
			return
		}
		if duplicateMatch {
			response.Validation(w, map[string]string{"payment_id": "Payment is already matched to another statement line."})
			return
		}

		tag, err := pool.Exec(r.Context(), `
			update public.fin_bank_statement_lines
			set matched_payment_type = $1,
			  matched_payment_id = $2,
			  updated_at = now()
			where id = $3 and tenant_id = $4 and matched_payment_id is null`,
			body.PaymentType, body.PaymentID, body.StatementLineID, tu.TenantID,
		)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save match.", "ERR_INTERNAL")
			return
		}
		if tag.RowsAffected() == 0 {
			response.Validation(w, map[string]string{"statement_line_id": "Statement line is not available for matching."})
			return
		}
		response.OK(w, map[string]any{
			"statement_line_id": body.StatementLineID,
			"payment_type":      body.PaymentType,
			"payment_id":        body.PaymentID,
		}, "Matched.")
	}
}
