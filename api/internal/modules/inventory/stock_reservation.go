package inventory

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// AvailableAtLocation returns qty_on_hand minus qty_reserved for picking / release checks.
func AvailableAtLocation(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64) (float64, error) {
	var onHand, reserved float64
	err := tx.QueryRow(ctx, `
		select coalesce(qty_on_hand, 0)::float8, coalesce(qty_reserved, 0)::float8
		from public.inv_item_location_balances
		where tenant_id = $1 and item_id = $2 and location_id = $3
		for update`, tenantID, itemID, locationID).Scan(&onHand, &reserved)
	if err != nil {
		return 0, err
	}
	return onHand - reserved, nil
}

// ReserveStock increments qty_reserved without changing qty_on_hand (split release mode).
func ReserveStock(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, qty float64) error {
	available, err := AvailableAtLocation(ctx, tx, tenantID, itemID, locationID)
	if err != nil {
		return fmt.Errorf("no balance record")
	}
	if available+0.0001 < qty {
		return fmt.Errorf("insufficient available stock (%.4f)", available)
	}
	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_reserved = qty_reserved + $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		qty, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		return fmt.Errorf("failed to reserve stock")
	}
	return nil
}

// UnreserveStock reverses a reservation increment.
func UnreserveStock(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, qty float64) error {
	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_reserved = greatest(qty_reserved - $1, 0), updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		qty, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		_, err = tx.Exec(ctx, `
			insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand, qty_reserved)
			values ($1, $2, $3, 0, 0)
			on conflict (tenant_id, item_id, location_id) do nothing`,
			tenantID, itemID, locationID)
		return err
	}
	return nil
}

// IssueReservedStock deducts on-hand and reserved qty (delivery receipt post in split mode).
func IssueReservedStock(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, qty float64) error {
	var onHand, reserved float64
	err := tx.QueryRow(ctx, `
		select coalesce(qty_on_hand, 0)::float8, coalesce(qty_reserved, 0)::float8
		from public.inv_item_location_balances
		where tenant_id = $1 and item_id = $2 and location_id = $3
		for update`, tenantID, itemID, locationID).Scan(&onHand, &reserved)
	if err != nil {
		return fmt.Errorf("no balance record")
	}
	if onHand+0.0001 < qty {
		return fmt.Errorf("insufficient on-hand stock (%.4f)", onHand)
	}
	if reserved+0.0001 < qty {
		return fmt.Errorf("insufficient reserved stock (%.4f)", reserved)
	}
	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand - $1,
		    qty_reserved = qty_reserved - $1,
		    updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		qty, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		return fmt.Errorf("failed to issue stock")
	}
	return nil
}

// DeductOnHandStock deducts qty_on_hand only (legacy combined release mode).
func DeductOnHandStock(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, qty float64) error {
	var onHand float64
	err := tx.QueryRow(ctx, `
		select qty_on_hand::float8
		from public.inv_item_location_balances
		where tenant_id = $1 and item_id = $2 and location_id = $3
		for update`, tenantID, itemID, locationID).Scan(&onHand)
	if err != nil {
		return fmt.Errorf("no balance record")
	}
	if onHand+0.0001 < qty {
		return fmt.Errorf("not enough stock (%.4f on hand)", onHand)
	}
	tag, err := tx.Exec(ctx, `
		update public.inv_item_location_balances
		set qty_on_hand = qty_on_hand - $1, updated_at = now()
		where tenant_id = $2 and item_id = $3 and location_id = $4`,
		qty, tenantID, itemID, locationID)
	if err != nil || tag.RowsAffected() == 0 {
		return fmt.Errorf("failed to update stock")
	}
	return nil
}

// RestoreOnHandStock restores qty_on_hand (legacy release undo).
func RestoreOnHandStock(ctx context.Context, tx pgx.Tx, tenantID, itemID, locationID int64, qty float64) error {
	_, err := tx.Exec(ctx, `
		insert into public.inv_item_location_balances (tenant_id, item_id, location_id, qty_on_hand, qty_reserved)
		values ($1, $2, $3, $4, 0)
		on conflict (tenant_id, item_id, location_id)
		do update set qty_on_hand = inv_item_location_balances.qty_on_hand + excluded.qty_on_hand, updated_at = now()`,
		tenantID, itemID, locationID, qty)
	return err
}
