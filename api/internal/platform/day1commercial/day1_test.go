package day1commercial

import "testing"

func TestCriteriaLogic(t *testing.T) {
	cases := []struct {
		loc, items, stock int64
		want              bool
	}{
		{0, 1, 1, false},
		{1, 0, 1, false},
		{1, 1, 0, false},
		{1, 1, 1, true},
		{2, 3, 1, true},
	}
	for _, c := range cases {
		ok := c.loc >= 1 && c.items >= 1 && c.stock >= 1
		if ok != c.want {
			t.Fatalf("loc=%d items=%d stock=%d got %v want %v", c.loc, c.items, c.stock, ok, c.want)
		}
	}
}
