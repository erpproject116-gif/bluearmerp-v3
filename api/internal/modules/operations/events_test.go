package operations

import "testing"

func TestTriggerMatches(t *testing.T) {
	payload := map[string]any{
		"column_id":  int64(12),
		"column_key": "complete",
		"status":     "done",
	}
	if !triggerMatches(map[string]any{}, payload) {
		t.Fatal("empty config should match")
	}
	if !triggerMatches(map[string]any{"column_key": "complete"}, payload) {
		t.Fatal("matching column_key should match")
	}
	if triggerMatches(map[string]any{"column_key": "backlog"}, payload) {
		t.Fatal("mismatched column_key should not match")
	}
	if !triggerMatches(map[string]any{"status": "done", "column_id": 12}, payload) {
		t.Fatal("matching status and column_id should match")
	}
	if triggerMatches(map[string]any{"column_id": 99}, payload) {
		t.Fatal("mismatched column_id should not match")
	}
}

func TestInt64From(t *testing.T) {
	if int64From(float64(42)) != 42 {
		t.Fatal("float64")
	}
	if int64From("17") != 17 {
		t.Fatal("string")
	}
	if int64From(nil) != 0 {
		t.Fatal("nil")
	}
}
