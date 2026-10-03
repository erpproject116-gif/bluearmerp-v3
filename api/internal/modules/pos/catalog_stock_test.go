package pos

import "testing"

func TestDeriveStockStatus(t *testing.T) {
	reorder := 3.0
	qty0 := 0.0
	qty2 := 2.0
	qty10 := 10.0

	cases := []struct {
		name    string
		tracked bool
		qty     *float64
		reorder *float64
		want    string
	}{
		{"untracked", false, nil, nil, "untracked"},
		{"sold out nil qty", true, nil, nil, "sold_out"},
		{"sold out zero", true, &qty0, nil, "sold_out"},
		{"low default threshold", true, &qty2, nil, "low"},
		{"low custom reorder", true, &qty2, &reorder, "low"},
		{"ok above reorder", true, &qty10, &reorder, "ok"},
		{"ok above default", true, &qty10, nil, "ok"},
	}
	for _, tc := range cases {
		got := deriveStockStatus(tc.tracked, tc.qty, tc.reorder)
		if got != tc.want {
			t.Fatalf("%s: got %q want %q", tc.name, got, tc.want)
		}
	}
}
