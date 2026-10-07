package inventory

import (
	"strings"
	"testing"
)

func TestRejectCrossLocationAdjustAsTransfer(t *testing.T) {
	lines := []stockAdjustmentLineBody{
		{ItemID: 1, LocationID: 10, QtyDelta: -2},
		{ItemID: 1, LocationID: 20, QtyDelta: 2},
	}
	if errs := rejectCrossLocationAdjustAsTransfer(false, lines); errs != nil {
		t.Fatalf("expected allow when handoff off, got %v", errs)
	}
	errs := rejectCrossLocationAdjustAsTransfer(true, lines)
	if errs == nil || errs["lines"] == "" {
		t.Fatalf("expected multi-location rejection when handoff on, got %v", errs)
	}
	sameLoc := []stockAdjustmentLineBody{
		{ItemID: 1, LocationID: 10, QtyDelta: -1},
		{ItemID: 2, LocationID: 10, QtyDelta: 3},
	}
	if errs := rejectCrossLocationAdjustAsTransfer(true, sameLoc); errs != nil {
		t.Fatalf("same-location adjust should pass: %v", errs)
	}
}

func TestTrackedItemAdjustmentMessage(t *testing.T) {
	tests := []struct {
		name                  string
		trackSerial, trackLot bool
		want                  string
	}{
		{name: "untracked", want: ""},
		{name: "serial", trackSerial: true, want: "Open Serial Registry and use Fix this unit"},
		{name: "lot", trackLot: true, want: "Open Lots and use Change quantity"},
		{name: "both", trackSerial: true, trackLot: true, want: "Adjust serial units with Fix this unit and lot batches with Change quantity"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := trackedItemAdjustmentMessage(tt.trackSerial, tt.trackLot)
			if got != "" && !strings.Contains(got, tt.want) {
				t.Fatalf("message %q does not contain %q", got, tt.want)
			}
			if tt.want == "" && got != "" {
				t.Fatalf("untracked item should have no message, got %q", got)
			}
		})
	}
}
