package finance

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bankRegisterRow struct {
	TxnDate     string  `json:"txn_date"`
	TxnType     string  `json:"txn_type"`
	DocumentNo  string  `json:"document_no"`
	Description string  `json:"description"`
	MoneyIn     float64 `json:"money_in"`
	MoneyOut    float64 `json:"money_out"`
	Balance     float64 `json:"balance"`
	RefType     string  `json:"ref_type,omitempty"`
	RefID       *int64  `json:"ref_id,omitempty"`
}

type bankTransferBody struct {
	TransferDate       string  `json:"transfer_date"`
	FromBankAccountID  int64   `json:"from_bank_account_id"`
	ToBankAccountID    int64   `json:"to_bank_account_id"`
	Amount             float64 `json:"amount"`
	ReferenceNo        string  `json:"reference_no"`
	Notes              string  `json:"notes"`
}

func registerBankRegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/bank-accounts/{id}", getBankAccount(pool))
	r.Get("/bank-accounts/{id}/register", listBankRegister(pool))
	r.Post("/bank-transfers", createBankTransfer(pool))
}

func getBankAccount(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		row, err := lookupBankAccount(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Bank account not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, row, "OK")
	}
}

func listBankRegister(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		acct, err := lookupBankAccount(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Bank account not found.", "ERR_NOT_FOUND")
			return
		}

		dateFrom := strings.TrimSpace(r.URL.Query().Get("date_from"))
		dateTo := strings.TrimSpace(r.URL.Query().Get("date_to"))

		type rawTxn struct {
			TxnDate     time.Time
			TxnType     string
			DocumentNo  string
			Description string
			MoneyIn     float64
			MoneyOut    float64
			RefType     string
			RefID       *int64
		}
		var txns []rawTxn

		openDate := time.Now()
		if acct.OpeningBalanceDate != nil && *acct.OpeningBalanceDate != "" {
			if d, e := time.Parse("2006-01-02", *acct.OpeningBalanceDate); e == nil {
				openDate = d
			}
		}
		includeOpening := true
		if dateFrom != "" {
			if df, e := time.Parse("2006-01-02", dateFrom); e == nil && openDate.Before(df) {
				includeOpening = false
			}
		}
		if includeOpening && (acct.OpeningBalance != 0 || acct.OpeningBalanceDate != nil) {
			moneyIn, moneyOut := 0.0, 0.0
			if acct.OpeningBalance >= 0 {
				moneyIn = acct.OpeningBalance
			} else {
				moneyOut = -acct.OpeningBalance
			}
			txns = append(txns, rawTxn{
				TxnDate:     openDate,
				TxnType:     "opening_balance",
				DocumentNo:  "OPEN",
				Description: "Opening balance",
				MoneyIn:     moneyIn,
				MoneyOut:    moneyOut,
			})
		}

		// Deposits from official receipt journal lines
		depQ := `
			select r.receipt_date, r.receipt_no,
			  coalesce(nullif(jl.remark, ''), coalesce(p.company_name, 'Receipt')),
			  (jl.amount - coalesce(jl.fees, 0))::float8, r.id
			from public.fin_receipt_journal_lines jl
			join public.fin_official_receipts r on r.id = jl.official_receipt_id
			left join public.inv_partners p on p.id = r.partner_id
			where r.tenant_id = $1 and r.deleted_at is null and jl.bank_account_id = $2`
		depArgs := []any{tu.TenantID, id}
		n := 3
		if dateFrom != "" {
			depQ += fmt.Sprintf(" and r.receipt_date >= $%d::date", n)
			depArgs = append(depArgs, dateFrom)
			n++
		}
		if dateTo != "" {
			depQ += fmt.Sprintf(" and r.receipt_date <= $%d::date", n)
			depArgs = append(depArgs, dateTo)
			n++
		}
		rows, err := pool.Query(r.Context(), depQ, depArgs...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load deposits.", "ERR_INTERNAL")
			return
		}
		for rows.Next() {
			var t rawTxn
			var refID int64
			if err := rows.Scan(&t.TxnDate, &t.DocumentNo, &t.Description, &t.MoneyIn, &refID); err != nil {
				rows.Close()
				response.Err(w, http.StatusInternalServerError, "Failed to read deposits.", "ERR_INTERNAL")
				return
			}
			t.TxnType = "deposit"
			t.RefType = "official_receipt"
			t.RefID = &refID
			txns = append(txns, t)
		}
		rows.Close()

		// Withdrawals from payment vouchers linked via check register (incl. expense payments)
		wdQ := `
			select coalesce(c.check_date, pv.payment_date), coalesce(nullif(c.check_no, ''), pv.payment_no),
			  coalesce(nullif(c.payee_name, ''), coalesce(nullif(e.vendor_name, ''), p.company_name, 'Payment')),
			  coalesce(c.amount, pv.amount_total)::float8,
			  case when e.id is not null then e.id else pv.id end,
			  case when e.id is not null then 'expense' else 'payment_voucher' end
			from public.fin_checks c
			join public.fin_payment_vouchers pv on pv.id = c.payment_voucher_id and pv.tenant_id = c.tenant_id and pv.deleted_at is null
			left join public.fin_expenses e on e.payment_voucher_id = pv.id and e.tenant_id = pv.tenant_id and e.deleted_at is null and e.payment_status = 'paid'
			left join public.inv_partners p on p.id = pv.partner_id
			where c.tenant_id = $1 and c.bank_account_id = $2`
		wdArgs := []any{tu.TenantID, id}
		n = 3
		if dateFrom != "" {
			wdQ += fmt.Sprintf(" and coalesce(c.check_date, pv.payment_date) >= $%d::date", n)
			wdArgs = append(wdArgs, dateFrom)
			n++
		}
		if dateTo != "" {
			wdQ += fmt.Sprintf(" and coalesce(c.check_date, pv.payment_date) <= $%d::date", n)
			wdArgs = append(wdArgs, dateTo)
			n++
		}
		rows, err = pool.Query(r.Context(), wdQ, wdArgs...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load withdrawals.", "ERR_INTERNAL")
			return
		}
		for rows.Next() {
			var t rawTxn
			var refID int64
			if err := rows.Scan(&t.TxnDate, &t.DocumentNo, &t.Description, &t.MoneyOut, &refID, &t.RefType); err != nil {
				rows.Close()
				response.Err(w, http.StatusInternalServerError, "Failed to read withdrawals.", "ERR_INTERNAL")
				return
			}
			t.TxnType = "withdrawal"
			t.RefID = &refID
			txns = append(txns, t)
		}
		rows.Close()

		// Transfers out
		trOutQ := `
			select t.transfer_date, coalesce(nullif(t.reference_no, ''), 'TRF-' || t.id::text),
			  'Transfer to ' || b.bank_account_name, t.amount::float8, t.id
			from public.fin_bank_transfers t
			join public.fin_bank_accounts b on b.id = t.to_bank_account_id
			where t.tenant_id = $1 and t.deleted_at is null and t.from_bank_account_id = $2`
		trArgs := []any{tu.TenantID, id}
		n = 3
		if dateFrom != "" {
			trOutQ += fmt.Sprintf(" and t.transfer_date >= $%d::date", n)
			trArgs = append(trArgs, dateFrom)
			n++
		}
		if dateTo != "" {
			trOutQ += fmt.Sprintf(" and t.transfer_date <= $%d::date", n)
			trArgs = append(trArgs, dateTo)
			n++
		}
		rows, err = pool.Query(r.Context(), trOutQ, trArgs...)
		if err == nil {
			for rows.Next() {
				var t rawTxn
				var refID int64
				if err := rows.Scan(&t.TxnDate, &t.DocumentNo, &t.Description, &t.MoneyOut, &refID); err != nil {
					break
				}
				t.TxnType = "transfer_out"
				t.RefType = "bank_transfer"
				t.RefID = &refID
				txns = append(txns, t)
			}
			rows.Close()
		}

		// Transfers in
		trInQ := `
			select t.transfer_date, coalesce(nullif(t.reference_no, ''), 'TRF-' || t.id::text),
			  'Transfer from ' || b.bank_account_name, t.amount::float8, t.id
			from public.fin_bank_transfers t
			join public.fin_bank_accounts b on b.id = t.from_bank_account_id
			where t.tenant_id = $1 and t.deleted_at is null and t.to_bank_account_id = $2`
		trInArgs := []any{tu.TenantID, id}
		n = 3
		if dateFrom != "" {
			trInQ += fmt.Sprintf(" and t.transfer_date >= $%d::date", n)
			trInArgs = append(trInArgs, dateFrom)
			n++
		}
		if dateTo != "" {
			trInQ += fmt.Sprintf(" and t.transfer_date <= $%d::date", n)
			trInArgs = append(trInArgs, dateTo)
			n++
		}
		rows, err = pool.Query(r.Context(), trInQ, trInArgs...)
		if err == nil {
			for rows.Next() {
				var t rawTxn
				var refID int64
				if err := rows.Scan(&t.TxnDate, &t.DocumentNo, &t.Description, &t.MoneyIn, &refID); err != nil {
					break
				}
				t.TxnType = "transfer_in"
				t.RefType = "bank_transfer"
				t.RefID = &refID
				txns = append(txns, t)
			}
			rows.Close()
		}

		// Sort ascending by date for running balance
		sort.SliceStable(txns, func(i, j int) bool {
			if txns[i].TxnDate.Equal(txns[j].TxnDate) {
				return txns[i].TxnType < txns[j].TxnType
			}
			return txns[i].TxnDate.Before(txns[j].TxnDate)
		})

		bal := 0.0
		out := make([]bankRegisterRow, 0, len(txns))
		for _, t := range txns {
			bal += t.MoneyIn - t.MoneyOut
			out = append(out, bankRegisterRow{
				TxnDate:     t.TxnDate.Format("2006-01-02"),
				TxnType:     t.TxnType,
				DocumentNo:  t.DocumentNo,
				Description: t.Description,
				MoneyIn:     t.MoneyIn,
				MoneyOut:    t.MoneyOut,
				Balance:     bal,
				RefType:     t.RefType,
				RefID:       t.RefID,
			})
		}
		// Newest first for display
		for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
			out[i], out[j] = out[j], out[i]
		}

		response.OK(w, map[string]any{
			"account":          acct,
			"rows":             out,
			"closing_balance":  bal,
			"transaction_count": len(out),
		}, "OK")
	}
}

func createBankTransfer(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bankTransferBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		errs := map[string]string{}
		if body.FromBankAccountID <= 0 {
			errs["from_bank_account_id"] = "From account is required."
		}
		if body.ToBankAccountID <= 0 {
			errs["to_bank_account_id"] = "To account is required."
		}
		if body.FromBankAccountID > 0 && body.FromBankAccountID == body.ToBankAccountID {
			errs["to_bank_account_id"] = "Choose a different destination account."
		}
		if body.Amount <= 0 {
			errs["amount"] = "Amount must be greater than zero."
		}
		dateStr := strings.TrimSpace(body.TransferDate)
		if dateStr == "" {
			dateStr = time.Now().Format("2006-01-02")
		}
		transferDate, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			errs["transfer_date"] = "Invalid date. Use YYYY-MM-DD."
		}
		if len(errs) > 0 {
			response.Validation(w, errs)
			return
		}

		from, err := lookupBankAccount(r.Context(), pool, tu.TenantID, body.FromBankAccountID)
		if err != nil {
			response.Validation(w, map[string]string{"from_bank_account_id": "From account not found."})
			return
		}
		to, err := lookupBankAccount(r.Context(), pool, tu.TenantID, body.ToBankAccountID)
		if err != nil {
			response.Validation(w, map[string]string{"to_bank_account_id": "To account not found."})
			return
		}
		if !from.IsActive || !to.IsActive {
			response.Validation(w, map[string]string{"from_bank_account_id": "Both accounts must be active."})
			return
		}

		var id int64
		err = pool.QueryRow(r.Context(), `
			insert into public.fin_bank_transfers (
			  tenant_id, transfer_date, from_bank_account_id, to_bank_account_id,
			  amount, reference_no, notes, created_by_user_id
			) values ($1,$2::date,$3,$4,$5,$6,$7,$8)
			returning id`,
			tu.TenantID, transferDate, body.FromBankAccountID, body.ToBankAccountID,
			body.Amount, strings.TrimSpace(body.ReferenceNo), strings.TrimSpace(body.Notes), tu.AppUserID,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create transfer.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_transfer.create", "fin_bank_transfer", &id, nil, body)
		response.OK(w, map[string]any{
			"id":                     id,
			"from_bank_account_id":   body.FromBankAccountID,
			"to_bank_account_id":     body.ToBankAccountID,
			"from_bank_account_name": from.BankAccountName,
			"to_bank_account_name":   to.BankAccountName,
			"amount":                 body.Amount,
			"transfer_date":          transferDate.Format("2006-01-02"),
		}, "Transfer recorded.")
	}
}
