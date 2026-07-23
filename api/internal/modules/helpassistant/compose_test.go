package helpassistant

import (
	"strings"
	"testing"
)

func TestBuildGroundedUserPrompt(t *testing.T) {
	prompt, ids := buildGroundedUserPrompt("cannot confirm", "/app/quotation", []composeHitIn{
		{
			ArticleID: "cannot-confirm-document",
			Title:     "Cannot confirm a document",
			Scenario:  "Confirm is blocked",
			Snippet:   "Check attachments",
			Steps:     []string{"Upload a file", "Save then Confirm"},
		},
	}, &composePersonalization{RoleCode: "owner", BranchID: 3}, nil)
	if len(ids) != 1 || ids[0] != "cannot-confirm-document" {
		t.Fatalf("ids=%v", ids)
	}
	for _, needle := range []string{"cannot confirm", "/app/quotation", "Cannot confirm a document", "Upload a file", "owner", "3"} {
		if !strings.Contains(prompt, needle) {
			t.Fatalf("prompt missing %q:\n%s", needle, prompt)
		}
	}
}

func TestSearchHelpGoldenSmoke(t *testing.T) {
	if CorpusChunkCount() == 0 {
		t.Skip("help corpus not embedded")
	}
	hits := SearchHelp("onboarding playbook", "/app/onboarding", 3, minScore, nil)
	if len(hits) == 0 {
		t.Fatal("expected hits")
	}
	if hits[0].Chunk.ArticleID != "onboarding-playbook" {
		t.Fatalf("got article %s", hits[0].Chunk.ArticleID)
	}
}

func TestConfigAvailable(t *testing.T) {
	t.Setenv("DASHSCOPE_API_KEY", "")
	t.Setenv("HELP_AI_ENABLED", "")
	if ConfigFromEnv().Available() {
		t.Fatal("expected unavailable without key")
	}
	t.Setenv("DASHSCOPE_API_KEY", "sk-test")
	t.Setenv("HELP_AI_ENABLED", "true")
	c := ConfigFromEnv()
	if !c.Available() {
		t.Fatal("expected available")
	}
	if c.Model == "" {
		t.Fatal("expected default model")
	}
}
