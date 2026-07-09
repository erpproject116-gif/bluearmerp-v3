package inventory

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/httputil"
)

type itemListFilters struct {
	ItemCode      string
	ItemName      string
	SpecName      string
	ItemCategory  string
	ItemType      string
	TrackSerial   string
	TrackLot      string
}

func parseItemListFilters(r *http.Request) itemListFilters {
	return itemListFilters{
		ItemCode:     strings.TrimSpace(r.URL.Query().Get("item_code")),
		ItemName:     strings.TrimSpace(r.URL.Query().Get("item_name")),
		SpecName:     strings.TrimSpace(r.URL.Query().Get("spec_name")),
		ItemCategory: strings.TrimSpace(r.URL.Query().Get("item_category")),
		ItemType:     strings.TrimSpace(r.URL.Query().Get("item_type")),
		TrackSerial:  strings.TrimSpace(r.URL.Query().Get("track_serial")),
		TrackLot:     strings.TrimSpace(r.URL.Query().Get("track_lot")),
	}
}

func buildItemListWhere(tenantID int64, p httputil.ListParams, extra itemListFilters) (string, []any) {
	where := "i.tenant_id = $1 and i.deleted_at is null"
	args := []any{tenantID}
	n := 2
	if p.Q != "" {
		where += fmt.Sprintf(" and (i.item_name ilike $%d or i.item_code ilike $%d)", n, n)
		args = append(args, "%"+p.Q+"%")
		n++
	}
	if p.Status == "active" || p.Status == "inactive" {
		where += fmt.Sprintf(" and i.status = $%d", n)
		args = append(args, p.Status)
		n++
	}
	if extra.ItemCode != "" {
		where += fmt.Sprintf(" and i.item_code ilike $%d", n)
		args = append(args, "%"+extra.ItemCode+"%")
		n++
	}
	if extra.ItemName != "" {
		where += fmt.Sprintf(" and i.item_name ilike $%d", n)
		args = append(args, "%"+extra.ItemName+"%")
		n++
	}
	if extra.SpecName != "" {
		where += fmt.Sprintf(" and coalesce(i.spec_name, '') ilike $%d", n)
		args = append(args, "%"+extra.SpecName+"%")
		n++
	}
	if extra.ItemCategory != "" {
		where += fmt.Sprintf(" and i.item_category = $%d", n)
		args = append(args, extra.ItemCategory)
		n++
	}
	if extra.ItemType != "" {
		where += fmt.Sprintf(" and i.item_type = $%d", n)
		args = append(args, extra.ItemType)
		n++
	}
	if extra.TrackSerial == "true" || extra.TrackSerial == "false" {
		where += fmt.Sprintf(" and i.track_serial = $%d", n)
		args = append(args, extra.TrackSerial == "true")
		n++
	}
	if extra.TrackLot == "true" || extra.TrackLot == "false" {
		where += fmt.Sprintf(" and i.track_lot = $%d", n)
		args = append(args, extra.TrackLot == "true")
	}
	return where, args
}

var standardCostKeys = []string{"material", "labor", "expenses", "overhead"}

func sanitizeStandardCosts(in map[string]float64) map[string]float64 {
	out := map[string]float64{"material": 0, "labor": 0, "expenses": 0, "overhead": 0}
	if in == nil {
		return out
	}
	for _, k := range standardCostKeys {
		if v, ok := in[k]; ok && v > 0 {
			out[k] = v
		}
	}
	return out
}

func parseOptionalInt64(s string) (*int64, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, nil
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

func parseOptionalItemID(r *http.Request) (*int64, error) {
	return parseOptionalInt64(r.URL.Query().Get("item_id"))
}

func parseOptionalLocationID(r *http.Request) (*int64, error) {
	return parseOptionalInt64(r.URL.Query().Get("location_id"))
}
