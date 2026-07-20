package inventory

import (
	"net/http"
	"net/url"
	"testing"
)

func TestParseInventoryStatusFilters(t *testing.T) {
	req := func(raw string) *http.Request {
		u, err := url.Parse("http://localhost/reports/inventory-status?" + raw)
		if err != nil {
			t.Fatal(err)
		}
		return &http.Request{URL: u}
	}

	q, status, cat, loc, errs := parseInventoryStatusFilters(req(""))
	if errs != nil || q != "" || status != "" || cat != nil || loc != nil {
		t.Fatalf("empty filters: q=%q status=%q cat=%v loc=%v errs=%v", q, status, cat, loc, errs)
	}

	q, status, cat, loc, errs = parseInventoryStatusFilters(req("q=mouse&status=below_safety&category_id=3&location_id=9"))
	if errs != nil {
		t.Fatalf("valid filters returned errs: %v", errs)
	}
	if q != "mouse" || status != "below_safety" || cat == nil || *cat != 3 || loc == nil || *loc != 9 {
		t.Fatalf("unexpected: q=%q status=%q cat=%v loc=%v", q, status, cat, loc)
	}

	_, _, _, loc, errs = parseInventoryStatusFilters(req("branch_id=12"))
	if errs != nil || loc == nil || *loc != 12 {
		t.Fatalf("branch_id alias: loc=%v errs=%v", loc, errs)
	}

	_, _, _, _, errs = parseInventoryStatusFilters(req("status=bogus"))
	if errs == nil || errs["status"] == "" {
		t.Fatal("expected invalid status error")
	}

	_, _, _, _, errs = parseInventoryStatusFilters(req("category_id=abc"))
	if errs == nil || errs["category_id"] == "" {
		t.Fatal("expected invalid category_id error")
	}
}

func TestInventoryStatusSQLArgCount(t *testing.T) {
	cat := int64(2)
	loc := int64(5)
	sql, args := inventoryStatusSQL(1, "sku", "in_stock", &cat, &loc)
	if len(args) != 5 {
		t.Fatalf("want 5 args (tenant,q,cat,loc,status), got %d: %v", len(args), args)
	}
	if sql == "" || args[0].(int64) != 1 {
		t.Fatalf("bad sql/args: %s %v", sql, args)
	}
}
