package httputil

import (
	"net/http"
	"strconv"
	"strings"
)

type ListParams struct {
	Page     int
	PageSize int
	Sort     string
	Order    string
	Q        string
	Status   string
}

func ParseListParams(r *http.Request, defaultSort string, allowedSort map[string]string) ListParams {
	q := r.URL.Query()
	page := clampInt(q.Get("page"), 1, 1, 1_000_000)
	pageSize := clampInt(q.Get("pageSize"), 50, 1, 100)
	sortField := q.Get("sort")
	if sortField == "" {
		sortField = defaultSort
	}
	if col, ok := allowedSort[sortField]; ok {
		sortField = col
	} else {
		sortField = allowedSort[defaultSort]
	}
	order := strings.ToLower(q.Get("order"))
	if order != "asc" && order != "desc" {
		order = "asc"
	}
	return ListParams{
		Page:     page,
		PageSize: pageSize,
		Sort:     sortField,
		Order:    order,
		Q:        strings.TrimSpace(q.Get("q")),
		Status:   strings.TrimSpace(q.Get("status")),
	}
}

func Offset(p ListParams) int {
	return (p.Page - 1) * p.PageSize
}

func clampInt(s string, def, min, max int) int {
	if s == "" {
		return def
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return def
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}
