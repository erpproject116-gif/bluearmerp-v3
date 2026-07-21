package response

import (
	"encoding/json"
	"net/http"
)

type Meta struct {
	Page        int    `json:"page"`
	PerPage     int    `json:"per_page"`
	Total       int64  `json:"total"`
	UnreadTotal *int64 `json:"unread_total,omitempty"`
}

type Envelope struct {
	Success bool              `json:"success"`
	Message string            `json:"message"`
	Data    any               `json:"data,omitempty"`
	Meta    *Meta             `json:"meta,omitempty"`
	Errors  map[string]string `json:"errors,omitempty"`
	Code    string            `json:"code,omitempty"`
}

func JSON(w http.ResponseWriter, status int, body Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func OK(w http.ResponseWriter, data any, message string) {
	JSON(w, http.StatusOK, Envelope{Success: true, Message: message, Data: data})
}

func OKList(w http.ResponseWriter, data any, page, perPage int, total int64) {
	OKListWithMeta(w, data, page, perPage, total, nil)
}

func OKListWithMeta(w http.ResponseWriter, data any, page, perPage int, total int64, unreadTotal *int64) {
	// Lists must not be browser-cached: after create/update, refetch must see fresh rows
	// (max-age caused "saved successfully" while the grid stayed empty for ~30–60s).
	w.Header().Set("Cache-Control", "private, no-cache, no-store, must-revalidate")
	JSON(w, http.StatusOK, Envelope{
		Success: true,
		Message: "OK",
		Data:    data,
		Meta:    &Meta{Page: page, PerPage: perPage, Total: total, UnreadTotal: unreadTotal},
	})
}

func Err(w http.ResponseWriter, status int, message, code string) {
	JSON(w, status, Envelope{Success: false, Message: message, Errors: map[string]string{}, Code: code})
}

func Validation(w http.ResponseWriter, errors map[string]string) {
	JSON(w, http.StatusBadRequest, Envelope{
		Success: false,
		Message: "Validation failed.",
		Errors:  errors,
		Code:    "ERR_VALIDATION",
	})
}
