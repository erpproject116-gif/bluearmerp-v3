package finance

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bankMatchRule struct {
	ID                  int64   `json:"id"`
	DescriptionContains string  `json:"description_contains"`
	SuggestType         string  `json:"suggest_type"`
	SuggestCategory     *string `json:"suggest_category,omitempty"`
	IsActive            bool    `json:"is_active"`
}

type bankMatchRuleBody struct {
	DescriptionContains string  `json:"description_contains"`
	SuggestType         string  `json:"suggest_type"`
	SuggestCategory     *string `json:"suggest_category"`
	IsActive            *bool   `json:"is_active"`
}

func registerBankMatchRuleRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.bank_reconciliation", auth.AccessRead)).Get("/bank-match-rules", listBankMatchRules(pool))
	r.With(auth.RequirePermission("finance.bank_reconciliation", auth.AccessWrite)).Post("/bank-match-rules", createBankMatchRule(pool))
	r.With(auth.RequirePermission("finance.bank_reconciliation", auth.AccessWrite)).Patch("/bank-match-rules/{id}", patchBankMatchRule(pool))
	r.With(auth.RequirePermission("finance.bank_reconciliation", auth.AccessWrite)).Delete("/bank-match-rules/{id}", deleteBankMatchRule(pool))
}

func listBankMatchRules(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		rows, err := pool.Query(r.Context(), `
			select id, description_contains, suggest_type, suggest_category, is_active
			from public.fin_bank_match_rules
			where tenant_id = $1
			order by id desc`, tu.TenantID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to list match rules.", "ERR_INTERNAL")
			return
		}
		defer rows.Close()
		var out []bankMatchRule
		for rows.Next() {
			var row bankMatchRule
			if err := rows.Scan(&row.ID, &row.DescriptionContains, &row.SuggestType, &row.SuggestCategory, &row.IsActive); err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to read match rules.", "ERR_INTERNAL")
				return
			}
			out = append(out, row)
		}
		if out == nil {
			out = []bankMatchRule{}
		}
		response.OK(w, out, "OK")
	}
}

func validateBankMatchRuleBody(body bankMatchRuleBody) map[string]string {
	errs := map[string]string{}
	if strings.TrimSpace(body.DescriptionContains) == "" {
		errs["description_contains"] = "Pattern is required."
	}
	st := strings.TrimSpace(strings.ToLower(body.SuggestType))
	if st != "official_receipt" && st != "payment_voucher" && st != "expense" {
		errs["suggest_type"] = "Must be official_receipt, payment_voucher, or expense."
	}
	return errs
}

func createBankMatchRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body bankMatchRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if errs := validateBankMatchRuleBody(body); len(errs) > 0 {
			response.Validation(w, errs)
			return
		}
		active := true
		if body.IsActive != nil {
			active = *body.IsActive
		}
		var id int64
		err := pool.QueryRow(r.Context(), `
			insert into public.fin_bank_match_rules (tenant_id, description_contains, suggest_type, suggest_category, is_active)
			values ($1,$2,$3,$4,$5) returning id`,
			tu.TenantID, strings.TrimSpace(body.DescriptionContains),
			strings.ToLower(strings.TrimSpace(body.SuggestType)), nullableTrim(body.SuggestCategory), active,
		).Scan(&id)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create rule.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "finance.bank_match_rule.create", "fin_bank_match_rule", &id, nil, body)
		response.OK(w, bankMatchRule{ID: id, DescriptionContains: strings.TrimSpace(body.DescriptionContains),
			SuggestType: strings.ToLower(strings.TrimSpace(body.SuggestType)), SuggestCategory: nullableTrim(body.SuggestCategory), IsActive: active}, "Created.")
	}
}

func patchBankMatchRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body bankMatchRuleBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			update public.fin_bank_match_rules set
			  description_contains = coalesce(nullif($3,''), description_contains),
			  suggest_type = coalesce(nullif($4,''), suggest_type),
			  suggest_category = coalesce($5, suggest_category),
			  is_active = coalesce($6, is_active),
			  updated_at = now()
			where id = $1 and tenant_id = $2`,
			id, tu.TenantID, strings.TrimSpace(body.DescriptionContains),
			strings.ToLower(strings.TrimSpace(body.SuggestType)), nullableTrim(body.SuggestCategory), body.IsActive,
		)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, map[string]any{"id": id}, "Updated.")
	}
}

func deleteBankMatchRule(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		tag, err := pool.Exec(r.Context(), `
			delete from public.fin_bank_match_rules where id = $1 and tenant_id = $2`, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		response.OK(w, nil, "Deleted.")
	}
}

type bankMatchSuggestion struct {
	SuggestType     string  `json:"suggest_type"`
	SuggestCategory *string `json:"suggest_category,omitempty"`
	RuleID          int64   `json:"rule_id"`
}

func suggestBankMatch(ctx context.Context, pool *pgxpool.Pool, tenantID int64, description string) *bankMatchSuggestion {
	desc := strings.ToLower(strings.TrimSpace(description))
	if desc == "" {
		return nil
	}
	rows, err := pool.Query(ctx, `
		select id, suggest_type, suggest_category, description_contains
		from public.fin_bank_match_rules
		where tenant_id = $1 and is_active = true
		order by id`, tenantID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var ruleID int64
		var suggestType string
		var category *string
		var pattern string
		if err := rows.Scan(&ruleID, &suggestType, &category, &pattern); err != nil {
			continue
		}
		if strings.Contains(desc, strings.ToLower(strings.TrimSpace(pattern))) {
			return &bankMatchSuggestion{SuggestType: suggestType, SuggestCategory: category, RuleID: ruleID}
		}
	}
	return nil
}

func enrichStatementLinesWithSuggestions(ctx context.Context, pool *pgxpool.Pool, tenantID int64, lines []bankStatementPlaceholder) []map[string]any {
	out := make([]map[string]any, 0, len(lines))
	for _, ln := range lines {
		m := map[string]any{
			"id": ln.ID, "bank_account_id": ln.BankAccountID, "statement_date": ln.StatementDate,
			"reference_no": ln.ReferenceNo, "description": ln.Description, "amount": ln.Amount, "is_matched": ln.IsMatched,
		}
		if !ln.IsMatched {
			if sug := suggestBankMatch(ctx, pool, tenantID, ln.Description); sug != nil {
				m["match_suggestion"] = sug
			}
		}
		out = append(out, m)
	}
	return out
}
