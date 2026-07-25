package quotation

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/config"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/dashscope"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/llm"
)

const defaultQwenVLModel = "qwen-vl-plus"

// RfqAIConfig controls DashScope (Qwen) RFQ line-item extraction.
type RfqAIConfig struct {
	Enabled            bool
	APIKey             string
	BaseURL            string
	VLModel            string
	MaxTotalPages      int
	MaxPagesPerRequest int
}

func RfqAIConfigFromEnv() RfqAIConfig {
	key := strings.TrimSpace(os.Getenv("DASHSCOPE_API_KEY"))
	enabled := parseEnvBoolDefault(os.Getenv("RFQ_AI_ENABLED"), key != "")
	model := envOrDefault("QWEN_VL_MODEL", defaultQwenVLModel)
	return RfqAIConfig{
		Enabled:            enabled,
		APIKey:             key,
		BaseURL:            dashscope.NormalizeBaseURL(envOrDefault("DASHSCOPE_BASE_URL", dashscope.DefaultBaseURL)),
		VLModel:            model,
		MaxTotalPages:      config.ParseIntDefault(os.Getenv("RFQ_AI_MAX_PAGES"), 10),
		MaxPagesPerRequest: config.ParseIntDefault(os.Getenv("RFQ_AI_PAGES_PER_CALL"), 2),
	}
}

func (c RfqAIConfig) Available() bool {
	return c.Enabled && c.APIKey != ""
}

func (c RfqAIConfig) newLLMClient() llm.Client {
	client := dashscope.NewClient(c.APIKey)
	client.BaseURL = c.BaseURL
	return client
}

type rfqAIPageInput struct {
	Page        int
	Text        string
	ImageBase64 string
	ImageMIME   string
}

type RfqAIUsage struct {
	Model          string `json:"ai_model"`
	Provider       string `json:"ai_provider"`
	PagesProcessed int    `json:"ai_pages_processed"`
	UsedVision     bool   `json:"ai_used_vision"`
}

const rfqAISystemPrompt = `You extract procurement RFQ/BOQ line items from document pages.
Return ONLY valid JSON matching this schema:
{"lines":[{"page":1,"item_code":"","item_name":"","description":"","qty":"1","unit":"","unit_price":"","line_total":"","remarks":""}]}
Rules:
- Include only real item/service rows from tables or numbered lists.
- A government section heading such as "I. LAPTOP (8 units)" is ONE product row. Use LAPTOP as item_name, 8 as qty, unit as unit, and fold its following specification bullets into description.
- Never emit individual processor, memory, storage, warranty, connectivity, or similar specification bullets as separate products.
- Skip headers, footers, totals, subtotals, signatures, terms, and cover pages.
- Skip PhilGEPS instructions, eligibility requirements, approved-budget narrative, financial-proposal blanks, and "Nothing Follows".
- Preserve item codes and quantities exactly as shown.
- Use empty strings for missing fields; qty defaults to "1" when unclear.
- page must match the page number given in the user message.
- Do not invent rows, brands, prices, quantities, or specifications not visible in the source.
Examples:
- "I. LAPTOP (8 units)" followed by technical bullets => one line with item_name "LAPTOP", qty "8", unit "unit".
- Annex A row "CSC LANYARD / ID LACE | 500 | set" => one line with item_name "CSC LANYARD / ID LACE", qty "500", unit "set".`

type rfqAIExtractResponse struct {
	Lines []struct {
		Page        int    `json:"page"`
		ItemCode    string `json:"item_code"`
		ItemName    string `json:"item_name"`
		Description string `json:"description"`
		Qty         string `json:"qty"`
		Unit        string `json:"unit"`
		UnitPrice   string `json:"unit_price"`
		LineTotal   string `json:"line_total"`
		Remarks     string `json:"remarks"`
	} `json:"lines"`
}

func ParseRfqWithAI(ctx context.Context, cfg RfqAIConfig, pages []rfqAIPageInput, tables []RfqStructuredTable) (RfqParseResult, RfqAIUsage, error) {
	return ParseRfqWithAIForType(ctx, cfg, pages, tables, RfqDocumentUnknown)
}

func ParseRfqWithAIForType(ctx context.Context, cfg RfqAIConfig, pages []rfqAIPageInput, tables []RfqStructuredTable, documentType RfqDocumentType) (RfqParseResult, RfqAIUsage, error) {
	var empty RfqParseResult
	var usage RfqAIUsage
	usage.Provider = "dashscope"
	if documentType == RfqDocumentInvoiceLike {
		return empty, usage, fmt.Errorf("document is invoice-like, not an RFQ or BOQ")
	}
	if !cfg.Available() {
		return empty, usage, fmt.Errorf("RFQ AI is not configured (set DASHSCOPE_API_KEY and RFQ_AI_ENABLED)")
	}
	if len(pages) == 0 && len(tables) == 0 {
		return empty, usage, fmt.Errorf("at least one page or table is required")
	}

	client := cfg.newLLMClient()

	maxPages := cfg.MaxTotalPages
	if maxPages <= 0 {
		maxPages = 10
	}
	perCall := cfg.MaxPagesPerRequest
	if perCall <= 0 {
		perCall = 2
	}

	var allLines []ParsedRfqLine
	seen := map[string]struct{}{}
	lineNo := 0

	if len(tables) > 0 {
		structured := ParseRfqStructuredTables(tables, RfqParseOptions{})
		for _, ln := range structured.Lines {
			key := rfqLineDedupeKey(ln)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			ln.LineNo = lineNo
			allLines = append(allLines, ln)
		}
	}

	aiPages := pages
	if len(aiPages) > maxPages {
		aiPages = aiPages[:maxPages]
	}

	for start := 0; start < len(aiPages); start += perCall {
		end := start + perCall
		if end > len(aiPages) {
			end = len(aiPages)
		}
		batch := aiPages[start:end]
		batchLines, model, usedVision, err := extractRfqAIBatch(ctx, client, cfg, batch, documentType)
		if err != nil {
			return empty, usage, err
		}
		usage.Model = model
		usage.PagesProcessed += len(batch)
		if usedVision {
			usage.UsedVision = true
		}
		for _, ln := range batchLines {
			key := rfqLineDedupeKey(ln)
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			lineNo++
			ln.LineNo = lineNo
			allLines = append(allLines, ln)
		}
	}

	if len(allLines) == 0 {
		return empty, usage, fmt.Errorf("AI extraction returned no line items")
	}

	result := SanitizeRfqParseResult(RfqParseResult{
		Lines:           allLines,
		TableDetected:   true,
		DetectedColumns: defaultRfqAIColumns(),
	}, documentType)
	if len(result.Lines) == 0 {
		return empty, usage, fmt.Errorf("AI extraction returned no valid line items after sanitization")
	}
	return result, usage, nil
}

func extractRfqAIBatch(ctx context.Context, client llm.Client, cfg RfqAIConfig, batch []rfqAIPageInput, documentType RfqDocumentType) ([]ParsedRfqLine, string, bool, error) {
	useVision := false
	for _, p := range batch {
		if strings.TrimSpace(p.ImageBase64) != "" {
			useVision = true
			break
		}
	}
	model := cfg.VLModel
	if model == "" {
		model = defaultQwenVLModel
	}

	var userParts []llm.ContentPart
	userParts = append(userParts, llm.ContentPart{
		Type: "text",
		Text: buildRfqAIUserPrompt(batch, documentType),
	})
	for _, p := range batch {
		b64 := strings.TrimSpace(p.ImageBase64)
		if b64 == "" {
			continue
		}
		mime := strings.TrimSpace(p.ImageMIME)
		if mime == "" {
			mime = "image/jpeg"
		}
		userParts = append(userParts, llm.ContentPart{
			Type: "text",
			Text: fmt.Sprintf("Page %d image:", p.Page),
		})
		userParts = append(userParts, llm.ContentPart{
			Type: "image_url",
			ImageURL: &struct {
				URL string `json:"url"`
			}{URL: "data:" + mime + ";base64," + b64},
		})
	}

	content, err := client.ChatCompletion(ctx, llm.ChatRequest{
		Model: model,
		Messages: []llm.Message{
			{Role: "system", Content: rfqAISystemPrompt},
			{Role: "user", Content: userParts},
		},
		Temperature:    0.1,
		MaxTokens:      4096,
		ResponseFormat: map[string]string{"type": "json_object"},
	})
	if err != nil {
		return nil, model, useVision, err
	}
	lines, err := parseRfqAIJSON(content)
	return lines, model, useVision, err
}

func buildRfqAIUserPrompt(batch []rfqAIPageInput, documentType RfqDocumentType) string {
	var b strings.Builder
	b.WriteString("Extract RFQ line items from these document page(s).\n")
	b.WriteString("Document type: ")
	b.WriteString(string(documentType))
	b.WriteString("\n")
	if documentType == RfqDocumentInvoiceLike {
		b.WriteString("This is invoice-like. Return {\"lines\":[]}.\n")
	}
	for _, p := range batch {
		b.WriteString(fmt.Sprintf("\n--- Page %d ---\n", p.Page))
		text := strings.TrimSpace(p.Text)
		if text != "" {
			b.WriteString(text)
			b.WriteByte('\n')
		} else {
			b.WriteString("(no text layer; use attached page image if provided)\n")
		}
	}
	return b.String()
}

func parseRfqAIJSON(raw string) ([]ParsedRfqLine, error) {
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var parsed rfqAIExtractResponse
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		// Some models wrap lines at top level.
		var alt struct {
			Data rfqAIExtractResponse `json:"data"`
		}
		if err2 := json.Unmarshal([]byte(raw), &alt); err2 == nil && len(alt.Data.Lines) > 0 {
			parsed = alt.Data
		} else {
			return nil, fmt.Errorf("AI response is not valid JSON: %w", err)
		}
	}

	out := make([]ParsedRfqLine, 0, len(parsed.Lines))
	for _, ln := range parsed.Lines {
		desc := strings.TrimSpace(ln.Description)
		code := strings.TrimSpace(ln.ItemCode)
		if desc == "" && code == "" {
			continue
		}
		qty := strings.TrimSpace(ln.Qty)
		if qty == "" {
			qty = "1"
		}
		out = append(out, ParsedRfqLine{
			Page:        ln.Page,
			ItemCode:    code,
			ItemName:    strings.TrimSpace(ln.ItemName),
			Description: desc,
			Remarks:     strings.TrimSpace(ln.Remarks),
			Qty:         qty,
			Unit:        strings.TrimSpace(ln.Unit),
			UnitPrice:   strings.TrimSpace(ln.UnitPrice),
			LineTotal:   strings.TrimSpace(ln.LineTotal),
			Confidence:  0.88,
		})
	}
	return out, nil
}

func rfqLineDedupeKey(ln ParsedRfqLine) string {
	return strings.ToLower(strings.TrimSpace(ln.ItemCode) + "|" + strings.TrimSpace(ln.Description) + "|" + strings.TrimSpace(ln.Qty))
}

func defaultRfqAIColumns() []RfqDetectedColumn {
	return []RfqDetectedColumn{
		{Index: 0, Field: "item_code", Label: "Item code"},
		{Index: 1, Field: "description", Label: "Description"},
		{Index: 2, Field: "qty", Label: "Qty"},
		{Index: 3, Field: "unit", Label: "Unit"},
		{Index: 4, Field: "unit_price", Label: "Unit price"},
	}
}

func parseEnvBoolDefault(v string, defaultVal bool) bool {
	v = strings.TrimSpace(strings.ToLower(v))
	if v == "" {
		return defaultVal
	}
	switch v {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return defaultVal
	}
}

func envOrDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func parseRfqAIStatus(cfg RfqAIConfig) map[string]any {
	model := cfg.VLModel
	if model == "" {
		model = defaultQwenVLModel
	}
	return map[string]any{
		"enabled":      cfg.Available(),
		"provider":     "dashscope",
		"model":        model,
		"text_model":   model,
		"vision_model": model,
		"max_pages":    cfg.MaxTotalPages,
	}
}
