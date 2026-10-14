package finance

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
)

// RepairUnfinishedInvoiceJournals reverses invoice journals that were posted
// for sales or supplier invoices that are not completed, once per tenant, then
// cancels and archives both the original and the reversal so they leave the
// active journal list and posted reports. Official receipts and payment
// vouchers are not touched. A missing repair table is logged by the caller
// and skipped.
func RepairUnfinishedInvoiceJournals(ctx context.Context, pool *pgxpool.Pool) error {
	var ready bool
	if err := pool.QueryRow(ctx, `select to_regclass('public.fin_unfinished_journal_repairs') is not null`).Scan(&ready); err != nil {
		return err
	}
	if !ready {
		return nil
	}
	rows, err := pool.Query(ctx, `
		select t.id
		from public.tenants t
		where not exists (
		  select 1 from public.fin_unfinished_journal_repairs r where r.tenant_id = t.id
		)`)
	if err != nil {
		return err
	}
	defer rows.Close()
	var tenantIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return err
		}
		tenantIDs = append(tenantIDs, id)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, tenantID := range tenantIDs {
		if err := repairTenantUnfinishedJournals(ctx, pool, tenantID); err != nil {
			return fmt.Errorf("tenant %d: %w", tenantID, err)
		}
	}
	return nil
}

func repairTenantUnfinishedJournals(ctx context.Context, pool *pgxpool.Pool, tenantID int64) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID int64
	_ = tx.QueryRow(ctx, `select id from public.users where tenant_id = $1 order by id limit 1`, tenantID).Scan(&userID)

	if err := voidUnfinishedInvoiceJournals(ctx, tx, tenantID, userID, "sa_sales", "Unfinished sale"); err != nil {
		return err
	}
	if err := voidUnfinishedInvoiceJournals(ctx, tx, tenantID, userID, "fin_supplier_invoices", "Unfinished purchase"); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into public.fin_unfinished_journal_repairs (tenant_id) values ($1)
		on conflict (tenant_id) do nothing`, tenantID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func voidUnfinishedInvoiceJournals(ctx context.Context, tx pgx.Tx, tenantID, userID int64, table, label string) error {
	switch table {
	case "sa_sales", "fin_supplier_invoices":
	default:
		return fmt.Errorf("unsupported repair table %s", table)
	}
	rows, err := tx.Query(ctx, `
		select id, invoice_journal_entry_id, coalesce(progress_status, '')
		from public.`+table+`
		where tenant_id = $1 and deleted_at is null
		  and invoice_journal_entry_id is not null
		  and coalesce(progress_status, '') <> 'completed'
		for update`, tenantID)
	if err != nil {
		return err
	}
	defer rows.Close()
	type doc struct {
		id       int64
		journal  int64
		progress string
	}
	var docs []doc
	for rows.Next() {
		var d doc
		if err := rows.Scan(&d.id, &d.journal, &d.progress); err != nil {
			return err
		}
		docs = append(docs, d)
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows.Close()
	for _, d := range docs {
		if !shouldVoidUnfinishedInvoiceJournal(d.progress, d.journal) {
			continue
		}
		je := d.journal
		result, err := invoicejournal.VoidTx(ctx, tx, tenantID, userID, &je, unfinishedJournalVoidRemark(label))
		if err != nil {
			return err
		}
		if err := cancelUnfinishedRepairJournals(ctx, tx, tenantID, d.journal, result.ReversalEntryID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			update public.`+table+`
			set invoice_journal_entry_id = null, updated_at = now()
			where id = $1 and tenant_id = $2`, d.id, tenantID); err != nil {
			return err
		}
		log.Printf("unfinished invoice journal repair: tenant %d %s %d journal %d", tenantID, table, d.id, d.journal)
	}
	return nil
}

func unfinishedJournalVoidRemark(label string) string {
	return label + " journal reversed because the document is not completed"
}

// cancelUnfinishedRepairJournals takes the unfinished invoice journal and its
// reversal off the active register and off every posted report. Both stay
// available under the Archived status.
func cancelUnfinishedRepairJournals(ctx context.Context, tx pgx.Tx, tenantID, originalID int64, reversalID *int64) error {
	_, err := tx.Exec(ctx, `
		update public.fin_journal_entries
		set status = 'cancelled',
		    archived_at = coalesce(archived_at, now()),
		    updated_at = now()
		where tenant_id = $1
		  and (id = $2 or ($3::bigint is not null and id = $3))`,
		tenantID, originalID, reversalID)
	return err
}
