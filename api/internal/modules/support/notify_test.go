package support

import "testing"

func TestPtrEqualInt64(t *testing.T) {
	a, b, c := int64(1), int64(1), int64(2)
	if !ptrEqualInt64(nil, nil) {
		t.Fatal("nil == nil")
	}
	if ptrEqualInt64(&a, nil) || ptrEqualInt64(nil, &a) {
		t.Fatal("nil != value")
	}
	if !ptrEqualInt64(&a, &b) {
		t.Fatal("1 == 1")
	}
	if ptrEqualInt64(&a, &c) {
		t.Fatal("1 != 2")
	}
}

func TestContainsStr(t *testing.T) {
	if !containsStr([]string{"status", "priority"}, "status") {
		t.Fatal("expected hit")
	}
	if containsStr([]string{"status"}, "assignee") {
		t.Fatal("expected miss")
	}
}
