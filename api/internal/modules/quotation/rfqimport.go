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

type rfqPageText struct {
	Page   int       `json:"page"`
	Text   string    `json:"text"`
	Words  []RfqWord `json:"words,omitempty"`
	Width  float64   `json:"width,omitempty"`
	Height float64   `json:"height,omitempty"`
}

type rfqParseRequest struct {
	Pages           []rfqPageText          `json:"pages"`
	Tables          []RfqStructuredTable   `json:"tables,omitempty"`
	ForceColumns    []string               `json:"force_columns,omitempty"`
	HeaderOverrides map[string]string      `json:"header_overrides,omitempty"`
}

type rfqMatchRequest struct {
	Lines     []ParsedRfqLine `json:"lines"`
	PartnerID *int64          `json:"partner_id,omitempty"`
}

type rfqItemAlternative struct {
	ItemID     int64   `json:"item_id"`
	ItemCode   string  `json:"item_code"`
	ItemName   string  `json:"item_name"`
	SalesPrice float64 `json:"sales_price"`
	MatchScore float64 `json:"match_score"`
}

type rfqMatchedLine struct {
	ParsedRfqLine
	ItemID       *int64               `json:"item_id"`
	ItemCode     string               `json:"item_code"`
	ItemName     string               `json:"item_name"`
	SalesPrice   float64              `json:"sales_price"`
	RfqUnitPrice float64              `json:"rfq_unit_price,omitempty"`
	MatchScore   float64              `json:"match_score"`
	Alternatives []rfqItemAlternative `json:"alternatives,omitempty"`
}

func registerRfqImportRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/rfq-import/parse", parseRfqImport(pool))
	r.Post("/rfq-import/match-items", matchRfqImportItems(pool))
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
				Page:   p.Page,
				Text:   p.Text,
				Words:  p.Words,
				Width:  p.Width,
				Height: p.Height,
			}
		}
		opts := RfqParseOptions{
			ForceColumns:    body.ForceColumns,
			HeaderOverrides: body.HeaderOverrides,
		}
		result := mergeRfqParseResults(
			ParseRfqStructuredTables(body.Tables, opts),
			ParseRfqDocumentWithOptions(pages, opts),
		)
		response.OK(w, map[string]any{
			"lines":            result.Lines,
			"page_count":       len(body.Pages),
			"table_count":      len(body.Tables),
			"line_count":       len(result.Lines),
			"table_detected":   result.TableDetected,
			"detected_columns": result.DetectedColumns,
		}, "RFQ parsed.")
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
		out := make([]rfqMatchedLine, 0, len(body.Lines))
		for _, ln := range body.Lines {
			matched := rfqMatchedLine{ParsedRfqLine: ln}
			if v := parseMoneyFloat(ln.UnitPrice); v > 0 {
				matched.RfqUnitPrice = v
			}
			candidates := lookupRfqItemCandidates(r.Context(), pool, tu.TenantID, ln, 5)
			if len(candidates) > 0 {
				best := candidates[0]
				matched.ItemID = &best.ID
				matched.ItemCode = best.Code
				matched.ItemName = best.Name
				matched.SalesPrice = resolveRfqSalesPrice(r.Context(), pool, tu.TenantID, best.ID, partnerID, best.SalesPrice)
				matched.MatchScore = best.Score
				for _, alt := range candidates {
					price := resolveRfqSalesPrice(r.Context(), pool, tu.TenantID, alt.ID, partnerID, alt.SalesPrice)
					matched.Alternatives = append(matched.Alternatives, rfqItemAlternative{
						ItemID: alt.ID, ItemCode: alt.Code, ItemName: alt.Name,
						SalesPrice: price, MatchScore: alt.Score,
					})
				}
			} else if strings.TrimSpace(ln.ItemCode) != "" {
				matched.ItemCode = ln.ItemCode
			}
			if matched.ItemName == "" && strings.TrimSpace(ln.Description) != "" {
				matched.ItemName = ln.Description
			}
			if matched.SalesPrice == 0 && matched.RfqUnitPrice > 0 {
				matched.SalesPrice = matched.RfqUnitPrice
			}
			out = append(out, matched)
		}
		response.OK(w, map[string]any{"lines": out}, "Items matched.")
	}
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
	for _, part := range strings.Fields(s) {
		p := strings.Trim(part, ".,;:-")
		if len(p) >= 3 {
			return p
		}
	}
	return ""
}
