package fiscalyear

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type stubQuerier struct {
	yearCode   string
	periodCode string
	err        error
}

func (s stubQuerier) QueryRow(ctx context.Context, sql string, args ...any) pgx.Row {
	return stubRow{s: s, sql: sql}
}

type stubRow struct {
	s   stubQuerier
	sql string
}

func (r stubRow) Scan(dest ...any) error {
	if r.s.err != nil {
		return r.s.err
	}
	if len(dest) == 0 {
		return nil
	}
	code := ""
	if strings.Contains(r.sql, "fin_fiscal_years") {
		code = r.s.yearCode
	} else {
		code = r.s.periodCode
	}
	if code == "" {
		return pgx.ErrNoRows
	}
	*(dest[0].(*string)) = code
	return nil
}

func TestAssertDocDateOpen_yearClosed(t *testing.T) {
	q := stubQuerier{yearCode: "2026"}
	err := AssertDocDateOpen(context.Background(), q, 1, time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC))
	if err == nil {
		t.Fatal("expected closed year error")
	}
	fe := FieldErrorIfClosed(context.Background(), q, 1, time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC), "order_date")
	if fe["order_date"] == "" {
		t.Fatal("expected field error")
	}
}

func TestAssertDocDateOpen_periodClosed(t *testing.T) {
	q := stubQuerier{periodCode: "2026-09"}
	if err := AssertDocDateOpen(context.Background(), q, 1, time.Date(2026, 9, 15, 0, 0, 0, 0, time.UTC)); err == nil {
		t.Fatal("expected closed period error")
	}
}

func TestAssertDocDateOpen_open(t *testing.T) {
	q := stubQuerier{}
	if err := AssertDocDateOpen(context.Background(), q, 1, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatalf("open period: %v", err)
	}
}
