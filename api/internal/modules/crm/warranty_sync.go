package crm

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// SyncWarrantyAssetsFromSale upserts crm_warranty_assets from sales lines with serial numbers.
func SyncWarrantyAssetsFromSale(ctx context.Context, tx pgx.Tx, tenantID, salesID int64) (int, error) {
	unitRows, err := tx.Query(ctx, `
		select
		  su.id, su.serial_no, su.item_id, i.item_code, i.item_name,
		  su.warranty_start, su.warranty_end,
		  s.partner_id, s.order_date, s.pic_user_id, coalesce(s.pic_name, ''),
		  ln.id as sales_line_id,
		  coalesce(i.warranty_duration_months, 0)
		from public.inv_serial_unit_sales_lines j
		join public.inv_serial_units su on su.id = j.serial_unit_id
		join public.sa_sales_lines ln on ln.id = j.sales_line_id
		join public.sa_sales s on s.id = ln.sales_id and s.tenant_id = $2
		join public.inv_items i on i.id = su.item_id
		where s.id = $1`, salesID, tenantID)
	if err != nil {
		return 0, err
	}
	defer unitRows.Close()

	synced := 0
	for unitRows.Next() {
		var unitID, salesLineID, partnerID int64
		var itemID int64
		var serialNo, itemCode, itemName, picName string
		var wStart, wEnd *time.Time
		var orderDate time.Time
		var picUserID *int64
		var warrantyMonths int
		if err := unitRows.Scan(&unitID, &serialNo, &itemID, &itemCode, &itemName, &wStart, &wEnd,
			&partnerID, &orderDate, &picUserID, &picName, &salesLineID, &warrantyMonths); err != nil {
			return synced, err
		}
		start := orderDate
		if wStart != nil {
			start = *wStart
		}
		end := start.AddDate(0, warrantyMonths, 0)
		if wEnd != nil {
			end = *wEnd
		}
		status := "active"
		if end.Before(time.Now().Truncate(24 * time.Hour)) {
			status = "expired"
		}
		_, err := tx.Exec(ctx, `
			insert into public.crm_warranty_assets (
			  tenant_id, partner_id, item_id, item_code, item_name, serial_no,
			  sales_id, sales_line_id, serial_unit_id, warranty_origin,
			  warranty_start, warranty_end, status,
			  pic_user_id, pic_name
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sales',$10,$11,$12,$13,$14)
			on conflict (tenant_id, sales_line_id, serial_no) do update set
			  partner_id = excluded.partner_id,
			  item_id = excluded.item_id,
			  item_code = excluded.item_code,
			  item_name = excluded.item_name,
			  serial_unit_id = excluded.serial_unit_id,
			  warranty_start = excluded.warranty_start,
			  warranty_end = excluded.warranty_end,
			  status = excluded.status,
			  pic_user_id = excluded.pic_user_id,
			  pic_name = excluded.pic_name,
			  updated_at = now()`,
			tenantID, partnerID, itemID, strings.TrimSpace(itemCode), strings.TrimSpace(itemName), serialNo,
			salesID, salesLineID, unitID, start, end, status, picUserID, picName)
		if err != nil {
			return synced, fmt.Errorf("sync warranty asset %s: %w", serialNo, err)
		}
		synced++
	}
	if synced > 0 {
		return synced, unitRows.Err()
	}

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
				  sales_id, sales_line_id, warranty_origin, warranty_start, warranty_end, status,
				  pic_user_id, pic_name
				) values (
				  $1, $2, $3, $4, $5, $6,
				  $7, $8, 'sales', $9::date,
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

// SyncWarrantyAssetsFromGoodsReceipt upserts crm_warranty_assets for GR serial units with warranty months.
func SyncWarrantyAssetsFromGoodsReceipt(ctx context.Context, tx pgx.Tx, tenantID, grID int64) error {
	rows, err := tx.Query(ctx, `
		select
		  su.id, su.serial_no, su.item_id, i.item_code, i.item_name,
		  su.warranty_start, su.warranty_end, su.partner_id, su.goods_receipt_line_id,
		  coalesce(i.warranty_duration_months, 0)
		from public.inv_serial_units su
		join public.gr_goods_receipt_lines grl on grl.id = su.goods_receipt_line_id
		join public.inv_items i on i.id = su.item_id
		where grl.goods_receipt_id = $1 and su.tenant_id = $2
		  and coalesce(i.warranty_duration_months, 0) > 0`, grID, tenantID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var unitID, itemID int64
		var grLineID *int64
		var partnerID *int64
		var serialNo, itemCode, itemName string
		var wStart, wEnd *time.Time
		var warrantyMonths int
		if err := rows.Scan(&unitID, &serialNo, &itemID, &itemCode, &itemName, &wStart, &wEnd,
			&partnerID, &grLineID, &warrantyMonths); err != nil {
			return err
		}
		if partnerID == nil || wStart == nil || wEnd == nil {
			continue
		}
		status := "active"
		if wEnd.Before(time.Now().Truncate(24 * time.Hour)) {
			status = "expired"
		}
		_, err := tx.Exec(ctx, `
			insert into public.crm_warranty_assets (
			  tenant_id, partner_id, item_id, item_code, item_name, serial_no,
			  serial_unit_id, warranty_origin, goods_receipt_line_id,
			  warranty_start, warranty_end, status
			) values ($1,$2,$3,$4,$5,$6,$7,'receipt',$8,$9,$10,$11)
			on conflict (tenant_id, serial_no) do update set
			  partner_id = excluded.partner_id,
			  item_id = excluded.item_id,
			  item_code = excluded.item_code,
			  item_name = excluded.item_name,
			  serial_unit_id = excluded.serial_unit_id,
			  warranty_origin = excluded.warranty_origin,
			  goods_receipt_line_id = excluded.goods_receipt_line_id,
			  warranty_start = excluded.warranty_start,
			  warranty_end = excluded.warranty_end,
			  status = excluded.status,
			  updated_at = now()`,
			tenantID, *partnerID, itemID, strings.TrimSpace(itemCode), strings.TrimSpace(itemName), serialNo,
			unitID, grLineID, *wStart, *wEnd, status)
		if err != nil {
			return fmt.Errorf("sync warranty asset %s: %w", serialNo, err)
		}
	}
	return rows.Err()
}
