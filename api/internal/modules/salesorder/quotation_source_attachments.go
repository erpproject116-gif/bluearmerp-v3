package salesorder

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
)

// quotationSourceIDsFromBody collects quotation ids from header + line FKs.
func quotationSourceIDsFromBody(
	ctx context.Context,
	pool *pgxpool.Pool,
	body salesOrderBody,
) map[int64]struct{} {
	quoIDs := map[int64]struct{}{}
	if body.SourceQuotationID != nil && *body.SourceQuotationID > 0 {
		quoIDs[*body.SourceQuotationID] = struct{}{}
	}
	for _, ln := range body.Lines {
		if ln.SourceQuotationLineID == nil || *ln.SourceQuotationLineID <= 0 {
			continue
		}
		var qid int64
		if err := pool.QueryRow(ctx,
			`select quotation_id from public.quo_quotation_lines where id = $1`,
			*ln.SourceQuotationLineID).Scan(&qid); err == nil && qid > 0 {
			quoIDs[qid] = struct{}{}
		}
	}
	return quoIDs
}

func enrichQuotationIDsFromPersistedLines(
	ctx context.Context,
	pool *pgxpool.Pool,
	salesOrderID int64,
	quoIDs map[int64]struct{},
) {
	rows, err := pool.Query(ctx, `
		select distinct ql.quotation_id
		from public.so_sales_order_lines sol
		join public.quo_quotation_lines ql on ql.id = sol.source_quotation_line_id
		where sol.sales_order_id = $1 and sol.source_quotation_line_id is not null`, salesOrderID)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var qid int64
		if rows.Scan(&qid) == nil && qid > 0 {
			quoIDs[qid] = struct{}{}
		}
	}
}

// countQuotationSourceAttachments returns how many files exist on quotations
// referenced by the create/update body (header + line FKs).
func countQuotationSourceAttachments(ctx context.Context, pool *pgxpool.Pool, body salesOrderBody) int {
	total := 0
	for qid := range quotationSourceIDsFromBody(ctx, pool, body) {
		n, err := attachmentx.Count(ctx, pool, "public.quo_quotation_attachments", "quotation_id", qid)
		if err == nil {
			total += n
		}
	}
	return total
}

// copyQuotationSourceAttachments copies quotation attachments onto a sales order.
func copyQuotationSourceAttachments(ctx context.Context, pool *pgxpool.Pool, tenantID, salesOrderID int64, body salesOrderBody) int {
	quoIDs := quotationSourceIDsFromBody(ctx, pool, body)
	enrichQuotationIDsFromPersistedLines(ctx, pool, salesOrderID, quoIDs)

	copied := 0
	for qid := range quoIDs {
		n, err := attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir: attachmentx.Dir("quotation"),
			DstBaseDir: attachmentx.Dir("sales_order"),
			SrcTable:   "public.quo_quotation_attachments",
			SrcFKCol:   "quotation_id",
			SrcID:      qid,
			DstTable:   "public.so_sales_order_attachments",
			DstFKCol:   "sales_order_id",
			DstID:      salesOrderID,
			TenantID:   tenantID,
		})
		if err != nil {
			log.Printf("sales_order: copy quotation %d attachments to SO %d: %v", qid, salesOrderID, err)
			continue
		}
		copied += n
	}
	return copied
}

// ensureQuotationSourceAttachments copies source files when the SO has none yet.
func ensureQuotationSourceAttachments(ctx context.Context, pool *pgxpool.Pool, tenantID, salesOrderID int64, body salesOrderBody) int {
	n, err := attachmentx.Count(ctx, pool, "public.so_sales_order_attachments", "sales_order_id", salesOrderID)
	if err != nil || n > 0 {
		return 0
	}
	return copyQuotationSourceAttachments(ctx, pool, tenantID, salesOrderID, body)
}

func salesOrderCreateMessage(copied int) string {
	if copied > 0 {
		return fmt.Sprintf("Created. Copied %d quotation attachment(s).", copied)
	}
	return "Created."
}
