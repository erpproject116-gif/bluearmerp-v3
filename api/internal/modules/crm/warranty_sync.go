package crm

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

type saleWarrantySerialUnit struct {
	unitID         int64
	salesLineID    int64
	partnerID      int64
	itemID         int64
	serialNo       string
	itemCode       string
	itemName       string
	picName        string
	orderDate      time.Time
	picUserID      *int64
	wStart         *time.Time
	wEnd           *time.Time
	warrantyMonths int
}

type saleWarrantyLotLine struct {
	lineID         int64
	itemID         *int64
	itemCode       string
	itemName       string
	serialLot      string
	partnerID      int64
	orderDate      time.Time
	picUserID      *int64
	picName        string
	warrantyMonths int
}

type receiptWarrantyUnit struct {
	unitID         int64
	itemID         int64
	grLineID       *int64
	partnerID      int64
	serialNo       string
	itemCode       string
	itemName       string
	wStart         time.Time
	wEnd           time.Time
	warrantyMonths int
}

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
	var units []saleWarrantySerialUnit
	for unitRows.Next() {
		var u saleWarrantySerialUnit
		if err := unitRows.Scan(&u.unitID, &u.serialNo, &u.itemID, &u.itemCode, &u.itemName, &u.wStart, &u.wEnd,
			&u.partnerID, &u.orderDate, &u.picUserID, &u.picName, &u.salesLineID, &u.warrantyMonths); err != nil {
			unitRows.Close()
			return 0, err
		}
		units = append(units, u)
	}
	if err := unitRows.Err(); err != nil {
		unitRows.Close()
		return 0, err
	}
	unitRows.Close()

	synced := 0
	for _, u := range units {
		start := u.orderDate
		if u.wStart != nil {
			start = *u.wStart
		}
		end := start.AddDate(0, u.warrantyMonths, 0)
		if u.wEnd != nil {
			end = *u.wEnd
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
			on conflict (tenant_id, serial_no) where (status <> 'void') do update set
			  partner_id = excluded.partner_id,
			  item_id = excluded.item_id,
			  item_code = excluded.item_code,
			  item_name = excluded.item_name,
			  sales_id = excluded.sales_id,
			  sales_line_id = excluded.sales_line_id,
			  serial_unit_id = excluded.serial_unit_id,
			  warranty_origin = 'sales',
			  warranty_start = excluded.warranty_start,
			  warranty_end = excluded.warranty_end,
			  status = excluded.status,
			  pic_user_id = excluded.pic_user_id,
			  pic_name = excluded.pic_name,
			  updated_at = now()`,
			tenantID, u.partnerID, u.itemID, strings.TrimSpace(u.itemCode), strings.TrimSpace(u.itemName), u.serialNo,
			salesID, u.salesLineID, u.unitID, start, end, status, u.picUserID, u.picName)
		if err != nil {
			return synced, fmt.Errorf("sync warranty asset %s: %w", u.serialNo, err)
		}
		synced++
	}
	if synced > 0 {
		return synced, nil
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
	var lotLines []saleWarrantyLotLine
	for rows.Next() {
		var ln saleWarrantyLotLine
		if err := rows.Scan(&ln.lineID, &ln.itemID, &ln.itemCode, &ln.itemName, &ln.serialLot, &ln.partnerID, &ln.orderDate, &ln.picUserID, &ln.picName, &ln.warrantyMonths); err != nil {
			rows.Close()
			return 0, err
		}
		lotLines = append(lotLines, ln)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	for _, ln := range lotLines {
		if strings.TrimSpace(ln.serialLot) == "" || ln.warrantyMonths <= 0 {
			continue
		}
		for _, serial := range splitSerials(ln.serialLot) {
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
				on conflict (tenant_id, serial_no) where (status <> 'void') do update set
				  partner_id = excluded.partner_id,
				  item_id = excluded.item_id,
				  item_code = excluded.item_code,
				  item_name = excluded.item_name,
				  sales_id = excluded.sales_id,
				  sales_line_id = excluded.sales_line_id,
				  warranty_origin = 'sales',
				  warranty_start = excluded.warranty_start,
				  warranty_end = excluded.warranty_end,
				  status = excluded.status,
				  pic_user_id = excluded.pic_user_id,
				  pic_name = excluded.pic_name,
				  updated_at = now()`,
				tenantID, ln.partnerID, ln.itemID, strings.TrimSpace(ln.itemCode), strings.TrimSpace(ln.itemName), serial,
				salesID, ln.lineID, ln.orderDate, ln.warrantyMonths, ln.picUserID, ln.picName)
			if err != nil {
				return synced, fmt.Errorf("sync warranty asset %s: %w", serial, err)
			}
			synced++
		}
	}
	return synced, nil
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
	var units []receiptWarrantyUnit
	for rows.Next() {
		var unitID, itemID int64
		var grLineID *int64
		var partnerID *int64
		var serialNo, itemCode, itemName string
		var wStart, wEnd *time.Time
		var warrantyMonths int
		if err := rows.Scan(&unitID, &serialNo, &itemID, &itemCode, &itemName, &wStart, &wEnd,
			&partnerID, &grLineID, &warrantyMonths); err != nil {
			rows.Close()
			return err
		}
		if partnerID == nil || wStart == nil || wEnd == nil {
			continue
		}
		units = append(units, receiptWarrantyUnit{
			unitID:         unitID,
			itemID:         itemID,
			grLineID:       grLineID,
			partnerID:      *partnerID,
			serialNo:       serialNo,
			itemCode:       itemCode,
			itemName:       itemName,
			wStart:         *wStart,
			wEnd:           *wEnd,
			warrantyMonths: warrantyMonths,
		})
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return err
	}
	rows.Close()

	for _, u := range units {
		status := "active"
		if u.wEnd.Before(time.Now().Truncate(24 * time.Hour)) {
			status = "expired"
		}
		_, err := tx.Exec(ctx, `
			insert into public.crm_warranty_assets (
			  tenant_id, partner_id, item_id, item_code, item_name, serial_no,
			  serial_unit_id, warranty_origin, goods_receipt_line_id,
			  warranty_start, warranty_end, status
			) values ($1,$2,$3,$4,$5,$6,$7,'receipt',$8,$9,$10,$11)
			on conflict (tenant_id, serial_no) where (status <> 'void') do update set
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
			tenantID, u.partnerID, u.itemID, strings.TrimSpace(u.itemCode), strings.TrimSpace(u.itemName), u.serialNo,
			u.unitID, u.grLineID, u.wStart, u.wEnd, status)
		if err != nil {
			return fmt.Errorf("sync warranty asset %s: %w", u.serialNo, err)
		}
	}
	return nil
}
