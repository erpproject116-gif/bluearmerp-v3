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

// AssistAction is a single CTA for Smart Assist (in-app /app/... href only).
type AssistAction struct {
	Label string `json:"label"`
	Href  string `json:"href,omitempty"`
}

// Assist is a deterministic recovery payload for transaction failures (no LLM).
type Assist struct {
	Code    string         `json:"code"`
	Title   string         `json:"title"`
	Detail  string         `json:"detail"`
	Field   string         `json:"field,omitempty"`
	Actions []AssistAction `json:"actions,omitempty"`
}

type Envelope struct {
	Success bool              `json:"success"`
	Message string            `json:"message"`
	Data    any               `json:"data,omitempty"`
	Meta    *Meta             `json:"meta,omitempty"`
	Errors  map[string]string `json:"errors,omitempty"`
	Code    string            `json:"code,omitempty"`
	Assist  *Assist           `json:"assist,omitempty"`
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

// ValidationAssist is Validation plus a Smart Assist recovery card.
func ValidationAssist(w http.ResponseWriter, errors map[string]string, assist Assist) {
	a := assist
	JSON(w, http.StatusBadRequest, Envelope{
		Success: false,
		Message: "Validation failed.",
		Errors:  errors,
		Code:    "ERR_VALIDATION",
		Assist:  &a,
	})
}

// ErrAssist is Err plus a Smart Assist recovery card.
func ErrAssist(w http.ResponseWriter, status int, message, code string, assist Assist) {
	a := assist
	JSON(w, status, Envelope{
		Success: false,
		Message: message,
		Errors:  map[string]string{},
		Code:    code,
		Assist:  &a,
	})
}
