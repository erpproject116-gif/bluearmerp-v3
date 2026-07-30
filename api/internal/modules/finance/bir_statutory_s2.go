package finance

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/financedefaults"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type vatRegisterRow struct {
	DocDate         string  `json:"doc_date"`
	DocType         string  `json:"doc_type"`
	DocNo           string  `json:"doc_no"`
	PartnerName     string  `json:"partner_name"`
	PartnerTIN      string  `json:"partner_tin"`
	VatableAmount   float64 `json:"vatable_amount"`
	ExemptAmount    float64 `json:"exempt_amount"`
	ZeroRatedAmount float64 `json:"zero_rated_amount"`
	OutputVAT       float64 `json:"output_vat"`
	InputVAT        float64 `json:"input_vat"`
}

type vatRegisterPayload struct {
	PeriodFrom  string           `json:"period_from"`
	PeriodTo    string           `json:"period_to"`
	TaxRegime   string           `json:"tax_regime"`
	VatEnabled  bool             `json:"vat_enabled"`
	Rows        []vatRegisterRow `json:"rows"`
	Disclaimer  string           `json:"disclaimer"`
}

type vatRegisterTotals struct {
	Vatable   float64
	Exempt    float64
	ZeroRated float64
	OutputVAT float64
	InputVAT  float64
}

type bir2550Adjustments struct {
	AdjOutputVAT          float64 `json:"adj_output_vat"`
	AdjInputVAT           float64 `json:"adj_input_vat"`
	AdjVatableSales       float64 `json:"adj_vatable_sales"`
	AdjExemptSales        float64 `json:"adj_exempt_sales"`
	AdjZeroRatedSales     float64 `json:"adj_zero_rated_sales"`
	AdjVatablePurchases   float64 `json:"adj_vatable_purchases"`
	AdjExemptPurchases    float64 `json:"adj_exempt_purchases"`
	AdjZeroRatedPurchases float64 `json:"adj_zero_rated_purchases"`
	AdjOther              float64 `json:"adj_other"`
	AuditNote             string  `json:"audit_note"`
	UpdatedAt             *string `json:"updated_at,omitempty"`
}

type statutory2550Payload struct {
	PeriodFrom            string             `json:"period_from"`
	PeriodTo              string             `json:"period_to"`
	ReturnType            string             `json:"return_type"`
	TaxRegime             string             `json:"tax_regime"`
	VatEnabled            bool               `json:"vat_enabled"`
	TotalVatableSales     float64            `json:"total_vatable_sales"`
	TotalExemptSales      float64            `json:"total_exempt_sales"`
	TotalZeroRatedSales   float64            `json:"total_zero_rated_sales"`
	TotalOutputVAT        float64            `json:"total_output_vat"`
	TotalVatablePurchases float64            `json:"total_vatable_purchases"`
	TotalExemptPurchases  float64            `json:"total_exempt_purchases"`
	TotalZeroRatedPurch   float64            `json:"total_zero_rated_purchases"`
	TotalInputVAT         float64            `json:"total_input_vat"`
	JournalOutputVAT      float64            `json:"journal_output_vat"`
	JournalInputVAT       float64            `json:"journal_input_vat"`
	NetVATPayable         float64            `json:"net_vat_payable"`
	AdjustedNetVATPayable float64            `json:"adjusted_net_vat_payable"`
	Adjustments           bir2550Adjustments `json:"adjustments"`
	Disclaimer            string             `json:"disclaimer"`
}

type bir2550AdjustmentsBody struct {
	PeriodFrom            string   `json:"period_from"`
	PeriodTo              string   `json:"period_to"`
	ReturnType            string   `json:"return_type"`
	AdjOutputVAT          *float64 `json:"adj_output_vat"`
	AdjInputVAT           *float64 `json:"adj_input_vat"`
	AdjVatableSales       *float64 `json:"adj_vatable_sales"`
	AdjExemptSales        *float64 `json:"adj_exempt_sales"`
	AdjZeroRatedSales     *float64 `json:"adj_zero_rated_sales"`
	AdjVatablePurchases   *float64 `json:"adj_vatable_purchases"`
	AdjExemptPurchases    *float64 `json:"adj_exempt_purchases"`
	AdjZeroRatedPurchases *float64 `json:"adj_zero_rated_purchases"`
	AdjOther              *float64 `json:"adj_other"`
	AuditNote             *string  `json:"audit_note"`
}

func registerBIRStatutoryS2Routes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/vat/sales-register", getVATSalesRegister(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/vat/purchases-register", getVATPurchasesRegister(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/slsp/sales", exportSLSPSales(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/slsp/purchases", exportSLSPPurchases(pool))
	r.With(auth.RequirePermission("finance.statutory_read", auth.AccessRead)).Get("/statutory/2550", get2550Workpaper(pool))
	r.With(auth.RequirePermission("finance.statutory_write", auth.AccessWrite)).Put("/statutory/2550/adjustments", put2550Adjustments(pool))
}

func loadTenantTaxRegime(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (regime string, vatEnabled bool) {
	d, err := financedefaults.Load(ctx, pool, tenantID)
	if err != nil || d.TaxRegime == nil {
		return "", true
	}
	regime = strings.ToLower(strings.TrimSpace(*d.TaxRegime))
	return regime, regime != "non_vat"
}


func sumRegisterTotals(rows []vatRegisterRow) vatRegisterTotals {
	var t vatRegisterTotals
	for _, row := range rows {
		t.Vatable += row.VatableAmount
		t.Exempt += row.ExemptAmount
		t.ZeroRated += row.ZeroRatedAmount
		t.OutputVAT += row.OutputVAT
		t.InputVAT += row.InputVAT
	}
	return t
}

func loadVATSalesRegister(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) ([]vatRegisterRow, error) {
	q := `
		select doc_date::text, doc_type, doc_no, partner_name, partner_tin,
		  vatable_amount::float8, exempt_amount::float8, zero_rated_amount::float8,
		  output_vat::float8, input_vat::float8
		from (
		  select s.order_date as doc_date, 'sales_invoice' as doc_type, s.sales_no as doc_no,
		    coalesce(p.company_name, '') as partner_name,
		    coalesce(nullif(trim(p.tin), ''), '') as partner_tin,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'vatable' then s.subtotal else 0 end as vatable_amount,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'exempt' then s.subtotal when 'non_vat' then s.subtotal else 0 end as exempt_amount,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'zero_rated' then s.subtotal else 0 end as zero_rated_amount,
		    case when coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end) = 'vatable' then s.tax_total else 0 end as output_vat,
		    0::numeric as input_vat
		  from public.sa_sales s
		  join public.inv_partners p on p.id = s.partner_id
		  join public.quo_tax_types tt on tt.id = s.tax_type_id
		  join public.fin_journal_entries je on je.id = s.invoice_journal_entry_id and je.status = 'posted'
		  where s.tenant_id = $1 and s.deleted_at is null
		    and s.order_date between $2 and $3

		  union all

		  select cn.credit_date, 'credit_note', cn.credit_no,
		    coalesce(nullif(trim(p.company_name), ''), cn.customer_name),
		    coalesce(nullif(trim(p.tin), ''), ''),
		    -case coalesce(tt.vat_category, 'vatable') when 'vatable' then coalesce(ln.base_amt, cn.amount_total - coalesce(ln.tax_amt, 0)) else 0 end,
		    -case coalesce(tt.vat_category, 'exempt') when 'exempt' then coalesce(ln.base_amt, cn.amount_total) when 'non_vat' then coalesce(ln.base_amt, cn.amount_total) else 0 end,
		    -case coalesce(tt.vat_category, 'zero_rated') when 'zero_rated' then coalesce(ln.base_amt, cn.amount_total) else 0 end,
		    -case when coalesce(tt.vat_category, 'vatable') = 'vatable' then coalesce(ln.tax_amt, 0) else 0 end,
		    0::numeric
		  from public.fin_credit_notes cn
		  left join public.inv_partners p on p.id = cn.partner_id
		  left join public.sa_sales src on src.id = cn.source_sales_id
		  left join public.quo_tax_types tt on tt.id = src.tax_type_id
		  left join lateral (
		    select sum(l.amount - l.tax_amount) as base_amt, sum(l.tax_amount) as tax_amt
		    from public.fin_credit_note_lines l where l.credit_note_id = cn.id
		  ) ln on true
		  where cn.tenant_id = $1 and cn.deleted_at is null
		    and cn.status not in ('draft', 'cancelled')
		    and cn.credit_date between $2 and $3
		) reg
		order by doc_date, doc_type, doc_no`
	rows, err := pool.Query(ctx, q, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []vatRegisterRow
	for rows.Next() {
		var row vatRegisterRow
		if err := rows.Scan(&row.DocDate, &row.DocType, &row.DocNo, &row.PartnerName, &row.PartnerTIN,
			&row.VatableAmount, &row.ExemptAmount, &row.ZeroRatedAmount, &row.OutputVAT, &row.InputVAT); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []vatRegisterRow{}
	}
	return out, nil
}

func loadVATPurchasesRegister(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) ([]vatRegisterRow, error) {
	q := `
		select doc_date::text, doc_type, doc_no, partner_name, partner_tin,
		  vatable_amount::float8, exempt_amount::float8, zero_rated_amount::float8,
		  output_vat::float8, input_vat::float8
		from (
		  select si.invoice_date as doc_date, 'supplier_invoice' as doc_type, si.invoice_no as doc_no,
		    coalesce(p.company_name, '') as partner_name,
		    coalesce(nullif(trim(p.tin), ''), '') as partner_tin,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'vatable' then si.subtotal else 0 end as vatable_amount,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'exempt' then si.subtotal when 'non_vat' then si.subtotal else 0 end as exempt_amount,
		    case coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end)
		      when 'zero_rated' then si.subtotal else 0 end as zero_rated_amount,
		    0::numeric as output_vat,
		    case when coalesce(tt.vat_category,
		      case when tt.rate_percent > 0 then 'vatable'
		        when lower(tt.name) like '%zero%' then 'zero_rated'
		        when tt.tax_mode = 'none' or lower(tt.name) like '%non%' then 'non_vat'
		        else 'exempt' end) = 'vatable' then si.tax_total else 0 end as input_vat
		  from public.fin_supplier_invoices si
		  join public.inv_partners p on p.id = si.partner_id
		  join public.quo_tax_types tt on tt.id = si.tax_type_id
		  join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id and je.status = 'posted'
		  where si.tenant_id = $1 and si.deleted_at is null
		    and si.invoice_date between $2 and $3

		  union all

		  select vc.credit_date, 'vendor_credit', vc.credit_no,
		    coalesce(nullif(trim(p.company_name), ''), vc.vendor_name),
		    coalesce(nullif(trim(p.tin), ''), ''),
		    -case coalesce(tt.vat_category, 'vatable') when 'vatable' then coalesce(ln.base_amt, vc.amount_total - coalesce(ln.tax_amt, 0)) else 0 end,
		    -case coalesce(tt.vat_category, 'exempt') when 'exempt' then coalesce(ln.base_amt, vc.amount_total) when 'non_vat' then coalesce(ln.base_amt, vc.amount_total) else 0 end,
		    -case coalesce(tt.vat_category, 'zero_rated') when 'zero_rated' then coalesce(ln.base_amt, vc.amount_total) else 0 end,
		    0::numeric,
		    -case when coalesce(tt.vat_category, 'vatable') = 'vatable' then coalesce(ln.tax_amt, 0) else 0 end
		  from public.fin_vendor_credits vc
		  left join public.inv_partners p on p.id = vc.partner_id
		  left join public.fin_supplier_invoices src on src.id = vc.source_supplier_invoice_id
		  left join public.quo_tax_types tt on tt.id = src.tax_type_id
		  left join lateral (
		    select sum(l.amount - l.tax_amount) as base_amt, sum(l.tax_amount) as tax_amt
		    from public.fin_vendor_credit_lines l where l.vendor_credit_id = vc.id
		  ) ln on true
		  where vc.tenant_id = $1 and vc.deleted_at is null
		    and vc.status not in ('draft', 'cancelled')
		    and vc.credit_date between $2 and $3
		) reg
		order by doc_date, doc_type, doc_no`
	rows, err := pool.Query(ctx, q, tenantID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []vatRegisterRow
	for rows.Next() {
		var row vatRegisterRow
		if err := rows.Scan(&row.DocDate, &row.DocType, &row.DocNo, &row.PartnerName, &row.PartnerTIN,
			&row.VatableAmount, &row.ExemptAmount, &row.ZeroRatedAmount, &row.OutputVAT, &row.InputVAT); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	if out == nil {
		out = []vatRegisterRow{}
	}
	return out, nil
}

func loadJournalVATTotals(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time) (outputVAT, inputVAT float64, err error) {
	d, err := financedefaults.Load(ctx, pool, tenantID)
	if err != nil {
		return 0, 0, err
	}
	if d.OutputVATAccountID != nil {
		_ = pool.QueryRow(ctx, `
			select coalesce(sum(jel.credit - jel.debit), 0)::float8
			from public.fin_journal_entry_lines jel
			join public.fin_journal_entries je on je.id = jel.journal_entry_id
			where je.tenant_id = $1 and je.status = 'posted'
			  and je.entry_date between $2 and $3
			  and jel.account_id = $4`, tenantID, from, to, *d.OutputVATAccountID).Scan(&outputVAT)
	}
	if d.InputVATAccountID != nil {
		_ = pool.QueryRow(ctx, `
			select coalesce(sum(jel.debit - jel.credit), 0)::float8
			from public.fin_journal_entry_lines jel
			join public.fin_journal_entries je on je.id = jel.journal_entry_id
			where je.tenant_id = $1 and je.status = 'posted'
			  and je.entry_date between $2 and $3
			  and jel.account_id = $4`, tenantID, from, to, *d.InputVATAccountID).Scan(&inputVAT)
	}
	return outputVAT, inputVAT, nil
}

func load2550Adjustments(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time, returnType string) (bir2550Adjustments, error) {
	var adj bir2550Adjustments
	var updatedAt *string
	err := pool.QueryRow(ctx, `
		select adj_output_vat::float8, adj_input_vat::float8,
		  adj_vatable_sales::float8, adj_exempt_sales::float8, adj_zero_rated_sales::float8,
		  adj_vatable_purchases::float8, adj_exempt_purchases::float8, adj_zero_rated_purchases::float8,
		  adj_other::float8, audit_note, updated_at::text
		from public.fin_bir_vat_workpaper
		where tenant_id = $1 and period_from = $2 and period_to = $3 and return_type = $4`,
		tenantID, from, to, returnType).
		Scan(&adj.AdjOutputVAT, &adj.AdjInputVAT,
			&adj.AdjVatableSales, &adj.AdjExemptSales, &adj.AdjZeroRatedSales,
			&adj.AdjVatablePurchases, &adj.AdjExemptPurchases, &adj.AdjZeroRatedPurchases,
			&adj.AdjOther, &adj.AuditNote, &updatedAt)
	if err != nil {
		return bir2550Adjustments{AuditNote: ""}, nil
	}
	adj.UpdatedAt = updatedAt
	return adj, nil
}

func parse2550ReturnType(w http.ResponseWriter, r *http.Request) (string, bool) {
	rt := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("return_type")))
	if rt == "" {
		rt = "2550M"
	}
	if rt != "2550M" && rt != "2550Q" {
		response.Validation(w, map[string]string{"return_type": "Must be 2550M or 2550Q."})
		return "", false
	}
	return rt, true
}

func getVATSalesRegister(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		regime, vatEnabled := loadTenantTaxRegime(r.Context(), pool, tu.TenantID)
		rows, err := loadVATSalesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load VAT sales register.", "ERR_INTERNAL")
			return
		}
		response.OK(w, vatRegisterPayload{
			PeriodFrom: from.Format("2006-01-02"),
			PeriodTo:   to.Format("2006-01-02"),
			TaxRegime:  regime,
			VatEnabled: vatEnabled,
			Rows:       rows,
			Disclaimer: statutoryDisclaimer,
		}, "OK")
	}
}

func getVATPurchasesRegister(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		regime, vatEnabled := loadTenantTaxRegime(r.Context(), pool, tu.TenantID)
		rows, err := loadVATPurchasesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load VAT purchases register.", "ERR_INTERNAL")
			return
		}
		response.OK(w, vatRegisterPayload{
			PeriodFrom: from.Format("2006-01-02"),
			PeriodTo:   to.Format("2006-01-02"),
			TaxRegime:  regime,
			VatEnabled: vatEnabled,
			Rows:       rows,
			Disclaimer: statutoryDisclaimer,
		}, "OK")
	}
}

func exportSLSPSales(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		rows, err := loadVATSalesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export SLSP sales.", "ERR_INTERNAL")
			return
		}
		writeSLSPCSV(w, from, to, "slsp-sales", rows, true)
	}
}

func exportSLSPPurchases(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		rows, err := loadVATPurchasesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export SLSP purchases.", "ERR_INTERNAL")
			return
		}
		writeSLSPCSV(w, from, to, "slsp-purchases", rows, false)
	}
}

func writeSLSPCSV(w http.ResponseWriter, from, to time.Time, prefix string, rows []vatRegisterRow, isSales bool) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s_%s_%s.csv"`, prefix, from.Format("20060102"), to.Format("20060102")))
	cw := csv.NewWriter(w)
	vatCol := "output_vat"
	if !isSales {
		vatCol = "input_vat"
	}
	_ = cw.Write([]string{
		"period_from", "period_to", "doc_date", "doc_type", "doc_no",
		"partner_tin", "partner_name", "vatable_amount", "exempt_amount", "zero_rated_amount", vatCol,
	})
	for _, row := range rows {
		vatAmt := row.OutputVAT
		if !isSales {
			vatAmt = row.InputVAT
		}
		_ = cw.Write([]string{
			from.Format("2006-01-02"),
			to.Format("2006-01-02"),
			row.DocDate,
			row.DocType,
			row.DocNo,
			row.PartnerTIN,
			row.PartnerName,
			fmt.Sprintf("%.4f", row.VatableAmount),
			fmt.Sprintf("%.4f", row.ExemptAmount),
			fmt.Sprintf("%.4f", row.ZeroRatedAmount),
			fmt.Sprintf("%.4f", vatAmt),
		})
	}
	cw.Flush()
}

func get2550Workpaper(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		from, to, ok := parseStatutoryPeriod(w, r)
		if !ok {
			return
		}
		returnType, ok := parse2550ReturnType(w, r)
		if !ok {
			return
		}
		regime, vatEnabled := loadTenantTaxRegime(r.Context(), pool, tu.TenantID)

		salesRows, err := loadVATSalesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build 2550 workpaper.", "ERR_INTERNAL")
			return
		}
		purchRows, err := loadVATPurchasesRegister(r.Context(), pool, tu.TenantID, from, to)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build 2550 workpaper.", "ERR_INTERNAL")
			return
		}
		salesT := sumRegisterTotals(salesRows)
		purchT := sumRegisterTotals(purchRows)
		jOut, jIn, _ := loadJournalVATTotals(r.Context(), pool, tu.TenantID, from, to)
		adj, _ := load2550Adjustments(r.Context(), pool, tu.TenantID, from, to, returnType)

		netVAT := salesT.OutputVAT - purchT.InputVAT
		adjNet := netVAT + adj.AdjOutputVAT - adj.AdjInputVAT + adj.AdjOther

		response.OK(w, statutory2550Payload{
			PeriodFrom:            from.Format("2006-01-02"),
			PeriodTo:              to.Format("2006-01-02"),
			ReturnType:            returnType,
			TaxRegime:             regime,
			VatEnabled:            vatEnabled,
			TotalVatableSales:     salesT.Vatable,
			TotalExemptSales:      salesT.Exempt,
			TotalZeroRatedSales:   salesT.ZeroRated,
			TotalOutputVAT:        salesT.OutputVAT,
			TotalVatablePurchases: purchT.Vatable,
			TotalExemptPurchases:  purchT.Exempt,
			TotalZeroRatedPurch:   purchT.ZeroRated,
			TotalInputVAT:         purchT.InputVAT,
			JournalOutputVAT:      jOut,
			JournalInputVAT:       jIn,
			NetVATPayable:         netVAT,
			AdjustedNetVATPayable: adjNet,
			Adjustments:           adj,
			Disclaimer:            statutoryDisclaimer,
		}, "OK")
	}
}

func put2550Adjustments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bir2550AdjustmentsBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		from, err := parseDate(body.PeriodFrom)
		if err != nil {
			response.Validation(w, map[string]string{"period_from": "Invalid date."})
			return
		}
		to, err := parseDate(body.PeriodTo)
		if err != nil {
			response.Validation(w, map[string]string{"period_to": "Invalid date."})
			return
		}
		if to.Before(from) {
			response.Validation(w, map[string]string{"period_to": "Must be on or after period_from."})
			return
		}
		returnType := strings.ToUpper(strings.TrimSpace(body.ReturnType))
		if returnType == "" {
			returnType = "2550M"
		}
		if returnType != "2550M" && returnType != "2550Q" {
			response.Validation(w, map[string]string{"return_type": "Must be 2550M or 2550Q."})
			return
		}

		cur, _ := load2550Adjustments(r.Context(), pool, tu.TenantID, from, to, returnType)
		if body.AdjOutputVAT != nil {
			cur.AdjOutputVAT = *body.AdjOutputVAT
		}
		if body.AdjInputVAT != nil {
			cur.AdjInputVAT = *body.AdjInputVAT
		}
		if body.AdjVatableSales != nil {
			cur.AdjVatableSales = *body.AdjVatableSales
		}
		if body.AdjExemptSales != nil {
			cur.AdjExemptSales = *body.AdjExemptSales
		}
		if body.AdjZeroRatedSales != nil {
			cur.AdjZeroRatedSales = *body.AdjZeroRatedSales
		}
		if body.AdjVatablePurchases != nil {
			cur.AdjVatablePurchases = *body.AdjVatablePurchases
		}
		if body.AdjExemptPurchases != nil {
			cur.AdjExemptPurchases = *body.AdjExemptPurchases
		}
		if body.AdjZeroRatedPurchases != nil {
			cur.AdjZeroRatedPurchases = *body.AdjZeroRatedPurchases
		}
		if body.AdjOther != nil {
			cur.AdjOther = *body.AdjOther
		}
		if body.AuditNote != nil {
			cur.AuditNote = strings.TrimSpace(*body.AuditNote)
		}

		_, err = pool.Exec(r.Context(), `
			insert into public.fin_bir_vat_workpaper (
			  tenant_id, period_from, period_to, return_type,
			  adj_output_vat, adj_input_vat,
			  adj_vatable_sales, adj_exempt_sales, adj_zero_rated_sales,
			  adj_vatable_purchases, adj_exempt_purchases, adj_zero_rated_purchases,
			  adj_other, audit_note, updated_by_user_id, updated_at
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now())
			on conflict (tenant_id, period_from, period_to, return_type) do update set
			  adj_output_vat = excluded.adj_output_vat,
			  adj_input_vat = excluded.adj_input_vat,
			  adj_vatable_sales = excluded.adj_vatable_sales,
			  adj_exempt_sales = excluded.adj_exempt_sales,
			  adj_zero_rated_sales = excluded.adj_zero_rated_sales,
			  adj_vatable_purchases = excluded.adj_vatable_purchases,
			  adj_exempt_purchases = excluded.adj_exempt_purchases,
			  adj_zero_rated_purchases = excluded.adj_zero_rated_purchases,
			  adj_other = excluded.adj_other,
			  audit_note = excluded.audit_note,
			  updated_by_user_id = excluded.updated_by_user_id,
			  updated_at = now()`,
			tu.TenantID, from, to, returnType,
			cur.AdjOutputVAT, cur.AdjInputVAT,
			cur.AdjVatableSales, cur.AdjExemptSales, cur.AdjZeroRatedSales,
			cur.AdjVatablePurchases, cur.AdjExemptPurchases, cur.AdjZeroRatedPurchases,
			cur.AdjOther, cur.AuditNote, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save adjustments.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bir2550.adjustments", "fin_bir_vat_workpaper", nil, nil, body)
		saved, _ := load2550Adjustments(r.Context(), pool, tu.TenantID, from, to, returnType)
		response.OK(w, saved, "Saved.")
	}
}
