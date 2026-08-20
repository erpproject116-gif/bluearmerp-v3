package migration

import (
	"context"
	"fmt"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type mockCodeRow struct {
	exists bool
	alloc  string
	err    error
}

func (m mockCodeRow) Scan(dest ...any) error {
	if m.err != nil {
		return m.err
	}
	if len(dest) == 1 {
		if b, ok := dest[0].(*bool); ok {
			*b = m.exists
			return nil
		}
		if s, ok := dest[0].(*string); ok {
			*s = m.alloc
			return nil
		}
	}
	return fmt.Errorf("unexpected scan target")
}

type mockCodeQuerier struct {
	exists bool
	alloc  string
	calls  int
}

func (m *mockCodeQuerier) QueryRow(_ context.Context, sql string, _ ...any) pgx.Row {
	m.calls++
	if strings.Contains(sql, "exists") {
		return mockCodeRow{exists: m.exists}
	}
	return mockCodeRow{alloc: m.alloc}
}

func TestResolveEntityCodeUsesExplicitWhenUnused(t *testing.T) {
	q := &mockCodeQuerier{}
	code, err := resolveEntityCode(context.Background(), q, 1, "item", "LEGACY-1")
	if err != nil {
		t.Fatal(err)
	}
	if code != "LEGACY-1" {
		t.Fatalf("code = %q", code)
	}
	if q.calls != 1 {
		t.Fatalf("calls = %d", q.calls)
	}
}

func TestResolveEntityCodeAllocatesWhenExplicitTaken(t *testing.T) {
	q := &mockCodeQuerier{exists: true, alloc: "00042"}
	code, err := resolveEntityCode(context.Background(), q, 1, "partner", "TAKEN")
	if err != nil {
		t.Fatal(err)
	}
	if code != "00042" {
		t.Fatalf("code = %q", code)
	}
	if q.calls != 2 {
		t.Fatalf("calls = %d", q.calls)
	}
}

func TestResolveEntityCodeAllocatesWhenBlank(t *testing.T) {
	q := &mockCodeQuerier{alloc: "00007"}
	code, err := resolveEntityCode(context.Background(), q, 1, "item", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if code != "00007" {
		t.Fatalf("code = %q", code)
	}
	if q.calls != 1 {
		t.Fatalf("calls = %d", q.calls)
	}
}

func TestResolveEntityCodeUnknownEntity(t *testing.T) {
	q := &mockCodeQuerier{}
	_, err := resolveEntityCode(context.Background(), q, 1, "warehouse", "X")
	if err == nil {
		t.Fatal("expected error")
	}
}

func TestTemplatesExposeExplicitCodes(t *testing.T) {
	if importTemplates["items"].Headers[0] != "item_code" {
		t.Fatalf("items headers[0] = %q", importTemplates["items"].Headers[0])
	}
	if importTemplates["partners"].Headers[0] != "partner_code" {
		t.Fatalf("partners headers[0] = %q", importTemplates["partners"].Headers[0])
	}
}
