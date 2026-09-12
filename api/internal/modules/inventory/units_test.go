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
		codes:        map[int64]string{1: "ea", 2: "box", 3: "pc", 4: "dozen"},
	}
}

func TestUnitsAreEachLike(t *testing.T) {
	if !UnitsAreEachLike("EA", "pc") || !UnitsAreEachLike("pcs", "piece") {
		t.Fatal("expected each-like synonyms to match")
	}
	if UnitsAreEachLike("ea", "box") || UnitsAreEachLike("kg", "pc") {
		t.Fatal("non-each pairs must not match")
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
	if got, err := ConvertQty(ctx, db, 1, 3, 1, 7); err != nil || got != 7 {
		t.Fatalf("pc->ea each-like: got %v, err %v", got, err)
	}
	if got, err := ConvertQty(ctx, db, 1, 1, 3, 4); err != nil || got != 4 {
		t.Fatalf("ea->pc each-like: got %v, err %v", got, err)
	}
	if _, err := ConvertQty(ctx, db, 1, 4, 1, 1); err == nil {
		t.Fatal("dozen->ea without conversion should fail closed")
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
	pcUnit := int64(3)
	unknownUnit := int64(9)

	if got, err := BaseQtyForLine(ctx, db, 1, 100, nil, 7); err != nil || got != 7 {
		t.Fatalf("no line unit passes through: got %v, err %v", got, err)
	}
	if got, err := BaseQtyForLine(ctx, db, 1, 100, &eaUnit, 7); err != nil || got != 7 {
		t.Fatalf("line unit equals base unit: got %v, err %v", got, err)
	}
	if got, err := BaseQtyForLine(ctx, db, 1, 100, &pcUnit, 5); err != nil || got != 5 {
		t.Fatalf("pc line on ea item: got %v, err %v", got, err)
	}
	if got, err := BaseQtyForLine(ctx, db, 1, 100, &boxUnit, 2); err != nil || got != 24 {
		t.Fatalf("box line on ea item: got %v, err %v", got, err)
	}
	if _, err := BaseQtyForLine(ctx, db, 1, 100, &unknownUnit, 2); err == nil {
		t.Fatal("unknown conversion should fail closed")
	}
	// Items with no base unit still accept document qty (demo / incomplete masters).
	if got, err := BaseQtyForLine(ctx, db, 1, 200, &boxUnit, 2); err != nil || got != 2 {
		t.Fatalf("item without base unit should pass qty through: got %v, err %v", got, err)
	}
}

func TestPreferStockLineUnit(t *testing.T) {
	ctx := context.Background()
	db := newFakeUnitDB()
	itemID := int64(100)
	pcUnit := int64(3)
	boxUnit := int64(2)
	dozenUnit := int64(4)

	id, code, err := PreferStockLineUnit(ctx, db, 1, &itemID, &pcUnit, "pc")
	if err != nil || id == nil || *id != 1 || code == nil || *code != "ea" {
		t.Fatalf("pc should coerce to ea: id=%v code=%v err=%v", id, code, err)
	}
	id, code, err = PreferStockLineUnit(ctx, db, 1, &itemID, nil, "")
	if err != nil || id == nil || *id != 1 || code == nil || *code != "ea" {
		t.Fatalf("null unit should use base: id=%v code=%v err=%v", id, code, err)
	}
	id, code, err = PreferStockLineUnit(ctx, db, 1, &itemID, &boxUnit, "box")
	if err != nil || id == nil || *id != 2 {
		t.Fatalf("box with conversion should keep: id=%v code=%v err=%v", id, code, err)
	}
	if _, _, err = PreferStockLineUnit(ctx, db, 1, &itemID, &dozenUnit, "dozen"); err == nil {
		t.Fatal("dozen without conversion should fail at save")
	}
	noBase := int64(200)
	if _, _, err = PreferStockLineUnit(ctx, db, 1, &noBase, nil, ""); err == nil {
		t.Fatal("item without base unit should fail")
	}
}

func TestRequireItemBaseUnit(t *testing.T) {
	ctx := context.Background()
	db := newFakeUnitDB()
	if id, code, err := RequireItemBaseUnit(ctx, db, 1, 100); err != nil || id != 1 || code != "ea" {
		t.Fatalf("got id=%d code=%q err=%v", id, code, err)
	}
	if _, _, err := RequireItemBaseUnit(ctx, db, 1, 200); err == nil {
		t.Fatal("expected missing base unit error")
	}
}
