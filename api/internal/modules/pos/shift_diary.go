package pos

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// SessionActivityEvent is one row in the session-scoped shift diary feed.
type SessionActivityEvent struct {
	Kind      string  `json:"kind"` // sale | void | cash_in | cash_out | coin_exchange
	At        string  `json:"at"`
	SalesNo   string  `json:"sales_no,omitempty"`
	SalesID   *int64  `json:"sales_id,omitempty"`
	Amount    float64 `json:"amount,omitempty"`
	Label     string  `json:"label,omitempty"`
	Tender    string  `json:"tender,omitempty"`
	Voided    bool    `json:"voided,omitempty"`
}

// ShiftTxn is one sale line in the Z-report transaction annex.
type ShiftTxn struct {
	SalesID    int64              `json:"sales_id"`
	SalesNo    string             `json:"sales_no"`
	At         string             `json:"at"`
	GrandTotal float64            `json:"grand_total"`
	Voided     bool               `json:"voided"`
	Tenders    map[string]float64 `json:"tenders"`
}

// ZReport is the end-of-shift summary + annex (no revenue JE).
type ZReport struct {
	SessionReport
	LocationName  string                 `json:"location_name,omitempty"`
	CashierName   string                 `json:"cashier_name,omitempty"`
	OpenedAt      string                 `json:"opened_at,omitempty"`
	ClosedAt      *string                `json:"closed_at,omitempty"`
	TxnCount      int                    `json:"txn_count"`
	VoidCount     int                    `json:"void_count"`
	Transactions  []ShiftTxn             `json:"transactions"`
	CashMovements []CashMovement         `json:"cash_movements"`
	GeneratedAt   string                 `json:"generated_at"`
}

// DailyRollup aggregates POS sessions for one calendar day (ops reporting only).
type DailyRollup struct {
	Date            string             `json:"date"`
	LocationID      *int64             `json:"location_id,omitempty"`
	LocationName    string             `json:"location_name,omitempty"`
	SessionCount    int                `json:"session_count"`
	SalesTotal      float64            `json:"sales_total"`
	TxnCount        int                `json:"txn_count"`
	VoidCount       int                `json:"void_count"`
	CashTenders     float64            `json:"cash_tenders"`
	TendersByType   map[string]float64 `json:"tenders_by_type"`
	CashIn          float64            `json:"cash_in"`
	CashOut         float64            `json:"cash_out"`
	CoinExchange    float64            `json:"coin_exchange"`
	Sessions        []DailySessionRow  `json:"sessions"`
	GeneratedAt     string             `json:"generated_at"`
}

type DailySessionRow struct {
	SessionID    int64    `json:"session_id"`
	SessionNo    string   `json:"session_no"`
	LocationName string   `json:"location_name"`
	CashierName  string   `json:"cashier_name"`
	Status       string   `json:"status"`
	SalesTotal   float64  `json:"sales_total"`
	OpeningCash  float64  `json:"opening_cash"`
	ClosingCash  *float64 `json:"closing_cash,omitempty"`
	ExpectedCash float64  `json:"expected_cash"`
	Variance     *float64 `json:"variance,omitempty"`
	TxnCount     int      `json:"txn_count"`
}

func registerShiftDiaryRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Get("/sessions/{id}/activity", sessionActivity(pool))
	r.Get("/sessions/{id}/z-report", sessionZReport(pool))
	r.With(auth.RequirePermission("pos.manage", auth.AccessRead)).Get("/reports/daily", dailyRollup(pool))
}

func sessionActivity(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionBelongsToTenant(r.Context(), pool, tu.TenantID, sessionID) {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		limit := 50
		if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
			if n, e := strconv.Atoi(v); e == nil && n > 0 && n <= 200 {
				limit = n
			}
		}
		events, err := loadSessionActivity(r.Context(), pool, sessionID, limit)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load activity.", "ERR_INTERNAL")
			return
		}
		response.OK(w, events, "OK")
	}
}

func sessionZReport(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionBelongsToTenant(r.Context(), pool, tu.TenantID, sessionID) {
			response.Err(w, http.StatusNotFound, "Session not found.", "ERR_NOT_FOUND")
			return
		}
		rep, err := buildZReport(r.Context(), pool, tu.TenantID, sessionID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build Z report.", "ERR_INTERNAL")
			return
		}
		response.OK(w, rep, "OK")
	}
}

func dailyRollup(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		dateStr := strings.TrimSpace(r.URL.Query().Get("date"))
		if dateStr == "" {
			dateStr = time.Now().UTC().Format("2006-01-02")
		}
		day, err := time.Parse("2006-01-02", dateStr)
		if err != nil {
			response.Validation(w, map[string]string{"date": "Use YYYY-MM-DD."})
			return
		}
		var locID *int64
		if raw := strings.TrimSpace(r.URL.Query().Get("location_id")); raw != "" {
			id, e := parseID(raw)
			if e != nil {
				response.Validation(w, map[string]string{"location_id": "Invalid location."})
				return
			}
			locID = &id
		}
		out, err := buildDailyRollup(r.Context(), pool, tu.TenantID, day, locID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to build daily rollup.", "ERR_INTERNAL")
			return
		}
		response.OK(w, out, "OK")
	}
}
