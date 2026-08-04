package finance

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

var inventoryAssetCodes = []string{"1200", "1469", "1509", "1539", "1689", "1699"}

type acctInvReconSummary struct {
	AcctClosingBalance  float64 `json:"acct_closing_balance"`
	InvClosingValuation float64 `json:"inv_closing_valuation"`
	ClosingDifference   float64 `json:"closing_difference"`
	AcctPeriodNet       float64 `json:"acct_period_net"`
	InvPeriodNet        float64 `json:"inv_period_net"`
	PeriodDifference    float64 `json:"period_difference"`
}

type acctInvReconAccountRow struct {
	AccountCode    string  `json:"account_code"`
	AccountName    string  `json:"account_name"`
	PeriodDebit    float64 `json:"period_debit"`
	PeriodCredit   float64 `json:"period_credit"`
	PeriodNet      float64 `json:"period_net"`
	ClosingBalance float64 `json:"closing_balance"`
}

type acctInvReconPayload struct {
	Summary  acctInvReconSummary      `json:"summary"`
	Accounts []acctInvReconAccountRow `json:"accounts"`
}

func acctInvClosingBalanceSQL() string {
	return `
		select coalesce(sum(l.debit - l.credit), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		  and je.tenant_id = $1 and je.status = 'posted' and je.entry_date <= $3::date
		join public.fin_accounts a on a.id = l.account_id and a.tenant_id = $1
		where a.account_code = any($2::text[])`
}

func acctInvPeriodNetSQL() string {
	return `
		select coalesce(sum(l.debit - l.credit), 0)::float8
		from public.fin_journal_entry_lines l
		join public.fin_journal_entries je on je.id = l.journal_entry_id
		  and je.tenant_id = $1 and je.status = 'posted'
		  and je.entry_date >= $3::date and je.entry_date <= $4::date
		join public.fin_accounts a on a.id = l.account_id and a.tenant_id = $1
		where a.account_code = any($2::text[])`
}

func invClosingValuationSQL() string {
	return `
		with on_hand as (
		  select sm.item_id, sum(sm.qty_delta)::float8 as qty
		  from public.inv_stock_movements sm
		  where sm.tenant_id = $1
		    and sm.created_at < ($2::date + interval '1 day')
		  group by sm.item_id
		  having abs(sum(sm.qty_delta)) > 0.0001
		)
		select coalesce(sum(oh.qty * coalesce(nullif(i.purchase_price, 0), 0)), 0)::float8
		from on_hand oh
		join public.inv_items i on i.id = oh.item_id and i.tenant_id = $1`
}

func invPeriodNetSQL() string {
	return `
		select coalesce(sum(sm.qty_delta * coalesce(nullif(i.purchase_price, 0), 0)), 0)::float8
		from public.inv_stock_movements sm
		join public.inv_items i on i.id = sm.item_id and i.tenant_id = $1
		where sm.tenant_id = $1
		  and sm.created_at >= $2::date
		  and sm.created_at < ($3::date + interval '1 day')`
}

func acctInvAccountRowsSQL() string {
	return `
		select a.account_code, a.account_name,
		  coalesce(sum(case when je.entry_date >= $3::date and je.entry_date <= $4::date then l.debit else 0 end), 0)::float8,
		  coalesce(sum(case when je.entry_date >= $3::date and je.entry_date <= $4::date then l.credit else 0 end), 0)::float8,
		  coalesce(sum(case when je.entry_date >= $3::date and je.entry_date <= $4::date then l.debit - l.credit else 0 end), 0)::float8,
		  coalesce(sum(case when je.entry_date <= $4::date then l.debit - l.credit else 0 end), 0)::float8
		from public.fin_accounts a
		left join public.fin_journal_entry_lines l on l.account_id = a.id
		left join public.fin_journal_entries je on je.id = l.journal_entry_id
		  and je.tenant_id = $1 and je.status = 'posted'
		where a.tenant_id = $1 and a.account_code = any($2::text[])
		group by a.id, a.account_code, a.account_name
		order by a.account_code`
}

func loadAcctInventoryReconciliation(ctx context.Context, pool *pgxpool.Pool, tenantID int64, dateFrom, dateTo time.Time) (acctInvReconPayload, error) {
	var out acctInvReconPayload
	codes := append([]string{}, inventoryAssetCodes...)
	var mappedCode string
	_ = pool.QueryRow(ctx, `
		select a.account_code
		from public.tenant_finance_defaults d
		join public.fin_accounts a on a.id = d.inventory_account_id and a.tenant_id = d.tenant_id
		where d.tenant_id = $1 and a.deleted_at is null`, tenantID).Scan(&mappedCode)
	if mappedCode != "" {
		found := false
		for _, c := range codes {
			if c == mappedCode {
				found = true
				break
			}
		}
		if !found {
			codes = append(codes, mappedCode)
		}
	}

	if err := pool.QueryRow(ctx, acctInvClosingBalanceSQL(), tenantID, codes, dateTo).Scan(&out.Summary.AcctClosingBalance); err != nil {
		return out, err
	}
	if err := pool.QueryRow(ctx, invClosingValuationSQL(), tenantID, dateTo).Scan(&out.Summary.InvClosingValuation); err != nil {
		return out, err
	}
	out.Summary.ClosingDifference = out.Summary.AcctClosingBalance - out.Summary.InvClosingValuation

	if err := pool.QueryRow(ctx, acctInvPeriodNetSQL(), tenantID, codes, dateFrom, dateTo).Scan(&out.Summary.AcctPeriodNet); err != nil {
		return out, err
	}
	if err := pool.QueryRow(ctx, invPeriodNetSQL(), tenantID, dateFrom, dateTo).Scan(&out.Summary.InvPeriodNet); err != nil {
		return out, err
	}
	out.Summary.PeriodDifference = out.Summary.AcctPeriodNet - out.Summary.InvPeriodNet

	rows, err := pool.Query(ctx, acctInvAccountRowsSQL(), tenantID, codes, dateFrom, dateTo)
	if err != nil {
		return out, err
	}
	defer rows.Close()
	for rows.Next() {
		var row acctInvReconAccountRow
		if err := rows.Scan(&row.AccountCode, &row.AccountName, &row.PeriodDebit, &row.PeriodCredit, &row.PeriodNet, &row.ClosingBalance); err != nil {
			return out, err
		}
		out.Accounts = append(out.Accounts, row)
	}
	if out.Accounts == nil {
		out.Accounts = []acctInvReconAccountRow{}
	}
	return out, nil
}

func listAcctInventoryReconciliation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		payload, err := loadAcctInventoryReconciliation(r.Context(), pool, tu.TenantID, *dateFrom, *dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load accounting vs inventory reconciliation.", "ERR_INTERNAL")
			return
		}
		response.OK(w, payload, "OK")
	}
}

func exportAcctInventoryReconciliation(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		payload, err := loadAcctInventoryReconciliation(r.Context(), pool, tu.TenantID, *dateFrom, *dateTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to export reconciliation.", "ERR_INTERNAL")
			return
		}
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="acct-inventory-reconciliation.csv"`)
		cw := csv.NewWriter(w)
		_ = cw.Write([]string{"Section", "Account", "Period debit", "Period credit", "Period net", "Closing balance"})
		_ = cw.Write([]string{
			"Summary",
			"Inventory GL (total)",
			"",
			"",
			strconv.FormatFloat(payload.Summary.AcctPeriodNet, 'f', -1, 64),
			strconv.FormatFloat(payload.Summary.AcctClosingBalance, 'f', -1, 64),
		})
		_ = cw.Write([]string{
			"Summary",
			"Inventory valuation (operational)",
			"",
			"",
			strconv.FormatFloat(payload.Summary.InvPeriodNet, 'f', -1, 64),
			strconv.FormatFloat(payload.Summary.InvClosingValuation, 'f', -1, 64),
		})
		_ = cw.Write([]string{
			"Summary",
			"Difference",
			"",
			"",
			strconv.FormatFloat(payload.Summary.PeriodDifference, 'f', -1, 64),
			strconv.FormatFloat(payload.Summary.ClosingDifference, 'f', -1, 64),
		})
		for _, row := range payload.Accounts {
			_ = cw.Write([]string{
				"Account",
				fmt.Sprintf("%s %s", row.AccountCode, row.AccountName),
				strconv.FormatFloat(row.PeriodDebit, 'f', -1, 64),
				strconv.FormatFloat(row.PeriodCredit, 'f', -1, 64),
				strconv.FormatFloat(row.PeriodNet, 'f', -1, 64),
				strconv.FormatFloat(row.ClosingBalance, 'f', -1, 64),
			})
		}
		cw.Flush()
	}
}
