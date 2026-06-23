package crm

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// SyncWarrantyAssetsFromSale upserts crm_warranty_assets from sales lines with serial numbers.
func SyncWarrantyAssetsFromSale(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) (int, error) {
	rows, err := tx.Query(ctx, `
		select
		  ln.id, ln.item_id, ln.item_code, ln.item_name, coalesce(ln.serial_lot_no, ''),
		  s.partner_id, s.order_date, s.pic_user_id, coalesce(s.pic_name, ''),
		  coalesce(i.warranty_duration_months, 0)
		from public.sa_sales_lines ln
		join public.sa_sales s on s.id = ln.sales_id and s.tenant_id = $2
		left join public.inv_items i on i.id = ln.item_id
		where ln.sales_id = $1`, salesID, tenantID)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	synced := 0
	for rows.Next() {
		var lineID int64
		var itemID *int64
		var itemCode, itemName, serialLot, picName string
		var partnerID int64
		var orderDate interface{}
		var picUserID *int64
		var warrantyMonths int
		if err := rows.Scan(&lineID, &itemID, &itemCode, &itemName, &serialLot, &partnerID, &orderDate, &picUserID, &picName, &warrantyMonths); err != nil {
			return synced, err
		}
		if strings.TrimSpace(serialLot) == "" || warrantyMonths <= 0 {
			continue
		}
		for _, serial := range splitSerials(serialLot) {
			_, err := tx.Exec(ctx, `
				insert into public.crm_warranty_assets (
				  tenant_id, partner_id, item_id, item_code, item_name, serial_no,
				  sales_id, sales_line_id, warranty_start, warranty_end, status,
				  pic_user_id, pic_name
				) values (
				  $1, $2, $3, $4, $5, $6,
				  $7, $8, $9::date,
				  ($9::date + make_interval(months => $10))::date,
				  case when ($9::date + make_interval(months => $10))::date < current_date then 'expired' else 'active' end,
				  $11, $12
				)
				on conflict (tenant_id, sales_line_id, serial_no) do update set
				  partner_id = excluded.partner_id,
				  item_id = excluded.item_id,
				  item_code = excluded.item_code,
				  item_name = excluded.item_name,
				  warranty_start = excluded.warranty_start,
				  warranty_end = excluded.warranty_end,
				  status = excluded.status,
				  pic_user_id = excluded.pic_user_id,
				  pic_name = excluded.pic_name,
				  updated_at = now()`,
				tenantID, partnerID, itemID, strings.TrimSpace(itemCode), strings.TrimSpace(itemName), serial,
				salesID, lineID, orderDate, warrantyMonths, picUserID, picName)
			if err != nil {
				return synced, fmt.Errorf("sync warranty asset %s: %w", serial, err)
			}
			synced++
		}
	}
	return synced, rows.Err()
}
