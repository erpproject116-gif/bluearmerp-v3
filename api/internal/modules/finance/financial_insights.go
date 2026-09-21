package finance

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/reports"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type insightsMetricRow struct {
	Key                string `json:"key"`
	Label              string `json:"label"`
	MetricType         string `json:"metric_type"`
	PreferredDirection string `json:"preferred_direction"`
	Format             string `json:"format"`
	PrimaryKPI         bool   `json:"primary_kpi"`
	MetricDelta
	Href string `json:"href,omitempty"`
}

type insightsDataQuality struct {
	DraftJournalEntries            int64 `json:"draft_journal_entries"`
	ConfirmedSalesDraftOrMissingJE int64 `json:"confirmed_sales_draft_or_missing_je"`
	ConfirmedBillsDraftOrMissingJE int64 `json:"confirmed_bills_draft_or_missing_je"`
	Incomplete                     bool  `json:"incomplete"`
	Message                        string `json:"message,omitempty"`
	Href                           string `json:"href,omitempty"`
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
	KeyChanges     []KeyChange         `json:"key_changes"`
	DataQuality    insightsDataQuality `json:"data_quality"`
}

type insightsTrendsResponse struct {
	Interval string        `json:"interval"`
	From     string        `json:"from"`
	To       string        `json:"to"`
	Buckets  []TrendBucket `json:"buckets"`
}

type insightsContributorsResponse struct {
	MetricKey   string                `json:"metric_key"`
	CurrentFrom string                `json:"current_from"`
	CurrentTo   string                `json:"current_to"`
	CompareFrom string                `json:"compare_from"`
	CompareTo   string                `json:"compare_to"`
	Rows        []AccountContribution `json:"rows"`
}

func registerFinancialInsightsRoutes(r chi.Router, pool *pgxpool.Pool) {
	perm := auth.RequirePermission("finance.journal_entries", auth.AccessRead)
	r.With(perm).Get("/insights/overview", financialInsightsOverview(pool))
	r.With(perm).Get("/insights/trends", financialInsightsTrends(pool))
	r.With(perm).Get("/insights/contributors", financialInsightsContributors(pool))
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

		dq := loadInsightsDataQuality(r.Context(), pool, tu.TenantID)

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
			KeyChanges:     BuildKeyChanges(metrics, 6),
			DataQuality:    dq,
		}, "OK")
	}
}

func financialInsightsTrends(pool *pgxpool.Pool) http.HandlerFunc {
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
			t := dateTo.AddDate(0, -9, 0)
			t = time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
			dateFrom = &t
		}
		interval := TrendInterval(strings.TrimSpace(strings.ToLower(r.URL.Query().Get("interval"))))
		if interval == "" {
			interval = TrendMonth
		}
		if interval != TrendMonth && interval != TrendQuarter && interval != TrendYear {
			response.Validation(w, map[string]string{"interval": "Use month, quarter, or year."})
			return
		}
		buckets, err := LoadTrendSeries(r.Context(), pool, tu.TenantID, *dateFrom, *dateTo, interval)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load trends.", "ERR_INTERNAL")
			return
		}
		response.OK(w, insightsTrendsResponse{
			Interval: string(interval),
			From:     dateFrom.Format("2006-01-02"),
			To:       dateTo.Format("2006-01-02"),
			Buckets:  buckets,
		}, "OK")
	}
}

func financialInsightsContributors(pool *pgxpool.Pool) http.HandlerFunc {
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
		metricKey := MetricKey(strings.TrimSpace(strings.ToLower(r.URL.Query().Get("metric"))))
		if metricKey == "" {
			metricKey = MetricOperatingExpenses
		}
		fy, _ := FiscalYearStartContaining(r.Context(), pool, tu.TenantID, *dateTo)
		periods, err := ResolveComparison(cmp, *dateFrom, *dateTo, fy, customFrom, customTo)
		if err != nil {
			response.Validation(w, map[string]string{"comparison": err.Error()})
			return
		}
		limit := 8
		if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
			if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 25 {
				limit = n
			}
		}
		rows, err := LoadAccountContributors(
			r.Context(), pool, tu.TenantID,
			periods.CurrentFrom, periods.CurrentTo,
			periods.CompareFrom, periods.CompareTo,
			metricKey, limit,
		)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load contributors.", "ERR_INTERNAL")
			return
		}
		response.OK(w, insightsContributorsResponse{
			MetricKey:   string(metricKey),
			CurrentFrom: periods.CurrentFrom.Format("2006-01-02"),
			CurrentTo:   periods.CurrentTo.Format("2006-01-02"),
			CompareFrom: periods.CompareFrom.Format("2006-01-02"),
			CompareTo:   periods.CompareTo.Format("2006-01-02"),
			Rows:        rows,
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

func loadInsightsDataQuality(ctx context.Context, pool *pgxpool.Pool, tenantID int64) insightsDataQuality {
	var draft, salesMiss, billsMiss int64
	_ = pool.QueryRow(ctx, `
		select count(*) from public.fin_journal_entries
		where tenant_id = $1 and status = 'draft'`, tenantID).Scan(&draft)
	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.sa_sales s
		left join public.fin_journal_entries je on je.id = s.invoice_journal_entry_id
		where s.tenant_id = $1 and s.deleted_at is null
		  and s.grand_total > 0.0001
		  and coalesce(s.progress_status, '') in ('completed', 'confirm', 'e_approval', 'confirmed', 'approved', 'released', 'shipped')
		  and (s.invoice_journal_entry_id is null or coalesce(je.status, 'draft') = 'draft')`,
		tenantID).Scan(&salesMiss)
	_ = pool.QueryRow(ctx, `
		select count(*)
		from public.fin_supplier_invoices si
		left join public.fin_journal_entries je on je.id = si.invoice_journal_entry_id
		where si.tenant_id = $1 and si.deleted_at is null
		  and si.grand_total > 0.0001
		  and coalesce(si.progress_status, '') in ('completed', 'confirm', 'e_approval')
		  and (si.invoice_journal_entry_id is null or coalesce(je.status, 'draft') = 'draft')`,
		tenantID).Scan(&billsMiss)

	dq := insightsDataQuality{
		DraftJournalEntries:            draft,
		ConfirmedSalesDraftOrMissingJE: salesMiss,
		ConfirmedBillsDraftOrMissingJE: billsMiss,
		Href:                           "/app/finance/bookkeeping",
	}
	parts := []string{}
	if draft > 0 {
		parts = append(parts, strconv.FormatInt(draft, 10)+" draft journal(s)")
	}
	if salesMiss > 0 {
		parts = append(parts, strconv.FormatInt(salesMiss, 10)+" confirmed sale(s) without posted JE")
	}
	if billsMiss > 0 {
		parts = append(parts, strconv.FormatInt(billsMiss, 10)+" confirmed bill(s) without posted JE")
	}
	if len(parts) > 0 {
		dq.Incomplete = true
		dq.Message = "Financial data may be incomplete: " + strings.Join(parts, "; ") + "."
	}
	return dq
}
