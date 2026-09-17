package sales

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/attachmentx"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

// countSaleSourceAttachments returns how many files exist on the SO / quotation
// documents referenced by the create/update body (header + line FKs).
func countSaleSourceAttachments(ctx context.Context, pool *pgxpool.Pool, body saleBody) int {
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
	enrichQuotationIDsFromSalesOrders(ctx, pool, soIDs, quoIDs)
	total := 0
	for soID := range soIDs {
		n, err := attachmentx.Count(ctx, pool, "public.so_sales_order_attachments", "sales_order_id", soID)
		if err == nil {
			total += n
		}
	}
	for quoID := range quoIDs {
		n, err := attachmentx.Count(ctx, pool, "public.quo_quotation_attachments", "quotation_id", quoID)
		if err == nil {
			total += n
		}
	}
	return total
}

// ensureSaleSourceAttachments copies source attachments when the sale has none yet
// (covers update-after-create and older rows created before copy ran).
func ensureSaleSourceAttachments(ctx context.Context, pool *pgxpool.Pool, tenantID, saleID int64, body saleBody) int {
	n, err := attachmentx.Count(ctx, pool, "public.sa_sales_attachments", "sales_id", saleID)
	if err != nil || n > 0 {
		return 0
	}
	return copySaleSourceAttachments(ctx, pool, tenantID, saleID, body)
}

func normalizeCustomLabel(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// mergeSaleSourceCustomValues fills missing sales custom field values from the
// source SO and/or quotation (match by field_key, then by normalized label).
func mergeSaleSourceCustomValues(ctx context.Context, pool *pgxpool.Pool, tenantID int64, body saleBody) map[string]any {
	out := map[string]any{}
	for k, v := range body.CustomValues {
		out[k] = v
	}

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
	enrichQuotationIDsFromSalesOrders(ctx, pool, soIDs, quoIDs)

	dstDefs, err := customfields.ListDefinitions(ctx, pool, tenantID, entitySales, true)
	if err != nil || len(dstDefs) == 0 {
		return out
	}
	dstByKey := map[string]customfields.Definition{}
	dstByLabel := map[string]customfields.Definition{}
	for _, d := range dstDefs {
		dstByKey[d.FieldKey] = d
		if lab := normalizeCustomLabel(d.Label); lab != "" {
			dstByLabel[lab] = d
		}
	}

	applySrc := func(entityType string, entityID int64) {
		vals, err := customfields.LoadValues(ctx, pool, tenantID, entityType, entityID)
		if err != nil || len(vals) == 0 {
			return
		}
		srcDefs, _ := customfields.ListDefinitions(ctx, pool, tenantID, entityType, true)
		srcLabelByKey := map[string]string{}
		for _, d := range srcDefs {
			srcLabelByKey[d.FieldKey] = d.Label
		}
		for key, val := range vals {
			if val == nil {
				continue
			}
			if _, occupied := out[key]; occupied {
				continue
			}
			if _, ok := dstByKey[key]; ok {
				out[key] = val
				continue
			}
			lab := normalizeCustomLabel(srcLabelByKey[key])
			if lab == "" {
				continue
			}
			if dst, ok := dstByLabel[lab]; ok {
				if _, occupied := out[dst.FieldKey]; occupied {
					continue
				}
				out[dst.FieldKey] = val
			}
		}
	}

	// Quotation first, then SO (SO wins on conflicts for keys already empty).
	for quoID := range quoIDs {
		applySrc("quo_quotation", quoID)
	}
	for soID := range soIDs {
		applySrc("so_sales_order", soID)
	}
	return out
}
