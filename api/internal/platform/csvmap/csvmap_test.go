package csvmap

import (
	"net/http"
	"strings"
	"testing"
)

func TestRemapCanonicalHeaders(t *testing.T) {
	records := [][]string{
		{"Item Name", "SRP", "Skip Me"},
		{"Pen", "10", "x"},
		{"", "", ""},
		{"Paper", "5", "y"},
	}
	got, err := Remap(records, map[string]string{
		"item_name":   "Item Name",
		"sales_price": "SRP",
	}, []string{"item_name"}, []string{"item_name", "sales_price"})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("rows = %d, want 3 (header + 2 data)", len(got))
	}
	if strings.Join(got[0], ",") != "item_name,sales_price" {
		t.Fatalf("headers = %v", got[0])
	}
	if got[1][0] != "Pen" || got[1][1] != "10" {
		t.Fatalf("row1 = %v", got[1])
	}
}

func TestRemapMissingRequired(t *testing.T) {
	_, err := Remap([][]string{{"A"}, {"1"}}, map[string]string{"item_name": ""}, []string{"item_name"}, []string{"item_name"})
	if err == nil || !strings.Contains(err.Error(), "missing required") {
		t.Fatalf("err = %v", err)
	}
}

func TestRemapUnknownSourceHeader(t *testing.T) {
	_, err := Remap([][]string{{"Name"}, {"Pen"}}, map[string]string{"item_name": "Item Name"}, []string{"item_name"}, []string{"item_name"})
	if err == nil || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("err = %v", err)
	}
}

func TestRowsToMaps(t *testing.T) {
	maps := RowsToMaps([][]string{{"item_name", "qty"}, {"Pen", "2"}})
	if len(maps) != 1 || maps[0]["item_name"] != "Pen" || maps[0]["qty"] != "2" {
		t.Fatalf("maps = %v", maps)
	}
}

func TestResolveColumnMapLiveWins(t *testing.T) {
	r, err := http.NewRequest(http.MethodPost, "/", nil)
	if err != nil {
		t.Fatal(err)
	}
	r.Form = map[string][]string{
		"profile_id": {"99"},
		"column_map": {`{"item_name":"Name"}`},
	}
	got, err := resolveColumnMap(r, func(id int64) (map[string]string, error) {
		t.Fatalf("profile should not load when live map is present, id=%d", id)
		return nil, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got["item_name"] != "Name" {
		t.Fatalf("got %v", got)
	}
}
