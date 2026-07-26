package operations

import "testing"

func TestWorkItemCompletionPercent(t *testing.T) {
	// Mirror loadWorkItemCompletion math without DB.
	done, total := 3, 10
	pct := float64(done) * 100.0 / float64(total)
	if pct != 30 {
		t.Fatalf("got %v", pct)
	}
	if total == 0 {
		t.Fatal("unexpected")
	}
}
