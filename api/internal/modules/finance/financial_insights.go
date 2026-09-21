package finance

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type insightsMetricRow struct {
	Key                string  `json:"key"`
	Label              string  `json:"label"`
	MetricType         string  `json:"metric_type"`
	PreferredDirection string  `json:"preferred_direction"`
	Format             string  `json:"format"`
	PrimaryKPI         bool    `json:"primary_kpi"`
	MetricDelta
	Href string `json:"href,omitempty"`
}

type insightsOverview struct {
	CurrentFrom    string              `json:"current_from"`
	CurrentTo      string              `json:"current_to"`
	CompareFrom    string              `json:"compare_from"`
	CompareTo      string              `json:"compare_to"`
	ComparisonType string              `json:"comparison_type"`
	YTDFrom        string              `json:"ytd_from"`
	YTDTo          string              `json:"ytd_to"`
	PriorYTDFrom   string              `json:"prior_ytd_from"`
	PriorYTDTo     string              `json:"prior_ytd_to"`
	HasJournalData bool                `json:"has_journal_data"`
	Metrics        []insightsMetricRow `json:"metrics"`
}

func registerFinancialInsightsRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.journal_entries", auth.AccessRead)).
		Get("/insights/overview", financialInsightsOverview(pool))
}

func financialInsightsOverview(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateFrom, dateTo, ok := reports.ValidationDateRange(w, r)
		if !ok {
			return
		}
		now := time.Now().UTC()
		if dateTo == nil {
			t := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
			dateTo = &t
		}
		if dateFrom == nil {
			t := time.Date(dateTo.Year(), dateTo.Month(), 1, 0, 0, 0, 0, time.UTC)
			dateFrom = &t
		}

		cmp := ComparisonType(strings.TrimSpace(strings.ToLower(r.URL.Query().Get("comparison"))))
		if cmp == "" {
			cmp = ComparePreviousMonth
		}
		var customFrom, customTo *time.Time
		if cf, ok := parseInsightsDate(r.URL.Query().Get("compare_from")); ok {
			customFrom = &cf
		}
		if ct, ok := parseInsightsDate(r.URL.Query().Get("compare_to")); ok {
			customTo = &ct
		}

		fy, _ := FiscalYearStartContaining(r.Context(), pool, tu.TenantID, *dateTo)
		periods, err := ResolveComparison(cmp, *dateFrom, *dateTo, fy, customFrom, customTo)
		if err != nil {
			response.Validation(w, map[string]string{"comparison": err.Error()})
			return
		}

		cur, err := LoadWindowTotals(r.Context(), pool, tu.TenantID, periods.CurrentFrom, periods.CurrentTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load current metrics.", "ERR_INTERNAL")
			return
		}
		prev, err := LoadWindowTotals(r.Context(), pool, tu.TenantID, periods.CompareFrom, periods.CompareTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load comparison metrics.", "ERR_INTERNAL")
			return
		}
		ytd, err := LoadWindowTotals(r.Context(), pool, tu.TenantID, periods.YTDFrom, periods.YTDTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load YTD metrics.", "ERR_INTERNAL")
			return
		}
		priorYTD, err := LoadWindowTotals(r.Context(), pool, tu.TenantID, periods.PriorYTDFrom, periods.PriorYTDTo)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load prior YTD metrics.", "ERR_INTERNAL")
			return
		}

		metrics := make([]insightsMetricRow, 0, len(MetricDictionary()))
		for _, def := range MetricDictionary() {
			delta := BuildMetricDelta(def, cur.ValueFor(def.Key), prev.ValueFor(def.Key), ytd.ValueFor(def.Key), priorYTD.ValueFor(def.Key))
			metrics = append(metrics, insightsMetricRow{
				Key:                string(def.Key),
				Label:              def.Label,
				MetricType:         string(def.Type),
				PreferredDirection: string(def.PreferredDirection),
				Format:             def.Format,
				PrimaryKPI:         def.PrimaryKPI,
				MetricDelta:        delta,
				Href:               insightsMetricHref(def.Key, periods.CurrentFrom, periods.CurrentTo),
			})
		}

		response.OK(w, insightsOverview{
			CurrentFrom:    periods.CurrentFrom.Format("2006-01-02"),
			CurrentTo:      periods.CurrentTo.Format("2006-01-02"),
			CompareFrom:    periods.CompareFrom.Format("2006-01-02"),
			CompareTo:      periods.CompareTo.Format("2006-01-02"),
			ComparisonType: string(periods.Comparison),
			YTDFrom:        periods.YTDFrom.Format("2006-01-02"),
			YTDTo:          periods.YTDTo.Format("2006-01-02"),
			PriorYTDFrom:   periods.PriorYTDFrom.Format("2006-01-02"),
			PriorYTDTo:     periods.PriorYTDTo.Format("2006-01-02"),
			HasJournalData: cur.HasJournalData || prev.HasJournalData || ytd.HasJournalData,
			Metrics:        metrics,
		}, "OK")
	}
}

func parseInsightsDate(raw string) (time.Time, bool) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return time.Time{}, false
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return time.Time{}, false
	}
	return t, true
}

func insightsMetricHref(key MetricKey, from, to time.Time) string {
	qs := "date_from=" + from.Format("2006-01-02") + "&date_to=" + to.Format("2006-01-02")
	switch key {
	case MetricCash:
		return "/app/finance/acct-i/reports/balance-sheet?" + qs
	case MetricAccountsReceivable:
		return "/app/finance/reports/ar-aging"
	default:
		return "/app/finance/acct-i/reports/profit-and-loss?" + qs
	}
}
