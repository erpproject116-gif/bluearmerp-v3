package salesorder

import (
	"context"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/customfields"
)

const entitySalesOrder = "so_sales_order"

func attachCustom(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64) map[string]any {
	vals, err := customfields.LoadValues(ctx, pool, tenantID, entityType, entityID)
	if err != nil || len(vals) == 0 {
		return nil
	}
	return vals
}

func saveCustom(ctx context.Context, tx pgx.Tx, tenantID int64, entityType string, entityID int64, values map[string]any) map[string]string {
	return customfields.ValidateAndSave(ctx, tx, tenantID, entityType, entityID, values)
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

// mergeCustomFromQuotation fills empty SO custom fields from the source quotation
// (match by field_key, then by normalized label).
func mergeCustomFromQuotation(ctx context.Context, pool *pgxpool.Pool, tenantID, quotationID int64, existing map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range existing {
		out[k] = v
	}
	srcVals, err := customfields.LoadValues(ctx, pool, tenantID, "quo_quotation", quotationID)
	if err != nil || len(srcVals) == 0 {
		return out
	}
	dstDefs, err := customfields.ListDefinitions(ctx, pool, tenantID, entitySalesOrder, true)
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
	srcDefs, _ := customfields.ListDefinitions(ctx, pool, tenantID, "quo_quotation", true)
	srcLabelByKey := map[string]string{}
	for _, d := range srcDefs {
		srcLabelByKey[d.FieldKey] = d.Label
	}
	for key, val := range srcVals {
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
	return out
}
