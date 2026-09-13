package notify

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
)

// activityBellAudienceUserIDs resolves per-user bell recipients for high-value audit
// events. Replaces tenant-wide user_id=null rows (Epic 7).
//
// Epic 9 (all-hands meetings): intentional tenant-wide broadcasts must use a dedicated
// insert path — not this helper — so meeting rows are not treated as activity noise.
func activityBellAudienceUserIDs(ctx context.Context, pool *pgxpool.Pool, tenantID, actorUserID int64, actionCode, targetType string) []int64 {
	perms := activityBellAudiencePermissions(actionCode, targetType)
	includeOwner := activityBellNotifyOwner(actionCode, targetType)
	if len(perms) == 0 && !includeOwner {
		return nil
	}

	seen := map[int64]struct{}{}
	var out []int64
	add := func(id int64) {
		if id <= 0 || id == actorUserID {
			return
		}
		if _, ok := seen[id]; ok {
			return
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}

	if len(perms) > 0 {
		rows, err := pool.Query(ctx, `
			select distinct u.id
			from public.users u
			join public.tenant_user_roles tur on tur.user_id = u.id and tur.tenant_id = $1
			join public.tenant_role_permissions trp
			  on trp.tenant_id = tur.tenant_id and trp.role_code = tur.role_code
			where u.tenant_id = $1 and u.status = 'active'
			  and trp.permission_code = any($2::text[])
			  and trp.access_level in ('read', 'write', 'submit')`,
			tenantID, perms)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var id int64
				if rows.Scan(&id) == nil {
					add(id)
				}
			}
		}
	}

	if includeOwner {
		var ownerID int64
		if err := pool.QueryRow(ctx, `
			select coalesce(t.owner_user_id, 0)
			from public.tenants t where t.id = $1`, tenantID).Scan(&ownerID); err == nil {
			add(ownerID)
		}
	}

	return out
}

func activityBellAudiencePermissions(actionCode, targetType string) []string {
	ac := strings.ToLower(strings.TrimSpace(actionCode))
	tt := strings.ToLower(strings.TrimSpace(targetType))

	switch {
	case strings.HasPrefix(ac, "manufacturing.") || tt == "mfg_work_order" || tt == "mfg_bom":
		return []string{"manufacturing.work_orders", "manufacturing.boms"}
	case strings.HasPrefix(ac, "quotation.") || tt == "quo_quotation" || tt == "quotation":
		return []string{"quotation", "quotation.quotations"}
	case strings.HasPrefix(ac, "sales_order.") || tt == "so_sales_order" || tt == "sa_sales_order" || tt == "sales_order":
		return []string{"sales_order", "sales_order.sales_orders"}
	case strings.HasPrefix(ac, "sales.") || tt == "sa_sales" || tt == "sa_sale" || tt == "sales":
		return []string{"sales", "sales.sales"}
	case strings.HasPrefix(ac, "goods_receipt.") || tt == "gr_goods_receipt":
		return []string{"purchase_order.goods_receipts", "purchase_order.purchase_orders"}
	case strings.HasPrefix(ac, "purchase_order.") || tt == "po_purchase_order" || tt == "purchase_order":
		return []string{"purchase_order.purchase_orders", "purchase_order.purchase_orders_from_quote"}
	case strings.HasPrefix(ac, "purchase_request.") || tt == "pr_purchase_request" || tt == "purchase_request":
		return []string{"purchase_request.purchase_requests"}
	case strings.HasPrefix(ac, "purchase.") || tt == "fin_supplier_invoice" || tt == "supplier_invoice":
		return []string{"purchases", "purchases.purchase_receive"}
	case strings.HasPrefix(ac, "finance."):
		return []string{"finance", "finance.acct_i"}
	case strings.HasPrefix(ac, "inventory."):
		return []string{"inventory", "inventory.stock_adjustments"}
	case strings.HasPrefix(ac, "delivery_receipt.") || tt == "dr_delivery_receipt":
		return []string{"delivery_receipt", "shipping"}
	case strings.HasPrefix(ac, "operations.") || tt == "wm_work_item":
		return []string{"operations", "operations.work_items"}
	case strings.HasPrefix(ac, "support.") || strings.HasPrefix(ac, "crm."):
		return []string{"crm", "support"}
	default:
		return nil
	}
}

func activityBellNotifyOwner(actionCode, targetType string) bool {
	ac := strings.ToLower(strings.TrimSpace(actionCode))
	if strings.Contains(ac, ".confirm") || strings.HasSuffix(ac, ".post") {
		return true
	}
	if strings.HasPrefix(ac, "finance.") || strings.HasPrefix(ac, "goods_receipt.") {
		return true
	}
	tt := strings.ToLower(strings.TrimSpace(targetType))
	if tt == "inv_stock_adjustment_request" || tt == "inv_serial_adjustment_request" {
		return true
	}
	return false
}

func activityBellDedupeKeyForUser(baseKey string, userID int64) string {
	return fmt.Sprintf("%s:u%d", baseKey, userID)
}
