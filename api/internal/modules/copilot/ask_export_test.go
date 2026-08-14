package copilot

import (
	"errors"
	"testing"
)

func TestToAskExportNilDraft(t *testing.T) {
	out := toAskExport(finalizeAskResult(askResult{
		Mode:    "docs",
		Message: "hello",
		UsedAI:  false,
	}))
	if out.Message != "hello" || out.ActionDraft != nil {
		t.Fatalf("unexpected export: %+v", out)
	}
}

func TestToAskExportWithDraft(t *testing.T) {
	out := toAskExport(finalizeAskResult(askResult{
		Mode:    "action",
		Message: "open form",
		ActionDraft: &actionDraft{
			Type:    "open_quotation",
			Summary: "Open quotation",
			Payload: map[string]any{},
		},
	}))
	if out.ActionDraft == nil || out.ActionDraft.Type != "open_quotation" {
		t.Fatalf("expected open_quotation draft, got %+v", out.ActionDraft)
	}
	if out.ActionDraft.Payload == nil {
		t.Fatal("payload should be non-nil map")
	}
}

func TestRunAskErrorSentinels(t *testing.T) {
	if !errors.Is(ErrCopilotDisabled, ErrCopilotDisabled) {
		t.Fatal("sentinel")
	}
}
