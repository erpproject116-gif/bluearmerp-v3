package inventory

import (
	"strings"
	"testing"
	"time"
)

func TestInvBookShowsJobMovement(t *testing.T) {
	cases := []struct {
		bom    string
		status string
		show   bool
	}{
		{"disassembly", "completed", true},
		{"disassembly", "released", false},
		{"disassembly", "draft", false},
		{"disassembly", "cancelled", false},
		{"assembly", "released", true},
		{"assembly", "completed", true},
		{"assembly", "draft", false},
		{"assembly", "cancelled", false},
		{"", "released", true},
		{"", "completed", true},
		{"", "draft", false},
		{"recipe", "draft", true},
		{"recipe", "released", true},
		{"recipe", "cancelled", true},
		{"process", "draft", true},
	}
	for _, tc := range cases {
		if got := invBookShowsJobMovement(tc.bom, tc.status); got != tc.show {
			t.Fatalf("bom %q status %q: got %v want %v", tc.bom, tc.status, got, tc.show)
		}
	}
}

func TestInvBookQueriesShareJobFilter(t *testing.T) {
	from := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 1, 31, 0, 0, 0, 0, time.UTC)
	loc := int64(9)
	report, _ := invBookSQL(1, from, to, nil, "", "", nil)
	slips, _ := invBookSlipsSQL(1, 2, from, to, nil)
	opening := invBookSlipOpeningSQL(nil)
	openingLoc := invBookSlipOpeningSQL(&loc)
	queries := []struct {
		name string
		sql  string
		min  int
	}{
		{"report", report, 1},
		{"ledger", slips, 2},
		{"beginning", opening, 1},
		{"beginning location", openingLoc, 1},
	}
	frags := []string{invBookJobJoinSQL, invBookJobVisibleSQL, invBookBookedAtSQL}
	for _, q := range queries {
		if strings.Contains(q.sql, "inspection_status") {
			t.Fatalf("%s reads inspection_status", q.name)
		}
		for _, frag := range frags {
			if strings.Count(q.sql, frag) < q.min {
				t.Fatalf("%s is missing shared SQL %q", q.name, frag)
			}
		}
	}
	if !strings.Contains(invBookJobVisibleSQL, "wo.status in ('released', 'completed')") {
		t.Fatal("assembly must stay visible after release and after completion")
	}
	if strings.Contains(openingLoc, "$5") || strings.Contains(invBookJobVisibleSQL, "$") {
		t.Fatal("job filter must not add SQL placeholders")
	}
}
