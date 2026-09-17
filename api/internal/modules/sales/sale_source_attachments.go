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

// enrichQuotationIDsFromSalesOrders pulls quotation ids linked via SO header
// and SO lines (so Load Slip → Sales Order still copies Quotation files even when
// sale lines only carry source_sales_order_line_id).
func enrichQuotationIDsFromSalesOrders(
	ctx context.Context,
	pool *pgxpool.Pool,
	soIDs, quoIDs map[int64]struct{},
) {
	for soID := range soIDs {
		var headerQuo *int64
		_ = pool.QueryRow(ctx,
			`select source_quotation_id from public.so_sales_orders where id = $1`, soID).Scan(&headerQuo)
		if headerQuo != nil && *headerQuo > 0 {
			quoIDs[*headerQuo] = struct{}{}
		}
		rows, err := pool.Query(ctx, `
			select distinct ql.quotation_id
			from public.so_sales_order_lines sol
			join public.quo_quotation_lines ql on ql.id = sol.source_quotation_line_id
			where sol.sales_order_id = $1 and sol.source_quotation_line_id is not null`, soID)
		if err != nil {
			continue
		}
		for rows.Next() {
			var quoID int64
			if rows.Scan(&quoID) == nil && quoID > 0 {
				quoIDs[quoID] = struct{}{}
			}
		}
		rows.Close()
	}
}

func saleAttachmentFileNames(ctx context.Context, pool *pgxpool.Pool, saleID int64) map[string]struct{} {
	out := map[string]struct{}{}
	rows, err := pool.Query(ctx,
		`select file_name from public.sa_sales_attachments where sales_id = $1`, saleID)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil && name != "" {
			out[name] = struct{}{}
		}
	}
	return out
}

// copySaleSourceAttachments copies SO/quotation attachments onto a new sale.
// Best-effort: logs failures and returns total successfully copied file count.
// Quotation files already present via SO copy are skipped (same file_name).
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
	enrichQuotationIDsFromSalesOrders(ctx, pool, soIDs, quoIDs)

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
	existing := saleAttachmentFileNames(ctx, pool, saleID)
	for quoID := range quoIDs {
		n, err := attachmentx.Copy(ctx, pool, attachmentx.CopyParams{
			SrcBaseDir:    attachmentx.Dir("quotation"),
			DstBaseDir:    attachmentx.Dir("sales"),
			SrcTable:      "public.quo_quotation_attachments",
			SrcFKCol:      "quotation_id",
			SrcID:         quoID,
			DstTable:      "public.sa_sales_attachments",
			DstFKCol:      "sales_id",
			DstID:         saleID,
			TenantID:      tenantID,
			SkipFileNames: existing,
		})
		if err != nil {
			log.Printf("sales.create: copy quotation %d attachments to sale %d: %v", quoID, saleID, err)
			continue
		}
		copied += n
		// Refresh names so a second quotation doesn't re-copy the same file_name.
		existing = saleAttachmentFileNames(ctx, pool, saleID)
	}
	return copied
}

func saleCreateMessage(copied int) string {
	if copied > 0 {
		return fmt.Sprintf("Created. Copied %d attachment(s) from source document(s).", copied)
	}
	return "Created."
}
