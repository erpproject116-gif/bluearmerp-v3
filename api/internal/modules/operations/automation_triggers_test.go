package operations

import "testing"

func TestAllowedTriggersIncludeCRMAndBooking(t *testing.T) {
	want := []string{
		"booking.created",
		"booking.status_changed",
		"crm.follow_up.created",
		"crm.follow_up.updated",
		"crm.follow_up.stage_changed",
		"workspace.created",
		"work_item.created",
	}
	for _, ev := range want {
		if !allowedTriggers[ev] {
			t.Fatalf("expected allowedTriggers[%q]=true", ev)
		}
	}
	if allowedTriggers["sales.created"] {
		t.Fatal("sales.created must not be an allowed automation trigger")
	}
}

func TestValidateAutomationRuleBodyRejectsUnknownTrigger(t *testing.T) {
	errs := validateAutomationRuleBody(automationRuleBody{
		RuleName:     "x",
		TriggerEvent: "inventory.posted",
		ActionType:   "notify",
	})
	if errs == nil || errs["trigger_event"] == "" {
		t.Fatal("expected trigger_event validation error for inventory.posted")
	}
}

func TestValidateAutomationRuleBodyAcceptsBookingCreated(t *testing.T) {
	errs := validateAutomationRuleBody(automationRuleBody{
		RuleName:     "Booking notify",
		TriggerEvent: "booking.created",
		ActionType:   "log",
	})
	if errs != nil {
		t.Fatalf("unexpected errs: %#v", errs)
	}
}
