package finance

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// TrendInterval for multi-period series.
type TrendInterval string

const (
	TrendMonth    TrendInterval = "month"
	TrendQuarter  TrendInterval = "quarter"
	TrendYear     TrendInterval = "year"
)

// TrendBucket is one period column in a trend report.
type TrendBucket struct {
	Label string    `json:"label"`
	From  time.Time `json:"-"`
	To    time.Time `json:"-"`
	FromS string    `json:"from"`
	ToS   string    `json:"to"`
	WindowTotals
}

// BuildTrendBuckets splits [from,to] into month/quarter/year windows (inclusive).
func BuildTrendBuckets(from, to time.Time, interval TrendInterval) []TrendBucket {
	from = startOfDay(from)
	to = startOfDay(to)
	if to.Before(from) {
		from, to = to, from
	}
	var out []TrendBucket
	switch interval {
	case TrendQuarter:
		cur := startOfQuarter(from)
		for !cur.After(to) {
			end := endOfQuarter(cur)
			if end.After(to) {
				end = to
			}
			start := cur
			if start.Before(from) {
				start = from
			}
			out = append(out, TrendBucket{
				Label: fmt.Sprintf("Q%d %d", quarterIndex(cur.Month()), cur.Year()),
				From:  start,
				To:    end,
				FromS: start.Format("2006-01-02"),
				ToS:   end.Format("2006-01-02"),
			})
			cur = startOfQuarter(cur.AddDate(0, 3, 0))
		}
	case TrendYear:
		cur := time.Date(from.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		for !cur.After(to) {
			end := time.Date(cur.Year(), 12, 31, 0, 0, 0, 0, time.UTC)
			if end.After(to) {
				end = to
			}
			start := cur
			if start.Before(from) {
				start = from
			}
			out = append(out, TrendBucket{
				Label: fmt.Sprintf("%d", cur.Year()),
				From:  start,
				To:    end,
				FromS: start.Format("2006-01-02"),
				ToS:   end.Format("2006-01-02"),
			})
			cur = cur.AddDate(1, 0, 0)
		}
	default: // month
		cur := startOfMonth(from)
		for !cur.After(to) {
			end := endOfMonth(cur)
			if end.After(to) {
				end = to
			}
			start := cur
			if start.Before(from) {
				start = from
			}
			out = append(out, TrendBucket{
				Label: cur.Format("Jan 2006"),
				From:  start,
				To:    end,
				FromS: start.Format("2006-01-02"),
				ToS:   end.Format("2006-01-02"),
			})
			cur = cur.AddDate(0, 1, 0)
		}
	}
	return out
}

// LoadTrendSeries fills WindowTotals for each bucket (posted GL).
func LoadTrendSeries(ctx context.Context, pool *pgxpool.Pool, tenantID int64, from, to time.Time, interval TrendInterval) ([]TrendBucket, error) {
	buckets := BuildTrendBuckets(from, to, interval)
	for i := range buckets {
		w, err := LoadWindowTotals(ctx, pool, tenantID, buckets[i].From, buckets[i].To)
		if err != nil {
			return nil, err
		}
		buckets[i].WindowTotals = w
	}
	return buckets, nil
}
