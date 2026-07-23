package copilot

import (
	"encoding/json"
	"net/http"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func writeOK(w http.ResponseWriter, data any, message string) {
	response.OK(w, data, message)
}

func writeJSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(data)
}
