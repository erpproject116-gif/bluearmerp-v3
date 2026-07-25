package inventory

import (
	"context"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

// fakeUnitDB answers just the queries ConvertQty / ItemBaseUnit issue, so the
// stock-boundary conversion rules can be exercised without a database.
type fakeUnitDB struct {
	// conversions maps "from->to" to a factor.
	conversions map[[2]int64]float64
	// itemBaseUnit maps item id to its base unit id.
	itemBaseUnit map[int64]int64
	codes        map[int64]string
}

type fakeRow struct {
	values []any
	err    error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	if len(dest) != len(r.values) {
		return pgx.ErrNoRows
	}
	for i, d := range dest {
		switch target := d.(type) {
		case *float64:
			*target = r.values[i].(float64)
		case *int64:
			*target = r.values[i].(int64)
		case *string:
			*target = r.values[i].(string)
		default:
			return pgx.ErrNoRows
		}
	}
	return nil
}

func (f *fakeUnitDB) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	switch {
	case strings.Contains(sql, "inv_unit_conversions"):
		from := args[1].(int64)
		to := args[2].(int64)
		factor, ok := f.conversions[[2]int64{from, to}]
		if !ok {
			return fakeRow{err: pgx.ErrNoRows}
		}
		return fakeRow{values: []any{factor}}
	case strings.Contains(sql, "coalesce(i.base_unit_id, 0)"):
		itemID := args[0].(int64)
		baseUnitID := f.itemBaseUnit[itemID]
		return fakeRow{values: []any{baseUnitID, f.codes[baseUnitID]}}
	case strings.Contains(sql, "select code from public.inv_units"):
		id := args[0].(int64)
		return fakeRow{values: []any{f.codes[id]}}
	}
	return fakeRow{err: pgx.ErrNoRows}
}

func newFakeUnitDB() *fakeUnitDB {
	return &fakeUnitDB{
		// 1 box = 12 ea.
		conversions:  map[[2]int64]float64{{2, 1}: 12},
		itemBaseUnit: map[int64]int64{100: 1, 200: 0},
		codes:        map[int64]string{1: "ea", 2: "box"},
	}
}

func TestConvertQty(t *testing.T) {
	ctx := context.Background()
	db := newFakeUnitDB()

	if got, err := ConvertQty(ctx, db, 1, 1, 1, 5); err != nil || got != 5 {
		t.Fatalf("same unit: got %v, err %v", got, err)
	}
	if got, err := ConvertQty(ctx, db, 1, 2, 1, 3); err != nil || got != 36 {
		t.Fatalf("box->ea: got %v, err %v", got, err)
	}
	if got, err := ConvertQty(ctx, db, 1, 1, 2, 24); err != nil || got != 2 {
		t.Fatalf("ea->box via inverse: got %v, err %v", got, err)
	}
	if _, err := ConvertQty(ctx, db, 1, 3, 1, 1); err == nil {
		t.Fatal("missing conversion should fail closed")
	}
	if _, err := ConvertQty(ctx, db, 1, 0, 1, 1); err == nil {
		t.Fatal("missing unit should fail closed")
	}
}

func TestBaseQtyForLine(t *testing.T) {
	ctx := context.Background()
	db := newFakeUnitDB()
	boxUnit := int64(2)
	eaUnit := int64(1)
	unknownUnit := int64(9)

	if got, err := BaseQtyForLine(ctx, db, 1, 100, nil, 7); err != nil || got != 7 {
		t.Fatalf("no line unit passes through: got %v, err %v", got, err)
	}
	if got, err := BaseQtyForLine(ctx, db, 1, 100, &eaUnit, 7); err != nil || got != 7 {
		t.Fatalf("line unit equals base unit: got %v, err %v", got, err)
	}
	if got, err := BaseQtyForLine(ctx, db, 1, 100, &boxUnit, 2); err != nil || got != 24 {
		t.Fatalf("box line on ea item: got %v, err %v", got, err)
	}
	if _, err := BaseQtyForLine(ctx, db, 1, 100, &unknownUnit, 2); err == nil {
		t.Fatal("unknown conversion should fail closed")
	}
	if _, err := BaseQtyForLine(ctx, db, 1, 200, &boxUnit, 2); err == nil {
		t.Fatal("item without base unit should fail closed")
	}
}
