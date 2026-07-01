package reports

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router) {
	r.Get("/reports/catalog", func(w http.ResponseWriter, _ *http.Request) {
		response.OK(w, Catalog(), "OK")
	})
}
