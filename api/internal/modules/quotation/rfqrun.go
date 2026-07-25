package quotation

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type RfqPageImage struct {
	Page        int    `json:"page"`
	ImageBase64 string `json:"image_base64"`
	MIME        string `json:"mime,omitempty"`
}

type RfqRunInput struct {
	Pages           []RfqPageInput       `json:"pages"`
	Tables          []RfqStructuredTable `json:"tables,omitempty"`
	PageImages      []RfqPageImage       `json:"page_images,omitempty"`
	ForceColumns    []string             `json:"force_columns,omitempty"`
	HeaderOverrides map[string]string    `json:"header_overrides,omitempty"`
	PartnerID       *int64               `json:"partner_id,omitempty"`
	ForceAI         bool                 `json:"force_ai,omitempty"`
}

type RfqRunResult struct {
	DocumentType   RfqDocumentType  `json:"document_type"`
	Lines          []ParsedRfqLine  `json:"lines"`
	Matched        []RfqMatchedLine `json:"matched"`
	LineCount      int              `json:"line_count"`
	TableDetected  bool             `json:"table_detected"`
	AIUsed         bool             `json:"ai_used"`
	AIModel        string           `json:"ai_model,omitempty"`
	AIProvider     string           `json:"ai_provider,omitempty"`
	AIPages        int              `json:"ai_pages_processed,omitempty"`
	AIUsedVision   bool             `json:"ai_used_vision,omitempty"`
	PagesTruncated int              `json:"pages_truncated,omitempty"`
	AIWarning      string           `json:"ai_warning,omitempty"`
	Blocked        bool             `json:"blocked"`
	BlockedReason  string           `json:"blocked_reason,omitempty"`
}

func runRfqImport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, rfqAIParseMaxBodyBytes)
		var input RfqRunInput
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			if err == io.EOF {
				response.Validation(w, map[string]string{"body": "Request body is required."})
				return
			}
			response.Validation(w, map[string]string{"body": "Invalid JSON or payload too large (max 32 MB)."})
			return
		}
		if len(input.Pages) == 0 && len(input.Tables) == 0 {
			response.Validation(w, map[string]string{"pages": "At least one page or table is required."})
			return
		}
		result, err := RunRfqImportPipeline(r.Context(), pool, tu, input)
		if err != nil {
			response.Err(w, http.StatusBadGateway, err.Error(), "ERR_RFQ_RUN")
			return
		}
		response.OK(w, result, "Smart RFQ completed.")
	}
}

func RunRfqImportPipeline(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, input RfqRunInput) (RfqRunResult, error) {
	opts := RfqParseOptions{
		ForceColumns:    input.ForceColumns,
		HeaderOverrides: input.HeaderOverrides,
	}
	deterministic, documentType := ParseRfqDeterministic(input.Pages, input.Tables, opts)
	out := RfqRunResult{
		DocumentType:  documentType,
		Lines:         deterministic.Lines,
		LineCount:     len(deterministic.Lines),
		TableDetected: deterministic.TableDetected,
	}
	if documentType == RfqDocumentInvoiceLike {
		out.Blocked = true
		out.BlockedReason = "This document looks like an invoice, not an RFQ or BOQ."
		out.Lines = []ParsedRfqLine{}
		out.Matched = []RfqMatchedLine{}
		out.LineCount = 0
		return out, nil
	}

	cfg := RfqAIConfigFromEnv()
	shouldAI := input.ForceAI || rfqParseNeedsAI(deterministic)
	if documentType == RfqDocumentGovernmentSpec {
		// Strong deterministic parents: skip VL unless force_ai (Enhance with AI remains available).
		strong := len(deterministic.Lines) > 0
		for _, line := range deterministic.Lines {
			if line.Confidence < 0.9 {
				strong = false
				break
			}
		}
		if !strong {
			shouldAI = true
		}
	}
	if shouldAI && cfg.Available() {
		aiInputs := buildRfqAIInputs(input.Pages, input.PageImages)
		aiResult, usage, err := ParseRfqWithAIForType(ctx, cfg, aiInputs, input.Tables, documentType)
		if err != nil {
			if input.ForceAI || len(deterministic.Lines) == 0 {
				return RfqRunResult{}, err
			}
			out.AIWarning = err.Error()
		} else {
			out.AIUsed = true
			out.AIModel = usage.Model
			out.AIProvider = usage.Provider
			out.AIPages = usage.PagesProcessed
			out.AIUsedVision = usage.UsedVision
			out.PagesTruncated = maxInt(0, len(input.Pages)-usage.PagesProcessed)
			out.Lines = mergeRfqAIWithDeterministic(deterministic.Lines, aiResult.Lines, documentType)
			out.LineCount = len(out.Lines)
			out.TableDetected = deterministic.TableDetected || aiResult.TableDetected
		}
	} else if input.ForceAI {
		return RfqRunResult{}, fmt.Errorf("RFQ AI is not configured")
	} else if shouldAI {
		out.AIWarning = "RFQ AI is unavailable; deterministic extraction was used."
	}

	var partnerID int64
	if input.PartnerID != nil && *input.PartnerID > 0 {
		partnerID = *input.PartnerID
	}
	out.Matched = MatchRfqLines(ctx, pool, tu.TenantID, partnerID, out.Lines)
	return out, nil
}

func buildRfqAIInputs(pages []RfqPageInput, images []RfqPageImage) []rfqAIPageInput {
	imageByPage := make(map[int]RfqPageImage, len(images))
	for _, image := range images {
		if image.Page > 0 && strings.TrimSpace(image.ImageBase64) != "" {
			imageByPage[image.Page] = image
		}
	}
	out := make([]rfqAIPageInput, 0, len(pages))
	for _, page := range pages {
		input := rfqAIPageInput{Page: page.Page, Text: page.Text}
		if image, ok := imageByPage[page.Page]; ok {
			input.ImageBase64 = image.ImageBase64
			input.ImageMIME = image.MIME
		}
		out = append(out, input)
	}
	return out
}

func rfqParseNeedsAI(result RfqParseResult) bool {
	if len(result.Lines) == 0 || !result.TableDetected {
		return true
	}
	weak := 0
	for _, line := range result.Lines {
		if line.Confidence < 0.65 || (strings.TrimSpace(line.ItemName) == "" && strings.TrimSpace(line.Description) == "") {
			weak++
		}
	}
	return weak*10 > len(result.Lines)*4
}

func mergeRfqAIWithDeterministic(deterministic, ai []ParsedRfqLine, documentType RfqDocumentType) []ParsedRfqLine {
	result := append([]ParsedRfqLine(nil), deterministic...)
	index := map[string]int{}
	for i, line := range result {
		index[rfqLineIdentity(line)] = i
	}
	for _, candidate := range ai {
		key := rfqLineIdentity(candidate)
		if i, ok := index[key]; ok {
			result[i] = enrichRfqLine(result[i], candidate)
			continue
		}
		// Government section extraction has an exact deterministic parent-item count.
		// AI may enrich those parents but must not turn spec bullets into extra products.
		if documentType == RfqDocumentGovernmentSpec && len(deterministic) > 0 {
			continue
		}
		index[key] = len(result)
		result = append(result, candidate)
	}
	return SanitizeRfqParseResult(RfqParseResult{Lines: result, TableDetected: len(result) > 0}, documentType).Lines
}

func rfqLineIdentity(line ParsedRfqLine) string {
	title := strings.ToLower(strings.TrimSpace(line.ItemName))
	if title == "" {
		title = strings.ToLower(shortRfqItemTitle(line.Description))
	}
	title = normalizeRfqIdentityTokens(title)
	return title + "|" + strings.TrimSpace(line.Qty)
}

func normalizeRfqIdentityTokens(title string) string {
	title = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9', r == ' ':
			return r
		default:
			return ' '
		}
	}, title)
	parts := strings.Fields(title)
	return strings.Join(parts, " ")
}

func enrichRfqLine(base, candidate ParsedRfqLine) ParsedRfqLine {
	if base.ItemCode == "" {
		base.ItemCode = candidate.ItemCode
	}
	if base.ItemName == "" {
		base.ItemName = candidate.ItemName
	}
	if base.Description == "" || len(candidate.Description) > len(base.Description) {
		base.Description = candidate.Description
	}
	if base.Remarks == "" {
		base.Remarks = candidate.Remarks
	}
	if base.Unit == "" {
		base.Unit = candidate.Unit
	}
	if base.UnitPrice == "" {
		base.UnitPrice = candidate.UnitPrice
	}
	if base.LineTotal == "" {
		base.LineTotal = candidate.LineTotal
	}
	if candidate.Confidence > base.Confidence {
		base.Confidence = candidate.Confidence
	}
	return base
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
