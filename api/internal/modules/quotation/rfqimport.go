package quotation

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/inventory"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const rfqImportMaxUploadBytes = 50 << 20
const rfqAIParseMaxBodyBytes = 32 << 20

type rfqPageText struct {
	Page            int       `json:"page"`
	Text            string    `json:"text"`
	Words           []RfqWord `json:"words,omitempty"`
	Width           float64   `json:"width,omitempty"`
	Height          float64   `json:"height,omitempty"`
	SourcePDFPage   int       `json:"source_pdf_page,omitempty"`
	SourceFileIndex int       `json:"source_file_index,omitempty"`
}

type rfqParseRequest struct {
	Pages           []rfqPageText        `json:"pages"`
	Tables          []RfqStructuredTable `json:"tables,omitempty"`
	ForceColumns    []string             `json:"force_columns,omitempty"`
	HeaderOverrides map[string]string    `json:"header_overrides,omitempty"`
}

type rfqMatchRequest struct {
	Lines     []ParsedRfqLine `json:"lines"`
	PartnerID *int64          `json:"partner_id,omitempty"`
}

type RfqItemAlternative struct {
	ItemID     int64   `json:"item_id"`
	ItemCode   string  `json:"item_code"`
	ItemName   string  `json:"item_name"`
	SalesPrice float64 `json:"sales_price"`
	MatchScore float64 `json:"match_score"`
}

type RfqMatchedLine struct {
	ParsedRfqLine
	ItemID       *int64               `json:"item_id"`
	ItemCode     string               `json:"item_code"`
	ItemName     string               `json:"item_name"`
	SalesPrice   float64              `json:"sales_price"`
	UnitID       *int64               `json:"unit_id,omitempty"`
	UnitCode     string               `json:"unit_code,omitempty"`
	RfqUnitPrice float64              `json:"rfq_unit_price,omitempty"`
	MatchScore   float64              `json:"match_score"`
	Alternatives []RfqItemAlternative `json:"alternatives,omitempty"`
}

func registerRfqImportRoutes(r chi.Router, pool *pgxpool.Pool) {
	requireQuotation := auth.RequirePermission("quotation.quotations", auth.AccessRead)
	r.With(requireQuotation).Post("/rfq-import/extract-pdf", extractRfqPDF(pool))
	r.With(requireQuotation).Post("/rfq-import/parse", parseRfqImport(pool))
	r.With(requireQuotation).Post("/rfq-import/ai-parse", aiParseRfqImport(pool))
	r.With(requireQuotation).Post("/rfq-import/run", runRfqImport(pool))
	r.With(requireQuotation).Get("/rfq-import/ai-config", rfqAIConfigHandler())
	r.With(requireQuotation).Post("/rfq-import/match-items", matchRfqImportItems(pool))
}

func extractRfqPDF(_ *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.FromContext(r.Context()); !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		if err := r.ParseMultipartForm(rfqImportMaxUploadBytes + 1024); err != nil {
			response.Validation(w, map[string]string{"file": "Invalid upload or file too large (max 50 MB)."})
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			response.Validation(w, map[string]string{"file": "PDF file is required."})
			return
		}
		defer file.Close()
		data, err := readAllLimited(file, rfqImportMaxUploadBytes)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}

		opts := rfqPDFExtractOptions{FilterNonTable: true}
		if v := strings.TrimSpace(r.FormValue("page_from")); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				opts.PageFrom = n
			}
		}
		if v := strings.TrimSpace(r.FormValue("page_to")); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				opts.PageTo = n
			}
		}
		if v := strings.TrimSpace(r.FormValue("filter_non_table")); v == "0" || v == "false" {
			opts.FilterNonTable = false
		}

		result, err := extractRfqPDFPages(data, opts)
		if err != nil {
			response.Validation(w, map[string]string{"file": err.Error()})
			return
		}

		emptyText := 0
		pagesOut := make([]rfqPageText, len(result.Pages))
		for i, p := range result.Pages {
			if strings.TrimSpace(p.Text) == "" && len(p.Words) == 0 {
				emptyText++
			}
			pagesOut[i] = rfqPageText{
				Page: p.Page, Text: p.Text, Words: p.Words, Width: p.Width, Height: p.Height,
				SourcePDFPage: p.SourcePDFPage,
			}
		}

		response.OK(w, map[string]any{
			"pages":            pagesOut,
			"total_pages":      result.TotalPages,
			"skipped_pages":    result.Skipped,
			"extracted_pages":  len(pagesOut),
			"empty_text_pages": emptyText,
			"text_only":        result.TextOnly,
			"server_extract":   result.ServerParse,
		}, "PDF extracted.")
	}
}

func parseRfqImport(_ *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if _, ok := auth.FromContext(r.Context()); !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body rfqParseRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.Pages) == 0 && len(body.Tables) == 0 {
			response.Validation(w, map[string]string{"pages": "At least one page or table is required."})
			return
		}
		pages := make([]RfqPageInput, len(body.Pages))
		for i, p := range body.Pages {
			pages[i] = RfqPageInput{
				Page:            p.Page,
				Text:            p.Text,
				Words:           p.Words,
				Width:           p.Width,
				Height:          p.Height,
				SourcePDFPage:   p.SourcePDFPage,
				SourceFileIndex: p.SourceFileIndex,
			}
		}
		opts := RfqParseOptions{
			ForceColumns:    body.ForceColumns,
			HeaderOverrides: body.HeaderOverrides,
		}
		result, documentType := ParseRfqDeterministic(pages, body.Tables, opts)
		blocked, blockedReason := rfqBlockedReason(documentType)
		response.OK(w, map[string]any{
			"lines":            result.Lines,
			"page_count":       len(body.Pages),
			"table_count":      len(body.Tables),
			"line_count":       len(result.Lines),
			"table_detected":   result.TableDetected,
			"detected_columns": result.DetectedColumns,
			"document_type":    documentType,
			"blocked":          blocked,
			"blocked_reason":   blockedReason,
		}, "RFQ parsed.")
	}
}

// rfqBlockedReason centralizes document types that must never produce quotation lines.
func rfqBlockedReason(documentType RfqDocumentType) (bool, string) {
	switch documentType {
	case RfqDocumentInvoiceLike:
		return true, "This document looks like an invoice, not an RFQ or BOQ."
	case RfqDocumentSpecSheet:
		return true, "This looks like a technical specification sheet with no order quantities. " +
			"Import the RFQ or BOQ pages instead — spec sheets are reference attachments, not line items."
	default:
		return false, ""
	}
}

func matchRfqImportItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Not authenticated.", "ERR_UNAUTHORIZED")
			return
		}
		var body rfqMatchRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		var partnerID int64
		if body.PartnerID != nil {
			partnerID = *body.PartnerID
		}
		out := MatchRfqLines(r.Context(), pool, tu.TenantID, partnerID, body.Lines)
		response.OK(w, map[string]any{"lines": out}, "Items matched.")
	}
}

func MatchRfqLines(ctx context.Context, pool *pgxpool.Pool, tenantID, partnerID int64, lines []ParsedRfqLine) []RfqMatchedLine {
	out := make([]RfqMatchedLine, 0, len(lines))
	for _, original := range lines {
		queryLine := original
		queryLine.Description = rfqMatchQuery(original)
		matched := RfqMatchedLine{ParsedRfqLine: original}
		if v := parseMoneyFloat(original.UnitPrice); v > 0 {
			matched.RfqUnitPrice = v
		}
		candidates := lookupRfqItemCandidates(ctx, pool, tenantID, queryLine, 5)
		if len(candidates) > 0 {
			best := candidates[0]
			if best.Score >= 0.7 {
				matched.ItemID = &best.ID
				matched.ItemCode = best.Code
				matched.ItemName = best.Name
				matched.SalesPrice = resolveRfqSalesPrice(ctx, pool, tenantID, best.ID, partnerID, best.SalesPrice)
				matched.MatchScore = best.Score
			}
			for _, alt := range candidates {
				price := resolveRfqSalesPrice(ctx, pool, tenantID, alt.ID, partnerID, alt.SalesPrice)
				matched.Alternatives = append(matched.Alternatives, RfqItemAlternative{
					ItemID: alt.ID, ItemCode: alt.Code, ItemName: alt.Name,
					SalesPrice: price, MatchScore: alt.Score,
				})
			}
		}
		if matched.ItemCode == "" && strings.TrimSpace(original.ItemCode) != "" {
			matched.ItemCode = original.ItemCode
		}
		if matched.ItemName == "" {
			matched.ItemName = original.ItemName
		}
		if matched.ItemName == "" && strings.TrimSpace(original.Description) != "" {
			matched.ItemName = shortRfqItemTitle(original.Description)
		}
		if matched.SalesPrice == 0 && matched.RfqUnitPrice > 0 {
			matched.SalesPrice = matched.RfqUnitPrice
		}
		matched.UnitID, matched.UnitCode = resolveRfqLineUnit(ctx, pool, tenantID, matched.ItemID, original.Unit)
		out = append(out, matched)
	}
	return out
}

// rfqUnitLookupFallbacks maps normalized RFQ unit codes to tenant unit codes that
// mean the same thing (inv_units seeds "pc"; RFQ normalization emits "pcs").
var rfqUnitLookupFallbacks = map[string][]string{
	"pcs": {"pc", "piece"},
	"pc":  {"pcs"},
	"ea":  {"each"},
}

// resolveRfqLineUnit turns the unit text scraped from the RFQ into a structured
// unit where possible, so the quotation draft carries a real UoM instead of a
// remark. Unrecognized text is returned as a code-only hint.
func resolveRfqLineUnit(ctx context.Context, pool *pgxpool.Pool, tenantID int64, itemID *int64, rawUnit string) (*int64, string) {
	if id, code, ok := inventory.LookupUnitByCode(ctx, pool, tenantID, rawUnit); ok {
		return &id, code
	}
	for _, alias := range rfqUnitLookupFallbacks[strings.ToLower(strings.TrimSpace(rawUnit))] {
		if id, code, ok := inventory.LookupUnitByCode(ctx, pool, tenantID, alias); ok {
			return &id, code
		}
	}
	if itemID != nil && *itemID > 0 {
		if baseID, baseCode, err := inventory.ItemBaseUnit(ctx, pool, tenantID, *itemID); err == nil && baseID > 0 {
			return &baseID, baseCode
		}
	}
	return nil, ""
}

func resolveRfqSalesPrice(ctx context.Context, pool *pgxpool.Pool, tenantID, itemID, partnerID int64, current float64) float64 {
	if partnerID <= 0 {
		return current
	}
	return inventory.ResolveSellingUnitPrice(ctx, pool, tenantID, itemID, partnerID, current)
}

func parseMoneyFloat(s string) float64 {
	s = strings.TrimSpace(strings.ReplaceAll(s, ",", ""))
	if s == "" {
		return 0
	}
	v, err := strconv.ParseFloat(s, 64)
	if err != nil || v <= 0 {
		return 0
	}
	return v
}

type rfqItemHit struct {
	ID         int64
	Code       string
	Name       string
	SalesPrice float64
}

func lookupRfqItem(ctx context.Context, pool *pgxpool.Pool, tenantID int64, ln ParsedRfqLine) (*rfqItemHit, float64) {
	code := strings.TrimSpace(ln.ItemCode)
	desc := strings.TrimSpace(ln.Description)
	if code != "" {
		var hit rfqItemHit
		err := pool.QueryRow(ctx, `
			select id, item_code, item_name, coalesce(sales_price, 0)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null
			  and lower(item_code) = lower($2)
			limit 1`, tenantID, code).Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice)
		if err == nil {
			return &hit, 1.0
		}
	}
	if code != "" {
		var hit rfqItemHit
		err := pool.QueryRow(ctx, `
			select id, item_code, item_name, coalesce(sales_price, 0)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null
			  and item_code ilike $2
			order by length(item_code)
			limit 1`, tenantID, "%"+code+"%").Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice)
		if err == nil {
			return &hit, 0.85
		}
	}
	if desc != "" {
		var hit rfqItemHit
		err := pool.QueryRow(ctx, `
			select id, item_code, item_name, coalesce(sales_price, 0)
			from public.inv_items
			where tenant_id = $1 and deleted_at is null
			  and item_name ilike $2
			order by length(item_name)
			limit 1`, tenantID, "%"+desc+"%").Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice)
		if err == nil {
			return &hit, 0.7
		}
		// Token match on first significant word.
		tok := firstSignificantToken(desc)
		if tok != "" {
			err = pool.QueryRow(ctx, `
				select id, item_code, item_name, coalesce(sales_price, 0)
				from public.inv_items
				where tenant_id = $1 and deleted_at is null
				  and (item_name ilike $2 or item_code ilike $2)
				order by length(item_name)
				limit 1`, tenantID, "%"+tok+"%").Scan(&hit.ID, &hit.Code, &hit.Name, &hit.SalesPrice)
			if err == nil {
				return &hit, 0.55
			}
		}
	}
	return nil, 0
}

func firstSignificantToken(s string) string {
	stop := map[string]struct{}{
		"with": {}, "from": {}, "minimum": {}, "technical": {}, "specifications": {},
		"item": {}, "unit": {}, "supply": {}, "including": {},
	}
	for _, part := range strings.Fields(s) {
		p := strings.Trim(part, ".,;:-()[]")
		if len(p) >= 4 {
			if _, generic := stop[strings.ToLower(p)]; generic {
				continue
			}
			return p
		}
	}
	return ""
}
