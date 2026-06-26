package sales

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type collectiveTransactionRow struct {
	CollectiveInvoiceID       int64   `json:"collective_invoice_id"`
	InvoicingDateNoDisplay    string  `json:"invoicing_date_no_display"`
	TransactionDateNoDisplay string `json:"transaction_date_no_display"`
	SalesID                   int64   `json:"sales_id"`
	LineID                    int64   `json:"line_id"`
	ItemNameSpec              string  `json:"item_name_spec"`
	Qty                       float64 `json:"qty"`
	Price                     float64 `json:"price"`
	PretaxAmount              float64 `json:"pretax_amount"`
	Tax                       float64 `json:"tax"`
	Total                     float64 `json:"total"`
	CustomerName              string  `json:"customer_name"`
	AccountingSlipNo          string  `json:"accounting_slip_no,omitempty"`
	CompanyName               string  `json:"company_name,omitempty"`
}

func formatItemNameSpec(name string, desc *string) string {
	n := strings.TrimSpace(name)
	if desc != nil && strings.TrimSpace(*desc) != "" {
		return fmt.Sprintf("%s [%s]", n, strings.TrimSpace(*desc))
	}
	return n
}

func transactionDateNoDisplay(saleDateNo string, sortOrder int) string {
	return fmt.Sprintf("%s -%d", saleDateNo, sortOrder)
}

func queryCollectiveTransactions(ctx context.Context, pool *pgxpool.Pool, tenantID, invoiceID int64) ([]collectiveTransactionRow, collectiveTransactionRow, error) {
	var header collectiveTransactionRow
	var invoiceDate time.Time
	var dateSeq int
	var acctSlip *string
	var companyName string
	err := pool.QueryRow(ctx, `
		select ci.invoice_date, ci.date_seq, ci.accounting_slip_no, coalesce(p.company_name, ''), ci.id
		from public.sa_collective_invoices ci
		join public.inv_partners p on p.id = ci.partner_id
		where ci.id = $1 and ci.tenant_id = $2`, invoiceID, tenantID).
		Scan(&invoiceDate, &dateSeq, &acctSlip, &companyName, &header.CollectiveInvoiceID)
	if err != nil {
		return nil, header, err
	}
	invoicingDateNo := formatDateNoDisplay(invoiceDate, dateSeq)
	header.InvoicingDateNoDisplay = invoicingDateNo
	if acctSlip != nil {
		header.AccountingSlipNo = *acctSlip
	}
	header.CompanyName = companyName

	q := `
		select cis.sort_order, s.id, s.order_date, s.date_seq, p.company_name,
		  ln.id, ln.item_name, ln.description, ln.qty::float8,
		  ln.unit_non_vat::float8, ln.non_vat_total::float8, ln.tax_amount::float8, ln.line_total::float8
		from public.sa_collective_invoice_sales cis
		join public.sa_sales s on s.id = cis.sales_id
		join public.inv_partners p on p.id = s.partner_id
		join public.sa_sales_lines ln on ln.sales_id = s.id
		where cis.collective_invoice_id = $1 and s.tenant_id = $2
		order by cis.sort_order, ln.line_no`
	rows, err := pool.Query(ctx, q, invoiceID, tenantID)
	if err != nil {
		return nil, header, err
	}
	defer rows.Close()
	var out []collectiveTransactionRow
	var subQty, subPretax, subTax, subTotal float64
	firstInvoicingShown := false
	for rows.Next() {
		var sortOrder int
		var orderDate time.Time
		var saleDateSeq int
		var row collectiveTransactionRow
		var desc *string
		if err := rows.Scan(
			&sortOrder, &row.SalesID, &orderDate, &saleDateSeq, &row.CustomerName,
			&row.LineID, &row.ItemNameSpec, &desc, &row.Qty,
			&row.Price, &row.PretaxAmount, &row.Tax, &row.Total,
		); err != nil {
			return nil, header, err
		}
		row.CollectiveInvoiceID = invoiceID
		saleDateNo := formatDateNoDisplay(orderDate, saleDateSeq)
		row.TransactionDateNoDisplay = transactionDateNoDisplay(saleDateNo, sortOrder)
		if !firstInvoicingShown {
			row.InvoicingDateNoDisplay = invoicingDateNo
			firstInvoicingShown = true
		}
		row.ItemNameSpec = formatItemNameSpec(row.ItemNameSpec, desc)
		subQty += row.Qty
		subPretax += row.PretaxAmount
		subTax += row.Tax
		subTotal += row.Total
		out = append(out, row)
	}
	if out == nil {
		out = []collectiveTransactionRow{}
	}
	return out, header, nil
}

func listCollectiveInvoiceTransactions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, header, err := queryCollectiveTransactions(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{
			"header": header,
			"rows":   rows,
		}, "OK")
	}
}

func exportCollectiveInvoiceTransactions(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		rows, _, err := queryCollectiveTransactions(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="collective-invoice-%d-transactions.csv"`, id))
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Invoicing Date-No.", "Date-No.", "Item Name [Spec]", "Qty", "Price", "Pretax Amount", "Tax", "Total", "Customer/Vendor Name"})
		for _, row := range rows {
			_ = cw.Write([]string{
				row.InvoicingDateNoDisplay,
				row.TransactionDateNoDisplay,
				row.ItemNameSpec,
				fmt.Sprintf("%.4f", row.Qty),
				fmt.Sprintf("%.2f", row.Price),
				fmt.Sprintf("%.2f", row.PretaxAmount),
				fmt.Sprintf("%.2f", row.Tax),
				fmt.Sprintf("%.2f", row.Total),
				row.CustomerName,
			})
		}
		cw.Flush()
	}
}
