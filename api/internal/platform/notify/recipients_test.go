package notify

import (
	"strings"
	"testing"
)

func TestBusinessOwnerEmailsQueryExcludesStoreAdmin(t *testing.T) {
	q := strings.ToLower(businessOwnerEmailsQuery)
	if strings.Contains(q, "store_admin") {
		t.Fatal("business owner recipient query must not include store_admin")
	}
	if !strings.Contains(q, "owner_user_id") {
		t.Fatal("query must include owner_user_id")
	}
	if !strings.Contains(q, "store_owner") {
		t.Fatal("query must include store_owner tenant role")
	}
}

func TestParseDigestToEnvOwnerSentinel(t *testing.T) {
	t.Setenv("CHANGE_ALERT_DIGEST_TO", "owner")
	if got := parseDigestToEnv(); got != nil {
		t.Fatalf("owner sentinel should yield nil override, got %v", got)
	}
}

func TestParseDigestToEnvOverrideList(t *testing.T) {
	t.Setenv("CHANGE_ALERT_DIGEST_TO", " Ops@Example.com , owner, ops2@test.com ")
	got := parseDigestToEnv()
	if len(got) != 2 || got[0] != "ops@example.com" || got[1] != "ops2@test.com" {
		t.Fatalf("override=%v", got)
	}
}

func TestSkipDigestEnvFlags(t *testing.T) {
	t.Setenv("OPS_EMAIL_SKIP_HOURLY_DIGEST", "")
	t.Setenv("CHANGE_ALERT_SKIP_HOURLY_DIGEST", "")
	if SkipHourlyChangeAlertDigest() {
		t.Fatal("expected hourly skip false")
	}
	t.Setenv("OPS_EMAIL_SKIP_HOURLY_DIGEST", "1")
	if !SkipHourlyChangeAlertDigest() {
		t.Fatal("expected hourly skip true")
	}
	t.Setenv("OPS_EMAIL_SKIP_HOURLY_DIGEST", "")
	t.Setenv("OPS_EMAIL_SKIP_DAILY_OPS_DIGEST", "true")
	if !SkipDailyOpsDigest() {
		t.Fatal("expected daily ops skip true")
	}
}
