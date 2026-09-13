package operations

import (
	"os"
	"strings"
	"testing"
)

func TestAllHandsMeetingAnnouncement(t *testing.T) {
	got := allHandsMeetingAnnouncement(
		"Quarterly review", "2026-09-15", "09:00", "10:30",
		"https://meet.example/team", "Bring your scorecard.",
	)
	for _, want := range []string{
		"All-hands meeting: Quarterly review",
		"2026-09-15, 09:00–10:30",
		"https://meet.example/team",
		"Bring your scorecard.",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("announcement %q does not contain %q", got, want)
		}
	}
}

func TestAllHandsMeetingAnnouncementOmitsBlankNote(t *testing.T) {
	got := allHandsMeetingAnnouncement("Standup", "2026-09-15", "09:00", "09:15", "Board room", "  ")
	if strings.HasSuffix(got, "\n") {
		t.Fatalf("blank note left a trailing newline: %q", got)
	}
}

func TestAllHandsMeetingUsesDedicatedActiveMemberBroadcast(t *testing.T) {
	src, err := os.ReadFile("meetings.go")
	if err != nil {
		t.Fatal(err)
	}
	code := string(src)
	for _, want := range []string{
		"u.status = 'active'",
		"'meeting'",
		"'system'",
		"sender_kind",
		"chat_channel_members",
	} {
		if !strings.Contains(code, want) {
			t.Fatalf("meeting broadcast path is missing %q", want)
		}
	}
	if strings.Contains(code, "activityBellAudienceUserIDs") {
		t.Fatal("all-hands meetings must not use the activity bell audience helper")
	}
}
