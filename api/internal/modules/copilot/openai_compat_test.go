package copilot

import "testing"

func TestLastUserMessage(t *testing.T) {
	msgs := []struct {
		Role    string `json:"role"`
		Content any    `json:"content"`
	}{
		{Role: "system", Content: "sys"},
		{Role: "user", Content: "hello bookings"},
	}
	if got := lastUserMessage(msgs); got != "hello bookings" {
		t.Fatalf("got %q", got)
	}
}
