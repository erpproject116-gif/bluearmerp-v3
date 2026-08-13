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

func TestTicketNotifySeverity(t *testing.T) {
	if ticketNotifySeverity("urgent", []string{"subject"}) != "critical" {
		t.Fatal("urgent → critical")
	}
	if ticketNotifySeverity("high", []string{"priority"}) != "critical" {
		t.Fatal("high → critical")
	}
	if ticketNotifySeverity("normal", []string{"status"}) != "warning" {
		t.Fatal("status change → warning")
	}
	if ticketNotifySeverity("normal", []string{"assignee"}) != "warning" {
		t.Fatal("assignee change → warning")
	}
	if ticketNotifySeverity("low", []string{"subject"}) != "info" {
		t.Fatal("subject-only → info")
	}
}

func TestTicketNotifyRecipientsExcludesActor(t *testing.T) {
	creator := int64(1)
	assignee := int64(2)
	prev := int64(3)
	got := ticketNotifyRecipients(&creator, &assignee, &prev, 2)
	seen := map[int64]bool{}
	for _, id := range got {
		seen[id] = true
	}
	if seen[2] {
		t.Fatal("actor assignee must be excluded")
	}
	if !seen[1] || !seen[3] {
		t.Fatalf("expected creator and previous assignee, got %v", got)
	}
}

