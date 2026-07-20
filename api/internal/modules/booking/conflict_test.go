package booking

import "testing"

func TestValidateStatusTransition(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{"", "scheduled", true},
		{"scheduled", "confirmed", true},
		{"scheduled", "completed", false},
		{"confirmed", "completed", true},
		{"completed", "cancelled", false},
		{"cancelled", "scheduled", true},
		{"no_show", "scheduled", true},
		{"scheduled", "bogus", false},
	}
	for _, c := range cases {
		err := validateStatusTransition(c.from, c.to)
		if c.ok && err != nil {
			t.Fatalf("%s -> %s: unexpected error %v", c.from, c.to, err)
		}
		if !c.ok && err == nil {
			t.Fatalf("%s -> %s: expected error", c.from, c.to)
		}
	}
}
