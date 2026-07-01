package finance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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

func registerBankReconciliationRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/bank-reconciliation/unmatched", listUnmatchedPayments(pool))
	r.Get("/bank-reconciliation/statement-lines", listBankStatementLines(pool))
	r.Post("/bank-reconciliation/match", matchBankStatementLine(pool))
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
