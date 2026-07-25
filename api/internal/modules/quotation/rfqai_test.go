package quotation

import (
	"strings"
	"testing"
)

func TestParseRfqAIJSON_validLines(t *testing.T) {
	raw := `{"lines":[{"page":2,"item_code":"ABC-1","description":"Network switch 24-port","qty":"10","unit":"pcs","unit_price":"12500","remarks":""}]}`
	lines, err := parseRfqAIJSON(raw)
	if err != nil {
		t.Fatalf("parseRfqAIJSON: %v", err)
	}
	if len(lines) != 1 {
		t.Fatalf("expected 1 line, got %d", len(lines))
	}
	ln := lines[0]
	if ln.Page != 2 || ln.ItemCode != "ABC-1" || ln.Description != "Network switch 24-port" || ln.Qty != "10" {
		t.Fatalf("unexpected line: %+v", ln)
	}
	if ln.Confidence < 0.85 {
		t.Fatalf("expected high confidence, got %v", ln.Confidence)
	}
}

func TestParseRfqAIJSON_skipsEmptyRows(t *testing.T) {
	raw := `{"lines":[{"page":1,"item_code":"","description":"","qty":"1"}]}`
	lines, err := parseRfqAIJSON(raw)
	if err != nil {
		t.Fatalf("parseRfqAIJSON: %v", err)
	}
	if len(lines) != 0 {
		t.Fatalf("expected 0 lines, got %d", len(lines))
	}
}

func TestParseRfqAIJSON_stripsMarkdownFence(t *testing.T) {
	raw := "```json\n{\"lines\":[{\"page\":1,\"description\":\"Item A\",\"qty\":\"2\"}]}\n```"
	lines, err := parseRfqAIJSON(raw)
	if err != nil {
		t.Fatalf("parseRfqAIJSON: %v", err)
	}
	if len(lines) != 1 || lines[0].Description != "Item A" {
		t.Fatalf("unexpected: %+v", lines)
	}
}

func TestParseRfqAIJSON_preservesGovernmentParentItem(t *testing.T) {
	raw := `{"lines":[{"page":3,"item_name":"LAPTOP","description":"Processor: Core i5\nWarranty: three years","qty":"8","unit":"unit"}]}`
	lines, err := parseRfqAIJSON(raw)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(lines) != 1 || lines[0].ItemName != "LAPTOP" || lines[0].Qty != "8" {
		t.Fatalf("lines=%+v", lines)
	}
}

func TestBuildRfqAIUserPromptIncludesDocumentType(t *testing.T) {
	prompt := buildRfqAIUserPrompt([]rfqAIPageInput{{Page: 1, Text: "I. LAPTOP (8 units)"}}, RfqDocumentGovernmentSpec)
	if !strings.Contains(prompt, "Document type: gov_section_spec") {
		t.Fatalf("prompt=%q", prompt)
	}
}

func TestRfqAIConfigFromEnv_defaults(t *testing.T) {
	t.Setenv("DASHSCOPE_API_KEY", "")
	t.Setenv("RFQ_AI_ENABLED", "")
	cfg := RfqAIConfigFromEnv()
	if cfg.Available() {
		t.Fatal("expected unavailable without API key")
	}
	if cfg.VLModel != "qwen-vl-plus" {
		t.Fatalf("expected default qwen-vl-plus, got %q", cfg.VLModel)
	}
}

func TestRfqAIConfigFromEnv_withKey(t *testing.T) {
	t.Setenv("DASHSCOPE_API_KEY", "sk-test")
	t.Setenv("RFQ_AI_ENABLED", "true")
	t.Setenv("QWEN_VL_MODEL", "qwen2.5-vl-72b-instruct")
	cfg := RfqAIConfigFromEnv()
	if !cfg.Available() {
		t.Fatal("expected available with API key")
	}
	if cfg.VLModel != "qwen2.5-vl-72b-instruct" {
		t.Fatalf("unexpected model: %q", cfg.VLModel)
	}
}
