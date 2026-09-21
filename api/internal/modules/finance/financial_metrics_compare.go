package finance

import "math"

// MetricDelta is comparison output for one metric.
type MetricDelta struct {
	Current          float64  `json:"current"`
	Previous         float64  `json:"previous"`
	Change           float64  `json:"change"`
	ChangePct        *float64 `json:"change_pct"` // nil when previous=0 or ratio uses pp
	ChangePctLabel   string   `json:"change_pct_label,omitempty"` // "N/A" | "New"
	ChangePP         *float64 `json:"change_pp,omitempty"`        // percentage points for ratios
	Direction        string   `json:"direction"`                  // up | down | flat
	Favorable        *bool    `json:"favorable,omitempty"`
	YTD              float64  `json:"ytd"`
	PriorYTD         float64  `json:"prior_ytd"`
	YTDChange        float64  `json:"ytd_change"`
	YTDChangePct     *float64 `json:"ytd_change_pct"`
	YTDChangePctLabel string  `json:"ytd_change_pct_label,omitempty"`
}

// BuildMetricDelta compares current/previous (and YTD) for a dictionary metric.
func BuildMetricDelta(def MetricDef, current, previous, ytd, priorYTD float64) MetricDelta {
	d := MetricDelta{
		Current:  current,
		Previous: previous,
		Change:   current - previous,
		YTD:      ytd,
		PriorYTD: priorYTD,
		YTDChange: ytd - priorYTD,
	}
	d.Direction = directionOf(d.Change)
	d.Favorable = favorableOf(def.PreferredDirection, d.Change)

	if def.Format == "percent" {
		pp := d.Change
		d.ChangePP = &pp
		d.ChangePct = nil
		if previous == 0 && current == 0 {
			d.ChangePctLabel = "N/A"
		}
	} else {
		pct, label := percentChange(previous, current)
		d.ChangePct = pct
		d.ChangePctLabel = label
	}

	ypct, ylabel := percentChange(priorYTD, ytd)
	d.YTDChangePct = ypct
	d.YTDChangePctLabel = ylabel
	return d
}

func directionOf(change float64) string {
	const eps = 1e-9
	if change > eps {
		return "up"
	}
	if change < -eps {
		return "down"
	}
	return "flat"
}

func favorableOf(pref PreferredDirection, change float64) *bool {
	const eps = 1e-9
	if math.Abs(change) < eps {
		return nil
	}
	up := change > 0
	var fav bool
	if pref == PreferUp {
		fav = up
	} else {
		fav = !up
	}
	return &fav
}

func percentChange(previous, current float64) (*float64, string) {
	const eps = 1e-9
	if math.Abs(previous) < eps {
		if math.Abs(current) < eps {
			return nil, "N/A"
		}
		return nil, "New"
	}
	v := ((current - previous) / math.Abs(previous)) * 100
	return &v, ""
}
