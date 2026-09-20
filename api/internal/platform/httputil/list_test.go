package httputil

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestParseListParamsWithDefaults_order(t *testing.T) {
	allowed := map[string]string{
		"updated_at": "t.updated_at",
		"order_date": "t.order_date",
	}

	t.Run("missing order uses defaultOrder", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/?sort=updated_at", nil)
		p := ParseListParamsWithDefaults(r, "updated_at", "desc", allowed)
		if p.Sort != "t.updated_at" || p.Order != "desc" {
			t.Fatalf("got sort=%q order=%q", p.Sort, p.Order)
		}
	})

	t.Run("explicit order wins", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/?sort=order_date&order=asc", nil)
		p := ParseListParamsWithDefaults(r, "updated_at", "desc", allowed)
		if p.Sort != "t.order_date" || p.Order != "asc" {
			t.Fatalf("got sort=%q order=%q", p.Sort, p.Order)
		}
	})

	t.Run("ParseListParams still defaults asc", func(t *testing.T) {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		p := ParseListParams(r, "order_date", allowed)
		if p.Sort != "t.order_date" || p.Order != "asc" {
			t.Fatalf("got sort=%q order=%q", p.Sort, p.Order)
		}
	})
}
