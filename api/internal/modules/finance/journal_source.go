package finance

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type journalSource struct {
	Type string
	ID   int64
	No   string
}

func keepFirstSource(dst map[int64]journalSource, id int64, src journalSource) {
	if id <= 0 || src.Type == "" {
		return
	}
	if _, ok := dst[id]; ok {
		return
	}
	dst[id] = src
}

func assignReversalSource(dst map[int64]journalSource, child, parent int64, parentSrc map[int64]journalSource) {
	if child <= 0 || parent <= 0 || child == parent {
		return
	}
	if _, ok := dst[child]; ok {
		return
	}
	if src, ok := dst[parent]; ok {
		dst[child] = src
		return
	}
	if src, ok := parentSrc[parent]; ok {
		dst[child] = src
	}
}

func distinctJournalIDs(ids []int64) []int64 {
	seen := map[int64]struct{}{}
	out := make([]int64, 0, len(ids))
	for _, id := range ids {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func lookupJournalSources(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids []int64) (map[int64]journalSource, error) {
	out := map[int64]journalSource{}
	ids = distinctJournalIDs(ids)
	if len(ids) == 0 {
		return out, nil
	}
	// Lowest priority number wins. Document links that open a record come first.
	// Later matches stay as source_no text and the page opens the journal entry.
	const q = `
		select journal_entry_id, source_type, source_id, source_no
		from (
			select s.invoice_journal_entry_id as journal_entry_id, 'sa_sales'::text as source_type, s.id as source_id, s.sales_no::text as source_no, 1 as priority
			from public.sa_sales s
			where s.tenant_id = $1 and s.invoice_journal_entry_id = any($2)
			union all
			select si.invoice_journal_entry_id, 'fin_supplier_invoice', si.id, si.invoice_no::text, 2
			from public.fin_supplier_invoices si
			where si.tenant_id = $1 and si.deleted_at is null and si.invoice_journal_entry_id = any($2)
			union all
			select je.id, 'official_receipt', o.id, o.receipt_no::text, 3
			from public.fin_journal_entries je
			join public.fin_posting_log pl on pl.tenant_id = je.tenant_id
			  and pl.source_type = 'official_receipt'
			  and je.entry_no = 'official_receipt-' || pl.source_id::text
			join public.fin_official_receipts o on o.id = pl.source_id and o.tenant_id = je.tenant_id and o.deleted_at is null
			where je.tenant_id = $1 and je.id = any($2)
			union all
			select c.journal_entry_id, 'fin_credit_note', c.id, c.credit_no::text, 4
			from public.fin_credit_notes c
			where c.tenant_id = $1 and c.deleted_at is null and c.journal_entry_id = any($2)
			union all
			select c.journal_entry_id, 'fin_vendor_credit', c.id, c.credit_no::text, 5
			from public.fin_vendor_credits c
			where c.tenant_id = $1 and c.deleted_at is null and c.journal_entry_id = any($2)
			union all
			select e.journal_entry_id, 'fin_expense', e.id, e.expense_no::text, 6
			from public.fin_expenses e
			where e.tenant_id = $1 and e.deleted_at is null and e.journal_entry_id = any($2)
			union all
			select r.journal_entry_id, 'fin_retainer_invoice', r.id, r.retainer_no::text, 7
			from public.fin_retainer_invoices r
			where r.tenant_id = $1 and r.deleted_at is null and r.journal_entry_id = any($2)
			union all
			select r.apply_journal_entry_id, 'fin_retainer_apply', r.id, r.retainer_no::text, 8
			from public.fin_retainer_invoices r
			where r.tenant_id = $1 and r.deleted_at is null and r.apply_journal_entry_id = any($2)
			union all
			select i.journal_entry_id, 'inv_repair_part_issue', i.id, i.id::text, 9
			from public.inv_repair_part_issues i
			where i.tenant_id = $1 and i.journal_entry_id = any($2)
			union all
			select p.journal_entry_id, 'mfg_work_order_cost_posting', p.id, coalesce(wo.work_order_no, p.id::text), 10
			from public.mfg_work_order_cost_postings p
			left join public.mfg_work_orders wo on wo.id = p.work_order_id and wo.tenant_id = p.tenant_id
			where p.tenant_id = $1 and p.journal_entry_id = any($2)
			union all
			select rv.journal_entry_id, 'mfg_work_order_reversal', rv.id, coalesce(wo.work_order_no, rv.id::text), 11
			from public.mfg_work_order_reversals rv
			left join public.mfg_work_orders wo on wo.id = rv.work_order_id and wo.tenant_id = rv.tenant_id
			where rv.tenant_id = $1 and rv.journal_entry_id = any($2)
			union all
			select a.journal_entry_id, 'sa_commission_accrual', a.id, a.id::text, 12
			from public.sa_commission_accruals a
			where a.tenant_id = $1 and a.journal_entry_id = any($2)
			union all
			select ps.journal_entry_id, 'hr_payslip', ps.id, ps.id::text, 13
			from public.hr_payslips ps
			where ps.tenant_id = $1 and ps.journal_entry_id = any($2)
			union all
			select d.journal_entry_id, 'fin_depreciation_run', d.id,
			  d.period_year::text || '-' || lpad(d.period_month::text, 2, '0'), 14
			from public.fin_depreciation_runs d
			where d.tenant_id = $1 and d.journal_entry_id = any($2)
			union all
			select c.journal_entry_id, 'fin_year_end_closing', c.id, fy.year_code::text, 15
			from public.fin_year_end_closings c
			join public.fin_fiscal_years fy on fy.id = c.fiscal_year_id and fy.tenant_id = c.tenant_id
			where c.tenant_id = $1 and c.journal_entry_id = any($2)
			union all
			select je.id, 'payment_voucher', pv.id, pv.payment_no::text, 16
			from public.fin_journal_entries je
			join public.fin_posting_log pl on pl.tenant_id = je.tenant_id
			  and pl.source_type = 'payment_voucher'
			  and je.entry_no = 'payment_voucher-' || pl.source_id::text
			join public.fin_payment_vouchers pv on pv.id = pl.source_id and pv.tenant_id = je.tenant_id and pv.deleted_at is null
			where je.tenant_id = $1 and je.id = any($2)
		) src
		order by priority, source_id`
	rows, err := pool.Query(ctx, q, tenantID, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, sourceID int64
		var sourceType, sourceNo string
		if err := rows.Scan(&id, &sourceType, &sourceID, &sourceNo); err != nil {
			return nil, err
		}
		keepFirstSource(out, id, journalSource{Type: sourceType, ID: sourceID, No: sourceNo})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func resolveJournalSources(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ids []int64) (map[int64]journalSource, error) {
	out, err := lookupJournalSources(ctx, pool, tenantID, ids)
	if err != nil {
		return nil, err
	}
	ids = distinctJournalIDs(ids)
	var unresolved []int64
	for _, id := range ids {
		if _, ok := out[id]; !ok {
			unresolved = append(unresolved, id)
		}
	}
	if len(unresolved) == 0 {
		return out, nil
	}
	hop, err := pool.Query(ctx, `
		select id, reversal_of_entry_id
		from public.fin_journal_entries
		where tenant_id = $1 and id = any($2)
		  and reversal_of_entry_id is not null
		  and reversal_of_entry_id <> id`, tenantID, unresolved)
	if err != nil {
		return nil, err
	}
	defer hop.Close()
	childToParent := map[int64]int64{}
	var parents []int64
	for hop.Next() {
		var child, parent int64
		if err := hop.Scan(&child, &parent); err != nil {
			return nil, err
		}
		if child == parent {
			continue
		}
		childToParent[child] = parent
		parents = append(parents, parent)
	}
	if err := hop.Err(); err != nil {
		return nil, err
	}
	parentSrc, err := lookupJournalSources(ctx, pool, tenantID, parents)
	if err != nil {
		return nil, err
	}
	for child, parent := range childToParent {
		assignReversalSource(out, child, parent, parentSrc)
	}
	return out, nil
}

func attachJournalSources(ctx context.Context, pool *pgxpool.Pool, tenantID int64, rows []generalLedgerRow) error {
	if len(rows) == 0 {
		return nil
	}
	ids := make([]int64, len(rows))
	for i := range rows {
		ids[i] = rows[i].JournalEntryID
	}
	src, err := resolveJournalSources(ctx, pool, tenantID, ids)
	if err != nil {
		return err
	}
	for i := range rows {
		s, ok := src[rows[i].JournalEntryID]
		if !ok {
			continue
		}
		rows[i].SourceType = s.Type
		rows[i].SourceID = s.ID
		rows[i].SourceNo = s.No
	}
	return nil
}
