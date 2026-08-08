package sales

import (
	"context"
	"fmt"
	"log"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
)

// sourceAttachmentDocIDsFromBody collects SO / quotation ids from create request
// header + line FKs. Line FKs require a DB lookup (passed in via resolve callbacks
// when used from copySaleSourceAttachments).
func sourceAttachmentDocIDsFromBody(
	body saleBody,
	resolveSOLine func(lineID int64) (soID int64, ok bool),
	resolveQuoLine func(lineID int64) (quoID int64, ok bool),
) (soIDs map[int64]struct{}, quoIDs map[int64]struct{}) {
	soIDs = map[int64]struct{}{}
	quoIDs = map[int64]struct{}{}
	if body.SourceSalesOrderID != nil && *body.SourceSalesOrderID > 0 {
		soIDs[*body.SourceSalesOrderID] = struct{}{}
	}
	for _, ln := range body.Lines {
		if ln.SourceSalesOrderLineID != nil && *ln.SourceSalesOrderLineID > 0 && resolveSOLine != nil {
			if soID, ok := resolveSOLine(*ln.SourceSalesOrderLineID); ok && soID > 0 {
				soIDs[soID] = struct{}{}
			}
		}
		if ln.SourceQuotationLineID != nil && *ln.SourceQuotationLineID > 0 && resolveQuoLine != nil {
			if quoID, ok := resolveQuoLine(*ln.SourceQuotationLineID); ok && quoID > 0 {
				quoIDs[quoID] = struct{}{}
			}
		}
	}
	return soIDs, quoIDs
}

func enrichSourceDocIDsFromPersistedLines(
	ctx context.Context,
	pool *pgxpool.Pool,
	saleID int64,
	soIDs, quoIDs map[int64]struct{},
) {
	soRows, err := pool.Query(ctx, `
		select distinct sol.sales_order_id
		from public.sa_sales_lines sl
		join public.so_sales_order_lines sol on sol.id = sl.source_sales_order_line_id
		where sl.sales_id = $1 and sl.source_sales_order_line_id is not null`, saleID)
	if err == nil {
		defer soRows.Close()
		for soRows.Next() {
			var soID int64
			if soRows.Scan(&soID) == nil && soID > 0 {
				soIDs[soID] = struct{}{}
			}
		}
	}
	quoRows, err := pool.Query(ctx, `
		select distinct ql.quotation_id
		from public.sa_sales_lines sl
		join public.quo_quotation_lines ql on ql.id = sl.source_quotation_line_id
		where sl.sales_id = $1 and sl.source_quotation_line_id is not null`, saleID)
	if err == nil {
		defer quoRows.Close()
		for quoRows.Next() {
			var quoID int64
			if quoRows.Scan(&quoID) == nil && quoID > 0 {
				quoIDs[quoID] = struct{}{}
			}
		}
	}
}

// copySaleSourceAttachments copies SO/quotation attachments onto a new sale.
// Best-effort: logs failures and returns total successfully copied file count.
func copySaleSourceAttachments(ctx context.Context, pool *pgxpool.Pool, tenantID, saleID int64, body saleBody) int {
	resolveSO := func(lineID int64) (int64, bool) {
		var soID int64
		err := pool.QueryRow(ctx,
			`select sales_order_id from public.so_sales_order_lines where id = $1`, lineID).Scan(&soID)
		return soID, err == nil && soID > 0
	}
	resolveQuo := func(lineID int64) (int64, bool) {
		var quoID int64
		err := pool.QueryRow(ctx,
			`select quotation_id from public.quo_quotation_lines where id = $1`, lineID).Scan(&quoID)
		return quoID, err == nil && quoID > 0
	}
	soIDs, quoIDs := sourceAttachmentDocIDsFromBody(body, resolveSO, resolveQuo)
	enrichSourceDocIDsFromPersistedLines(ctx, pool, saleID, soIDs, quoIDs)

	copied := 0
	for soID := range soIDs {
		n, err := attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir: attachmentx.Dir("sales_order"),
			DstBaseDir: attachmentx.Dir("sales"),
			SrcTable:   "public.so_sales_order_attachments",
			SrcFKCol:   "sales_order_id",
			SrcID:      soID,
			DstTable:   "public.sa_sales_attachments",
			DstFKCol:   "sales_id",
			DstID:      saleID,
			TenantID:   tenantID,
		})
		if err != nil {
			log.Printf("sales.create: copy SO %d attachments to sale %d: %v", soID, saleID, err)
			continue
		}
		copied += n
	}
	for quoID := range quoIDs {
		n, err := attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir: attachmentx.Dir("quotation"),
			DstBaseDir: attachmentx.Dir("sales"),
			SrcTable:   "public.quo_quotation_attachments",
			SrcFKCol:   "quotation_id",
			SrcID:      quoID,
			DstTable:   "public.sa_sales_attachments",
			DstFKCol:   "sales_id",
			DstID:      saleID,
			TenantID:   tenantID,
		})
		if err != nil {
			log.Printf("sales.create: copy quotation %d attachments to sale %d: %v", quoID, saleID, err)
			continue
		}
		copied += n
	}
	return copied
}

func saleCreateMessage(copied int) string {
	if copied > 0 {
		return fmt.Sprintf("Created. Copied %d attachment(s) from source document(s).", copied)
	}
	return "Created."
}
