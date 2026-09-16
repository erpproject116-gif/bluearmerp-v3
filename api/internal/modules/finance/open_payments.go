package finance

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

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// OpenReceivable is an open AR document for the New Receivable Payment worklist.
type OpenReceivable struct {
	SalesID         int64   `json:"sales_id"`
	SalesNo         string  `json:"sales_no"`
	DateNoDisplay   string  `json:"date_no_display"`
	OccurrenceDate  string  `json:"occurrence_date"`
	DueDate         *string `json:"due_date,omitempty"`
	Balance         float64 `json:"balance"`
	PartnerID       int64   `json:"partner_id"`
	PartnerCode     string  `json:"partner_code"`
	PartnerName     string  `json:"partner_name"`
	CurrencyID      int64   `json:"currency_id,omitempty"`
	CurrencyCode    string  `json:"currency_code,omitempty"`
	AccountName     string  `json:"account_name"`
	LocationName    string  `json:"location_name,omitempty"`
	ProjectName     *string `json:"project_name,omitempty"`
	DepartmentName  *string `json:"department_name,omitempty"`
	Remark          string  `json:"remark,omitempty"`
}

// OpenPayable is an open AP document for the New Payable Payment worklist.
type OpenPayable struct {
	DocType           string  `json:"doc_type"` // supplier_invoice | expense
	SupplierInvoiceID int64   `json:"supplier_invoice_id,omitempty"`
	ExpenseID         int64   `json:"expense_id,omitempty"`
	InvoiceNo         string  `json:"invoice_no"`
	DateNoDisplay     string  `json:"date_no_display"`
	OccurrenceDate    string  `json:"occurrence_date"`
	DueDate           *string `json:"due_date,omitempty"`
	Balance           float64 `json:"balance"`
	PartnerID         int64   `json:"partner_id"`
	PartnerCode       string  `json:"partner_code"`
	PartnerName       string  `json:"partner_name"`
	CurrencyID        int64   `json:"currency_id,omitempty"`
	CurrencyCode      string  `json:"currency_code,omitempty"`
	AccountName       string  `json:"account_name"`
	LocationName      string  `json:"location_name,omitempty"`
	ProjectName       *string `json:"project_name,omitempty"`
	DepartmentName    *string `json:"department_name,omitempty"`
	Remark            string  `json:"remark,omitempty"`
}

type openPaymentApplyApp struct {
	DocID          int64   `json:"doc_id"`
	DocType        string  `json:"doc_type"` // supplier_invoice | expense (AP)
	SalesID        int64   `json:"sales_id"`
	InvoiceID      int64   `json:"supplier_invoice_id"`
	ExpenseID      int64   `json:"expense_id"`
	AppliedAmount  float64 `json:"applied_amount"`
	DiscountAmount float64 `json:"discount_amount"`
}

type openReceivableApplyBody struct {
	PaymentDate   string                 `json:"payment_date"`
	PaymentMethod string                 `json:"payment_method"`
	BankAccountID *int64                 `json:"bank_account_id"`
	ReferenceNo   *string                `json:"reference_no"`
	Notes         *string                `json:"notes"`
	Remark        *string                `json:"remark"`
	CurrencyID    *int64                 `json:"currency_id"`
	Applications  []openPaymentApplyApp  `json:"applications"`
	AllowMultiPartner bool               `json:"allow_multi_partner"`
}

type openPayableApplyBody struct {
	PaymentDate       string                `json:"payment_date"`
	PaymentMethod     string                `json:"payment_method"`
	BankAccountID     *int64                `json:"bank_account_id"`
	ReferenceNo       *string               `json:"reference_no"`
	Notes             *string               `json:"notes"`
	Remark            *string               `json:"remark"`
	CurrencyID        *int64                `json:"currency_id"`
	Applications      []openPaymentApplyApp `json:"applications"`
	AllowMultiPartner bool                  `json:"allow_multi_partner"`
}

func registerOpenPaymentRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/receivables/open", listOpenReceivables(pool))
	r.Get("/payables/open", listOpenPayables(pool))
	r.With(auth.RequirePermission("finance.official_receipts_new", auth.AccessWrite)).Post("/receivables/apply", applyOpenReceivables(pool))
	r.With(auth.RequirePermission("finance.payment_vouchers_new", auth.AccessWrite)).Post("/payables/apply", applyOpenPayables(pool))
	r.Get("/receivables/{salesId}/transactions", listReceivableTransactions(pool))
	r.Get("/payables/{invoiceId}/transactions", listPayableTransactions(pool))
}

// saleAppliedOpenLateral builds the full outstanding applied lateral (OR+CN+retainer),
// optionally excluding one receipt from the OR sum (for journal edit modal).
func saleAppliedOpenLateral(excludeReceiptParam string) string {
	orExclude := ""
	if excludeReceiptParam != "" {
		orExclude = " and r.id <> " + excludeReceiptParam
	}
	return fmt.Sprintf(`
		left join lateral (
		  select (
		    coalesce((
		      select sum(a.applied_amount + coalesce(a.discount_amount, 0))
		      from public.fin_receipt_applications a
		      join public.fin_official_receipts r on r.id = a.official_receipt_id
		      where a.sales_id = s.id and r.deleted_at is null%s
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_credit_note_applications a
		      join public.fin_credit_notes c on c.id = a.credit_note_id
		      where a.sales_id = s.id and c.deleted_at is null
		    ), 0)
		    + coalesce((
		      select sum(a.applied_amount)
		      from public.fin_retainer_applications a
		      join public.fin_retainer_invoices ri on ri.id = a.retainer_id
		      where a.sales_id = s.id and ri.deleted_at is null
		    ), 0)
		  )::float8 as received
		) recv on true`, orExclude)
}

func listOpenReceivables(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		partnerID, _ := optionalInt64Query(r, "partner_id")
		excludeReceiptID, _ := optionalInt64Query(r, "exclude_receipt_id")
		qText := strings.TrimSpace(r.URL.Query().Get("q"))
		dueFrom := strings.TrimSpace(r.URL.Query().Get("due_from"))
		dueTo := strings.TrimSpace(r.URL.Query().Get("due_to"))
		p := httputil.ParseListParams(r, "occurrence_date", map[string]string{
			"occurrence_date": "s.order_date",
			"due_date":        "s.due_date",
			"balance":         "balance",
			"partner_name":    "p.company_name",
			"item_code":       "s.sales_no",
		})

		args := []any{tu.TenantID}
		argN := 2
		excludeParam := ""
		if excludeReceiptID != nil {
			excludeParam = fmt.Sprintf("$%d", argN)
			args = append(args, *excludeReceiptID)
			argN++
		}

		sql := fmt.Sprintf(`
			select s.id, s.sales_no, s.order_date, s.date_seq, s.due_date,
			  (s.grand_total - coalesce(recv.received, 0))::float8 as balance,
			  s.partner_id, coalesce(p.partner_code, ''), coalesce(p.company_name, ''),
			  coalesce(s.currency_id, 0), coalesce(cur.currency_code, ''),
			  coalesce(loc.location_name, ''), proj.project_name, dept.department_name,
			  coalesce(s.notes, '')
			from public.sa_sales s
			join public.inv_partners p on p.id = s.partner_id and p.tenant_id = s.tenant_id
			left join public.quo_currencies cur on cur.id = s.currency_id
			left join public.inv_locations loc on loc.id = s.location_id
			left join public.inv_projects proj on proj.id = s.project_id
			left join public.inv_departments dept on dept.id = s.department_id
			%s
			where s.tenant_id = $1 and s.deleted_at is null
			  and s.progress_status = 'completed'
			  and (s.grand_total - coalesce(recv.received, 0)) > 0.0001`,
			saleAppliedOpenLateral(excludeParam))

		if partnerID != nil {
			sql += fmt.Sprintf(` and s.partner_id = $%d`, argN)
			args = append(args, *partnerID)
			argN++
		}
		if qText != "" {
			sql += fmt.Sprintf(` and (s.sales_no ilike $%d or p.company_name ilike $%d or p.partner_code ilike $%d)`, argN, argN, argN)
			args = append(args, "%"+qText+"%")
			argN++
		}
		if dueFrom != "" {
			if _, err := time.Parse("2006-01-02", dueFrom); err == nil {
				sql += fmt.Sprintf(` and coalesce(s.due_date, s.order_date) >= $%d::date`, argN)
				args = append(args, dueFrom)
				argN++
			}
		}
		if dueTo != "" {
			if _, err := time.Parse("2006-01-02", dueTo); err == nil {
				sql += fmt.Sprintf(` and coalesce(s.due_date, s.order_date) <= $%d::date`, argN)
				args = append(args, dueTo)
				argN++
			}
		}

		countSQL := "select count(*) from (" + sql + ") c"
		var total int64
		if err := pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count receivables.", "ERR_INTERNAL")
			return
		}

		orderCol := "s.order_date"
		if col, ok := map[string]string{
			"occurrence_date": "s.order_date",
			"s.order_date":     "s.order_date",
			"due_date":        "s.due_date",
			"s.due_date":      "s.due_date",
			"balance":         "balance",
			"partner_name":    "p.company_name",
			"p.company_name":  "p.company_name",
			"item_code":       "s.sales_no",
			"s.sales_no":      "s.sales_no",
		}[p.Sort]; ok {
			orderCol = col
		}
		orderDir := "desc"
		if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("order")), "asc") {
			orderDir = "asc"
		}
		offset := httputil.Offset(p)
		sql += fmt.Sprintf(
			` order by %s %s, s.date_seq %s, s.id %s limit $%d offset $%d`,
			orderCol, orderDir, orderDir, orderDir, argN, argN+1,
		)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), sql, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load receivables.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []OpenReceivable
		for rows.Next() {
			var row OpenReceivable
			var orderDate time.Time
			var dateSeq int
			var dueDate *time.Time
			if err := rows.Scan(
				&row.SalesID, &row.SalesNo, &orderDate, &dateSeq, &dueDate, &row.Balance,
				&row.PartnerID, &row.PartnerCode, &row.PartnerName,
				&row.CurrencyID, &row.CurrencyCode,
				&row.LocationName, &row.ProjectName, &row.DepartmentName, &row.Remark,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read receivables.", "ERR_INTERNAL")
				return
			}
			row.DateNoDisplay = formatDateNoDisplay(orderDate, dateSeq)
			row.OccurrenceDate = dateToStr(orderDate)
			row.AccountName = "Accounts Receivable"
			if dueDate != nil {
				d := dateToStr(*dueDate)
				row.DueDate = &d
			}
			out = append(out, row)
		}
		if out == nil {
			out = []OpenReceivable{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func listOpenPayables(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		partnerID, _ := optionalInt64Query(r, "partner_id")
		qText := strings.TrimSpace(r.URL.Query().Get("q"))
		dueFrom := strings.TrimSpace(r.URL.Query().Get("due_from"))
		dueTo := strings.TrimSpace(r.URL.Query().Get("due_to"))
		p := httputil.ParseListParams(r, "occurrence_date", map[string]string{
			"occurrence_date": "occ_date",
			"due_date":        "due_date",
			"balance":         "balance",
			"partner_name":    "partner_name",
		})

		args := []any{tu.TenantID}
		argN := 2
		siWhere := `si.tenant_id = $1 and si.deleted_at is null
			  and si.partner_id is not null
			  and (si.grand_total - coalesce(paid.paid, 0)) > 0.0001`
		exWhere := `e.tenant_id = $1 and e.deleted_at is null and e.payment_status = 'unpaid'
			  and e.partner_id is not null and (e.amount + e.tax_amount) > 0.0001`
		if partnerID != nil {
			siWhere += fmt.Sprintf(` and si.partner_id = $%d`, argN)
			exWhere += fmt.Sprintf(` and e.partner_id = $%d`, argN)
			args = append(args, *partnerID)
			argN++
		}
		if qText != "" {
			siWhere += fmt.Sprintf(` and (
				coalesce(si.invoice_no,'') ilike $%d
				or coalesce(si.vendor_invoice_no,'') ilike $%d
				or coalesce(si.reference,'') ilike $%d
				or coalesce(si.notes,'') ilike $%d
				or coalesce(p.company_name,'') ilike $%d
				or coalesce(p.partner_code,'') ilike $%d
				or (to_char(si.invoice_date, 'YYYY-MM-DD') || '-' || lpad(coalesce(si.date_seq, 1)::text, 3, '0')) ilike $%d
			)`, argN, argN, argN, argN, argN, argN, argN)
			exWhere += fmt.Sprintf(` and (
				e.expense_no ilike $%d
				or coalesce(p.company_name,e.vendor_name) ilike $%d
				or coalesce(p.partner_code,'') ilike $%d
				or coalesce(e.description,'') ilike $%d
			)`, argN, argN, argN, argN)
			args = append(args, "%"+qText+"%")
			argN++
		}
		if dueFrom != "" {
			if _, err := time.Parse("2006-01-02", dueFrom); err == nil {
				// Null due_date falls back to invoice/expense date so filtered lists still show new purchases.
				siWhere += fmt.Sprintf(` and coalesce(si.due_date, si.invoice_date) >= $%d::date`, argN)
				exWhere += fmt.Sprintf(` and e.expense_date >= $%d::date`, argN)
				args = append(args, dueFrom)
				argN++
			}
		}
		if dueTo != "" {
			if _, err := time.Parse("2006-01-02", dueTo); err == nil {
				siWhere += fmt.Sprintf(` and coalesce(si.due_date, si.invoice_date) <= $%d::date`, argN)
				exWhere += fmt.Sprintf(` and e.expense_date <= $%d::date`, argN)
				args = append(args, dueTo)
				argN++
			}
		}

		sql := fmt.Sprintf(`
			select doc_type, doc_id, doc_no, occ_date, date_seq, due_date, balance,
			  partner_id, partner_code, partner_name, currency_id, currency_code,
			  location_name, project_name, department_name, remark
			from (
			  select 'supplier_invoice' as doc_type, si.id as doc_id, coalesce(si.invoice_no, '') as doc_no,
			    si.invoice_date as occ_date, coalesce(si.date_seq, 1) as date_seq, si.due_date,
			    (si.grand_total - coalesce(paid.paid, 0))::float8 as balance,
			    si.partner_id, coalesce(p.partner_code, '') as partner_code, coalesce(p.company_name, '') as partner_name,
			    coalesce(si.currency_id, 0) as currency_id, coalesce(cur.currency_code, '') as currency_code,
			    coalesce(loc.location_name, '') as location_name,
			    coalesce(si.project_name, proj.project_name) as project_name, null::text as department_name,
			    coalesce(si.notes, '') as remark
			  from public.fin_supplier_invoices si
			  left join public.inv_partners p on p.id = si.partner_id and p.tenant_id = si.tenant_id
			  left join public.quo_currencies cur on cur.id = si.currency_id
			  left join public.inv_locations loc on loc.id = si.location_id
			  left join public.inv_projects proj on proj.id = si.project_id
			  %s
			  where %s
			  union all
			  select 'expense', e.id, e.expense_no, e.expense_date, coalesce(e.date_seq, 1), e.expense_date,
			    (e.amount + e.tax_amount)::float8, e.partner_id, coalesce(p.partner_code, ''),
			    coalesce(nullif(p.company_name, ''), e.vendor_name),
			    0, '', '', null::text, null::text, coalesce(e.description, '')
			  from public.fin_expenses e
			  left join public.inv_partners p on p.id = e.partner_id and p.tenant_id = e.tenant_id
			  where %s
			) open_ap`, supplierInvoiceAppliedLateralSQLAsOf("si", ""), siWhere, exWhere)

		countSQL := "select count(*) from (" + sql + ") c"
		var total int64
		if err := pool.QueryRow(r.Context(), countSQL, args...).Scan(&total); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to count payables.", "ERR_INTERNAL")
			return
		}

		orderCol := "occ_date"
		if col, ok := map[string]string{
			"occurrence_date": "occ_date",
			"occ_date":        "occ_date",
			"due_date":        "due_date",
			"balance":         "balance",
			"partner_name":    "partner_name",
		}[p.Sort]; ok {
			orderCol = col
		}
		// Newest occurrence first unless the client explicitly asks for asc.
		orderDir := "desc"
		if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("order")), "asc") {
			orderDir = "asc"
		}
		offset := httputil.Offset(p)
		sql += fmt.Sprintf(
			` order by %s %s, date_seq %s, doc_id %s limit $%d offset $%d`,
			orderCol, orderDir, orderDir, orderDir, argN, argN+1,
		)
		args = append(args, p.PageSize, offset)

		rows, err := pool.Query(r.Context(), sql, args...)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load payables.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []OpenPayable
		for rows.Next() {
			var row OpenPayable
			var docType string
			var docID int64
			var invDate time.Time
			var dateSeq int
			var dueDate *time.Time
			if err := rows.Scan(
				&docType, &docID, &row.InvoiceNo, &invDate, &dateSeq, &dueDate, &row.Balance,
				&row.PartnerID, &row.PartnerCode, &row.PartnerName,
				&row.CurrencyID, &row.CurrencyCode,
				&row.LocationName, &row.ProjectName, &row.DepartmentName, &row.Remark,
			); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read payables.", "ERR_INTERNAL")
				return
			}
			row.DocType = docType
			if docType == "expense" {
				row.ExpenseID = docID
				row.AccountName = "Accounts Payable (Expense)"
			} else {
				row.SupplierInvoiceID = docID
				row.AccountName = "Accounts Payable"
			}
			row.DateNoDisplay = formatDateNoDisplay(invDate, dateSeq)
			row.OccurrenceDate = dateToStr(invDate)
			if dueDate != nil {
				d := dateToStr(*dueDate)
				row.DueDate = &d
			}
			out = append(out, row)
		}
		if out == nil {
			out = []OpenPayable{}
		}
		response.OKList(w, out, p.Page, p.PageSize, total)
	}
}

func applyOpenReceivables(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body openReceivableApplyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		apps := normalizeARApps(body.Applications)
		if len(apps) == 0 {
			response.Validation(w, map[string]string{"applications": "Add at least one decrease amount."})
			return
		}
		groups, errs := groupARAppsByPartner(r.Context(), pool, tu.TenantID, apps)
		if errs != nil {
			response.ValidationSmart(w, errs)
			return
		}
		if len(groups) > 1 && !body.AllowMultiPartner {
			response.Validation(w, map[string]string{"applications": "Selected rows must belong to one customer. Clear other customers or enable multi-partner apply."})
			return
		}
		paymentMethod := strings.TrimSpace(body.PaymentMethod)
		if paymentMethod == "" {
			paymentMethod = "cash"
		}
		if !isAllowedPaymentMethod(paymentMethod) {
			paymentMethod = "bank_transfer"
		}
		notes := body.Notes
		if notes == nil && body.Remark != nil {
			notes = body.Remark
		}

		var created []OfficialReceipt
		for partnerID, partnerApps := range groups {
			currencyID := int64(0)
			if body.CurrencyID != nil && *body.CurrencyID > 0 {
				currencyID = *body.CurrencyID
			} else {
				_ = pool.QueryRow(r.Context(), `
					select coalesce(currency_id, 0) from public.sa_sales
					where id = $1 and tenant_id = $2`, partnerApps[0].SalesID, tu.TenantID).Scan(&currencyID)
				if currencyID == 0 {
					_ = pool.QueryRow(r.Context(), `
						select id from public.quo_currencies
						where tenant_id = $1 and is_default = true
						limit 1`, tu.TenantID).Scan(&currencyID)
				}
			}
			if currencyID == 0 {
				response.Validation(w, map[string]string{"currency_id": "Currency is required."})
				return
			}
			receiptBody := receiptBody{
				ReceiptDate:   body.PaymentDate,
				PartnerID:     partnerID,
				CurrencyID:    currencyID,
				PaymentMethod: paymentMethod,
				ReferenceNo:   body.ReferenceNo,
				Notes:         notes,
				Applications:  partnerApps,
			}
			rec, msg, status, errCode := createOfficialReceiptFromBody(r.Context(), pool, tu, receiptBody)
			if errCode != "" {
				if status == http.StatusConflict {
					response.Err(w, status, msg, errCode)
					return
				}
				if errCode == "ERR_VALIDATION" {
					response.ValidationSmart(w, map[string]string{"applications": msg})
					return
				}
				response.Err(w, status, msg, errCode)
				return
			}
			created = append(created, rec)
		}
		if len(created) == 1 {
			response.OK(w, created[0], "Created.")
			return
		}
		response.OK(w, created, fmt.Sprintf("Created %d receipts.", len(created)))
	}
}

func applyOpenPayables(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body openPayableApplyBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		siApps, expenseApps := splitAPApps(body.Applications)
		if len(siApps) == 0 && len(expenseApps) == 0 {
			response.Validation(w, map[string]string{"applications": "Add at least one decrease amount."})
			return
		}
		paymentMethod := strings.TrimSpace(body.PaymentMethod)
		if paymentMethod == "" {
			paymentMethod = "bank_transfer"
		}
		if !isAllowedPaymentMethod(paymentMethod) {
			paymentMethod = "bank_transfer"
		}
		notes := body.Notes
		if notes == nil && body.Remark != nil {
			notes = body.Remark
		}

		partnerSet := map[int64]struct{}{}
		var created []PaymentVoucher

		if len(siApps) > 0 {
			groups, errs := groupAPAppsByPartner(r.Context(), pool, tu.TenantID, siApps)
			if errs != nil {
				response.ValidationSmart(w, errs)
				return
			}
			for pid := range groups {
				partnerSet[pid] = struct{}{}
			}
			if len(partnerSet) > 1 && !body.AllowMultiPartner {
				response.Validation(w, map[string]string{"applications": "Selected rows must belong to one vendor. Clear other vendors or enable multi-partner apply."})
				return
			}
			for partnerID, partnerApps := range groups {
				currencyID := int64(0)
				if body.CurrencyID != nil && *body.CurrencyID > 0 {
					currencyID = *body.CurrencyID
				} else {
					_ = pool.QueryRow(r.Context(), `
						select coalesce(currency_id, 0) from public.fin_supplier_invoices
						where id = $1 and tenant_id = $2`, partnerApps[0].SupplierInvoiceID, tu.TenantID).Scan(&currencyID)
					if currencyID == 0 {
						_ = pool.QueryRow(r.Context(), `
							select id from public.quo_currencies
							where tenant_id = $1 and is_default = true
							limit 1`, tu.TenantID).Scan(&currencyID)
					}
				}
				if currencyID == 0 {
					response.Validation(w, map[string]string{"currency_id": "Currency is required."})
					return
				}
				pvBody := paymentVoucherBody{
					PaymentDate:   body.PaymentDate,
					PartnerID:     partnerID,
					CurrencyID:    currencyID,
					PaymentMethod: paymentMethod,
					ReferenceNo:   body.ReferenceNo,
					BankAccountID: body.BankAccountID,
					Notes:         notes,
					Applications:  partnerApps,
				}
				pv, msg, status, errCode := createPaymentVoucherFromBody(r.Context(), pool, tu, pvBody)
				if errCode != "" {
					if status == http.StatusConflict {
						response.Err(w, status, msg, errCode)
						return
					}
					if errCode == "ERR_VALIDATION" {
						response.ValidationSmart(w, map[string]string{"applications": msg})
						return
					}
					response.Err(w, status, msg, errCode)
					return
				}
				created = append(created, pv)
			}
		}

		if len(expenseApps) > 0 {
			expGroups, expErrs := groupExpenseAppsByPartner(r.Context(), pool, tu.TenantID, expenseApps)
			if expErrs != nil {
				response.ValidationSmart(w, expErrs)
				return
			}
			for pid := range expGroups {
				partnerSet[pid] = struct{}{}
			}
			if len(partnerSet) > 1 && !body.AllowMultiPartner {
				response.Validation(w, map[string]string{"applications": "Selected rows must belong to one vendor. Clear other vendors or enable multi-partner apply."})
				return
			}
			var payDate *time.Time
			if d, err := time.Parse("2006-01-02", strings.TrimSpace(body.PaymentDate)); err == nil {
				payDate = &d
			}
			tx, err := pool.Begin(r.Context())
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to pay expenses.", "ERR_INTERNAL")
				return
			}
			defer tx.Rollback(r.Context())
			for _, apps := range expGroups {
				for _, app := range apps {
					if err := validateExpenseApplyAmount(r.Context(), tx, tu.TenantID, app.ExpenseID, app.AppliedAmount, app.DiscountAmount); err != nil {
						response.Validation(w, map[string]string{"applications": err.Error()})
						return
					}
					if err := postExpenseAccrualJournal(r.Context(), tx, tu.TenantID, tu.AppUserID, app.ExpenseID); err != nil {
						response.Err(w, http.StatusBadRequest, "Expense journal failed: "+err.Error(), "ERR_BAD_REQUEST")
						return
					}
					pvID, payErr := payExpenseInTx(r.Context(), tx, tu.TenantID, tu.AppUserID, app.ExpenseID, expensePayOpts{
						PaymentMethod: paymentMethod,
						BankAccountID: body.BankAccountID,
						ReferenceNo:   body.ReferenceNo,
						PaymentDate:   payDate,
					})
					if payErr != nil {
						response.Validation(w, map[string]string{"applications": payErr.Error()})
						return
					}
					created = append(created, PaymentVoucher{ID: pvID})
				}
			}
			if err := tx.Commit(r.Context()); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to save expense payments.", "ERR_INTERNAL")
				return
			}
		}

		if len(created) == 1 {
			response.OK(w, created[0], "Created.")
			return
		}
		response.OK(w, created, fmt.Sprintf("Created %d payment vouchers.", len(created)))
	}
}

func normalizeARApps(in []openPaymentApplyApp) []applicationBody {
	var out []applicationBody
	for _, a := range in {
		salesID := a.SalesID
		if salesID <= 0 {
			salesID = a.DocID
		}
		if salesID <= 0 || applicationTotalReduction(a.AppliedAmount, a.DiscountAmount) <= 0 {
			continue
		}
		out = append(out, applicationBody{
			SalesID:        salesID,
			AppliedAmount:  a.AppliedAmount,
			DiscountAmount: a.DiscountAmount,
		})
	}
	return out
}

func normalizeAPApps(in []openPaymentApplyApp) []paymentApplicationBody {
	si, _ := splitAPApps(in)
	return si
}

func splitAPApps(in []openPaymentApplyApp) (si []paymentApplicationBody, expenses []openPaymentApplyApp) {
	for _, a := range in {
		if applicationTotalReduction(a.AppliedAmount, a.DiscountAmount) <= 0 {
			continue
		}
		docType := strings.ToLower(strings.TrimSpace(a.DocType))
		expID := a.ExpenseID
		if expID <= 0 && docType == "expense" {
			expID = a.DocID
		}
		if expID > 0 || docType == "expense" {
			if expID <= 0 {
				continue
			}
			expenses = append(expenses, openPaymentApplyApp{
				ExpenseID:      expID,
				DocType:        "expense",
				AppliedAmount:  a.AppliedAmount,
				DiscountAmount: a.DiscountAmount,
			})
			continue
		}
		invID := a.InvoiceID
		if invID <= 0 {
			invID = a.DocID
		}
		if invID <= 0 {
			continue
		}
		si = append(si, paymentApplicationBody{
			SupplierInvoiceID: invID,
			AppliedAmount:     a.AppliedAmount,
			DiscountAmount:    a.DiscountAmount,
		})
	}
	return si, expenses
}

func groupExpenseAppsByPartner(ctx context.Context, pool *pgxpool.Pool, tenantID int64, apps []openPaymentApplyApp) (map[int64][]openPaymentApplyApp, map[string]string) {
	groups := map[int64][]openPaymentApplyApp{}
	for i, app := range apps {
		var partnerID int64
		err := pool.QueryRow(ctx, `
			select partner_id from public.fin_expenses
			where id = $1 and tenant_id = $2 and deleted_at is null and partner_id is not null`,
			app.ExpenseID, tenantID).Scan(&partnerID)
		if err != nil {
			return nil, map[string]string{fmt.Sprintf("applications[%d].expense_id", i): "Expense not found."}
		}
		groups[partnerID] = append(groups[partnerID], app)
	}
	return groups, nil
}

func validateExpenseApplyAmount(ctx context.Context, tx pgx.Tx, tenantID, expenseID int64, applied, discount float64) error {
	var balance float64
	err := tx.QueryRow(ctx, `
		select (amount + tax_amount)::float8
		from public.fin_expenses
		where id = $1 and tenant_id = $2 and deleted_at is null and payment_status = 'unpaid'`,
		expenseID, tenantID).Scan(&balance)
	if err != nil {
		return fmt.Errorf("expense not found or already paid")
	}
	total := applicationTotalReduction(applied, discount)
	if total+0.0001 < balance {
		return fmt.Errorf("expenses must be paid in full (balance %.2f)", balance)
	}
	if total > balance+0.01 {
		return fmt.Errorf("applied amount exceeds expense balance")
	}
	return nil
}

func groupARAppsByPartner(ctx context.Context, pool *pgxpool.Pool, tenantID int64, apps []applicationBody) (map[int64][]applicationBody, map[string]string) {
	groups := map[int64][]applicationBody{}
	for i, app := range apps {
		var partnerID int64
		err := pool.QueryRow(ctx, `
			select partner_id from public.sa_sales
			where id = $1 and tenant_id = $2 and deleted_at is null`, app.SalesID, tenantID).Scan(&partnerID)
		if err != nil {
			return nil, map[string]string{fmt.Sprintf("applications[%d].sales_id", i): "Sales document not found."}
		}
		groups[partnerID] = append(groups[partnerID], app)
	}
	return groups, nil
}

func groupAPAppsByPartner(ctx context.Context, pool *pgxpool.Pool, tenantID int64, apps []paymentApplicationBody) (map[int64][]paymentApplicationBody, map[string]string) {
	groups := map[int64][]paymentApplicationBody{}
	for i, app := range apps {
		var partnerID int64
		err := pool.QueryRow(ctx, `
			select partner_id from public.fin_supplier_invoices
			where id = $1 and tenant_id = $2 and deleted_at is null`, app.SupplierInvoiceID, tenantID).Scan(&partnerID)
		if err != nil {
			return nil, map[string]string{fmt.Sprintf("applications[%d].supplier_invoice_id", i): "Supplier invoice not found."}
		}
		groups[partnerID] = append(groups[partnerID], app)
	}
	return groups, nil
}

type openTxnRow struct {
	TxnType       string  `json:"txn_type"`
	DocNo         string  `json:"doc_no"`
	DocDate       string  `json:"doc_date"`
	AppliedAmount float64 `json:"applied_amount"`
	RefID         int64   `json:"ref_id"`
}

func listReceivableTransactions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		salesID, err := strconv.ParseInt(chi.URLParam(r, "salesId"), 10, 64)
		if err != nil || salesID <= 0 {
			response.Validation(w, map[string]string{"salesId": "Invalid sales id."})
			return
		}
		rows, err := pool.Query(r.Context(), `
			select 'official_receipt', coalesce(orx.receipt_no, ''), orx.receipt_date::text, a.applied_amount::float8, orx.id
			from public.fin_receipt_applications a
			join public.fin_official_receipts orx on orx.id = a.official_receipt_id
			where a.sales_id = $1 and orx.tenant_id = $2 and orx.deleted_at is null
			union all
			select 'credit_note', coalesce(c.credit_no, ''), c.credit_date::text, a.applied_amount::float8, c.id
			from public.fin_credit_note_applications a
			join public.fin_credit_notes c on c.id = a.credit_note_id
			where a.sales_id = $1 and c.tenant_id = $2 and c.deleted_at is null
			union all
			select 'retainer', coalesce(ri.retainer_no, ''), ri.retainer_date::text, a.applied_amount::float8, ri.id
			from public.fin_retainer_applications a
			join public.fin_retainer_invoices ri on ri.id = a.retainer_id
			where a.sales_id = $1 and ri.tenant_id = $2 and ri.deleted_at is null
			order by 3 desc, 5 desc`, salesID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load transactions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []openTxnRow
		for rows.Next() {
			var row openTxnRow
			if err := rows.Scan(&row.TxnType, &row.DocNo, &row.DocDate, &row.AppliedAmount, &row.RefID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read transactions.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []openTxnRow{}
		}
		response.OK(w, out, "OK")
	}
}

func listPayableTransactions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		invoiceID, err := strconv.ParseInt(chi.URLParam(r, "invoiceId"), 10, 64)
		if err != nil || invoiceID <= 0 {
			response.Validation(w, map[string]string{"invoiceId": "Invalid invoice id."})
			return
		}
		if strings.EqualFold(strings.TrimSpace(r.URL.Query().Get("doc_type")), "expense") {
			rows, err := pool.Query(r.Context(), `
				select 'payment_voucher', coalesce(pv.payment_no, ''), pv.payment_date::text,
				  (e.amount + e.tax_amount)::float8, pv.id
				from public.fin_expenses e
				join public.fin_payment_vouchers pv on pv.id = e.payment_voucher_id
				where e.id = $1 and e.tenant_id = $2 and e.deleted_at is null and pv.deleted_at is null
				order by pv.payment_date desc, pv.id desc`, invoiceID, tu.TenantID)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load transactions.", "ERR_INTERNAL")
				return
			}
			defer rows.Close()
			var out []openTxnRow
			for rows.Next() {
				var row openTxnRow
				if err := rows.Scan(&row.TxnType, &row.DocNo, &row.DocDate, &row.AppliedAmount, &row.RefID); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to read transactions.", "ERR_INTERNAL")
					return
				}
				out = append(out, row)
			}
			if out == nil {
				out = []openTxnRow{}
			}
			response.OK(w, out, "OK")
			return
		}
		rows, err := pool.Query(r.Context(), `
			select 'payment_voucher', coalesce(pv.payment_no, ''), pv.payment_date::text, a.applied_amount::float8, pv.id
			from public.fin_payment_applications a
			join public.fin_payment_vouchers pv on pv.id = a.payment_voucher_id
			where a.supplier_invoice_id = $1 and pv.tenant_id = $2 and pv.deleted_at is null
			union all
			select 'vendor_credit', coalesce(vc.credit_no, ''), vc.credit_date::text, a.applied_amount::float8, vc.id
			from public.fin_vendor_credit_applications a
			join public.fin_vendor_credits vc on vc.id = a.vendor_credit_id
			where a.supplier_invoice_id = $1 and vc.tenant_id = $2 and vc.deleted_at is null
			order by 3 desc, 5 desc`, invoiceID, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load transactions.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []openTxnRow
		for rows.Next() {
			var row openTxnRow
			if err := rows.Scan(&row.TxnType, &row.DocNo, &row.DocDate, &row.AppliedAmount, &row.RefID); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read transactions.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []openTxnRow{}
		}
		response.OK(w, out, "OK")
	}
}
