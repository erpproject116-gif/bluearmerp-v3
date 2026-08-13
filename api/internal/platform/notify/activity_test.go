package notify

import (
	"testing"
	"time"
)

func TestShouldWriteBell(t *testing.T) {
	allow := []string{
		"sales.confirm",
		"sales.checkout",
		"finance.journal.post",
		"quotation.share",
		"quotation.send_email",
		"operations.work.progress",
		"inventory.build",
	}
	for _, code := range allow {
		if !shouldWriteBell(code) {
			t.Fatalf("expected bell write for %s", code)
		}
	}
	deny := []string{
		"sales.create",
		"sales.update",
		"sales.delete",
		"sales.restore",
		"sales.list",
		"sales.export",
		"sales.attachment.upload",
		"unknown.confirm",
		"",
	}
	for _, code := range deny {
		if shouldWriteBell(code) {
			t.Fatalf("expected no bell write for %s", code)
		}
	}
}

func TestShouldQueueDigestStillBroad(t *testing.T) {
	if !shouldQueueDigest("sales.create") {
		t.Fatal("digest should accept create")
	}
	if !shouldQueueDigest("sales.update") {
		t.Fatal("digest should accept update")
	}
	if !shouldQueueDigest("sales.confirm") {
		t.Fatal("digest should accept confirm")
	}
	if shouldQueueDigest("sales.list") {
		t.Fatal("digest should reject list")
	}
	if shouldQueueDigest("foo.create") {
		t.Fatal("digest should reject unknown module prefix")
	}
}

func TestActivityBellDedupeKeyStable(t *testing.T) {
	id := int64(42)
	at := time.Date(2026, 8, 13, 14, 30, 0, 0, time.UTC)
	a := activityBellDedupeKey("sales.confirm", "sa_sales", &id, at)
	b := activityBellDedupeKey("sales.confirm", "sa_sales", &id, at.Add(20*time.Minute))
	if a != b {
		t.Fatalf("same hour bucket should match: %q vs %q", a, b)
	}
	c := activityBellDedupeKey("sales.confirm", "sa_sales", &id, at.Add(2*time.Hour))
	if a == c {
		t.Fatalf("different hour should differ: %q", a)
	}
	want := "act:sales.confirm:sa_sales:42:2026-08-13-14"
	if a != want {
		t.Fatalf("got %q want %q", a, want)
	}
}
