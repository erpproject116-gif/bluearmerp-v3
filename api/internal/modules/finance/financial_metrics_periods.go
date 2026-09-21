package finance

import (
	"time"
)

// ComparisonType selects how the comparison window is derived.
type ComparisonType string

const (
	ComparePreviousMonth      ComparisonType = "previous_month"
	CompareSameMonthLY        ComparisonType = "same_month_ly"
	ComparePreviousQuarter    ComparisonType = "previous_quarter"
	CompareSameQuarterLY      ComparisonType = "same_quarter_ly"
	CompareYTDvsPriorYTD      ComparisonType = "ytd_vs_prior_ytd"
	ComparePreviousEquivalent ComparisonType = "previous_equivalent"
	CompareCustom             ComparisonType = "custom"
)

// PeriodPair is current vs comparison date ranges (inclusive dates).
type PeriodPair struct {
	CurrentFrom time.Time
	CurrentTo   time.Time
	CompareFrom time.Time
	CompareTo   time.Time
	YTDFrom     time.Time
	YTDTo       time.Time
	PriorYTDFrom time.Time
	PriorYTDTo   time.Time
	Comparison   ComparisonType
}

func startOfDay(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
}

func endOfMonth(t time.Time) time.Time {
	t = startOfDay(t)
	return time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, time.UTC)
}

func startOfMonth(t time.Time) time.Time {
	t = startOfDay(t)
	return time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
}

func quarterIndex(m time.Month) int {
	return (int(m)-1)/3 + 1
}

func startOfQuarter(t time.Time) time.Time {
	t = startOfDay(t)
	q := quarterIndex(t.Month())
	startMonth := time.Month((q-1)*3 + 1)
	return time.Date(t.Year(), startMonth, 1, 0, 0, 0, 0, time.UTC)
}

func endOfQuarter(t time.Time) time.Time {
	s := startOfQuarter(t)
	return endOfMonth(s.AddDate(0, 2, 0))
}

// ResolveComparison builds current/compare/YTD windows.
// fiscalYearStart is the tenant fiscal year start containing currentTo (or calendar Jan 1).
// For CompareCustom, customFrom/customTo are required.
func ResolveComparison(
	cmp ComparisonType,
	currentFrom, currentTo time.Time,
	fiscalYearStart time.Time,
	customFrom, customTo *time.Time,
) (PeriodPair, error) {
	curFrom := startOfDay(currentFrom)
	curTo := startOfDay(currentTo)
	if curTo.Before(curFrom) {
		curFrom, curTo = curTo, curFrom
	}
	fy := startOfDay(fiscalYearStart)
	if fy.IsZero() {
		fy = time.Date(curTo.Year(), 1, 1, 0, 0, 0, 0, time.UTC)
	}

	out := PeriodPair{
		CurrentFrom:  curFrom,
		CurrentTo:    curTo,
		YTDFrom:      fy,
		YTDTo:        curTo,
		PriorYTDFrom: fy.AddDate(-1, 0, 0),
		PriorYTDTo:   curTo.AddDate(-1, 0, 0),
		Comparison:   cmp,
	}

	switch cmp {
	case ComparePreviousMonth, "":
		out.Comparison = ComparePreviousMonth
		// Align to calendar month of currentTo vs prior month.
		thisMonthStart := startOfMonth(curTo)
		thisMonthEnd := endOfMonth(curTo)
		prevMonthEnd := thisMonthStart.AddDate(0, 0, -1)
		prevMonthStart := startOfMonth(prevMonthEnd)
		out.CurrentFrom = thisMonthStart
		out.CurrentTo = thisMonthEnd
		if curFrom.After(thisMonthStart) || curTo.Before(thisMonthEnd) {
			// Respect caller's range length ending at curTo when not full month.
			out.CurrentFrom = curFrom
			out.CurrentTo = curTo
			days := int(curTo.Sub(curFrom).Hours()/24) + 1
			out.CompareTo = curFrom.AddDate(0, 0, -1)
			out.CompareFrom = out.CompareTo.AddDate(0, 0, -(days - 1))
		} else {
			out.CompareFrom = prevMonthStart
			out.CompareTo = prevMonthEnd
		}
	case CompareSameMonthLY:
		out.CurrentFrom = startOfMonth(curTo)
		out.CurrentTo = endOfMonth(curTo)
		out.CompareFrom = out.CurrentFrom.AddDate(-1, 0, 0)
		out.CompareTo = endOfMonth(out.CompareFrom)
	case ComparePreviousQuarter:
		out.CurrentFrom = startOfQuarter(curTo)
		out.CurrentTo = endOfQuarter(curTo)
		prevEnd := out.CurrentFrom.AddDate(0, 0, -1)
		out.CompareFrom = startOfQuarter(prevEnd)
		out.CompareTo = endOfQuarter(prevEnd)
	case CompareSameQuarterLY:
		out.CurrentFrom = startOfQuarter(curTo)
		out.CurrentTo = endOfQuarter(curTo)
		out.CompareFrom = out.CurrentFrom.AddDate(-1, 0, 0)
		out.CompareTo = endOfQuarter(out.CompareFrom)
	case CompareYTDvsPriorYTD:
		out.CurrentFrom = fy
		out.CurrentTo = curTo
		out.CompareFrom = out.PriorYTDFrom
		out.CompareTo = out.PriorYTDTo
	case ComparePreviousEquivalent:
		days := int(curTo.Sub(curFrom).Hours()/24) + 1
		out.CompareTo = curFrom.AddDate(0, 0, -1)
		out.CompareFrom = out.CompareTo.AddDate(0, 0, -(days - 1))
	case CompareCustom:
		if customFrom == nil || customTo == nil {
			return out, errComparisonCustomRequired
		}
		out.CompareFrom = startOfDay(*customFrom)
		out.CompareTo = startOfDay(*customTo)
		if out.CompareTo.Before(out.CompareFrom) {
			out.CompareFrom, out.CompareTo = out.CompareTo, out.CompareFrom
		}
	default:
		return out, errComparisonUnknown
	}
	return out, nil
}

type comparisonError string

func (e comparisonError) Error() string { return string(e) }

const (
	errComparisonCustomRequired comparisonError = "compare_from and compare_to are required for custom comparison"
	errComparisonUnknown        comparisonError = "unknown comparison type"
)
