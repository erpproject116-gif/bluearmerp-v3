package inventory

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/documentlifecycle"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type masterBulkBody struct {
	IDs    []int64 `json:"ids"`
	Reason string  `json:"reason"`
}

type masterBulkItem struct {
	ID     int64  `json:"id"`
	OK     bool   `json:"ok"`
	Reason string `json:"reason,omitempty"`
}

type masterBulkOutcome struct {
	Results  []masterBulkItem `json:"results"`
	Deleted  int              `json:"deleted,omitempty"`
	Restored int              `json:"restored,omitempty"`
	Skipped  int              `json:"skipped"`
}

func parseMasterLifecycle(r *http.Request) (string, error) {
	return documentlifecycle.Parse(r.URL.Query().Get("lifecycle"))
}

// deletedAtPredicate returns a SQL fragment for deleted_at filtering (no alias).
func deletedAtPredicate(lifecycle string) string {
	switch lifecycle {
	case documentlifecycle.Deleted:
		return "deleted_at is not null"
	case documentlifecycle.All:
		return "true"
	default:
		return "deleted_at is null"
	}
}

// deletedAtPredicateAliased returns a SQL fragment with table alias, e.g. "i.deleted_at is null".
func deletedAtPredicateAliased(alias, lifecycle string) string {
	col := "deleted_at"
	if alias != "" {
		col = alias + ".deleted_at"
	}
	switch lifecycle {
	case documentlifecycle.Deleted:
		return col + " is not null"
	case documentlifecycle.All:
		return "true"
	default:
		return col + " is null"
	}
}

func softRestoreHandler(pool *pgxpool.Pool, table, action, targetType string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		reason := readOptionalReason(r)
		q := fmt.Sprintf(`update public.%s set deleted_at = null, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is not null`, table)
		tag, err := pool.Exec(r.Context(), q, id, tu.TenantID)
		if err != nil || tag.RowsAffected() == 0 {
			response.Err(w, http.StatusNotFound, "Not found or not deleted.", "ERR_NOT_FOUND")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, action, targetType, &id, nil, map[string]any{"reason": reason})
		response.OK(w, nil, "Restored.")
	}
}

func bulkSoftDeleteHandler(pool *pgxpool.Pool, table, action, targetType string) http.HandlerFunc {
	return masterBulkHandler(pool, table, action, targetType, "delete")
}

func bulkSoftRestoreHandler(pool *pgxpool.Pool, table, action, targetType string) http.HandlerFunc {
	return masterBulkHandler(pool, table, action, targetType, "restore")
}

func masterBulkHandler(pool *pgxpool.Pool, table, action, targetType, mode string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body masterBulkBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			response.Validation(w, map[string]string{"reason": "Reason is required."})
			return
		}
		if len(reason) > 2000 {
			response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 500 {
			response.Validation(w, map[string]string{"ids": "At most 500 ids per request."})
			return
		}

		results := make([]masterBulkItem, 0, len(body.IDs))
		for _, id := range body.IDs {
			if id <= 0 {
				results = append(results, masterBulkItem{ID: id, OK: false, Reason: "Invalid id."})
				continue
			}
			var q string
			if mode == "delete" {
				q = fmt.Sprintf(`update public.%s set deleted_at = now(), updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null`, table)
			} else {
				q = fmt.Sprintf(`update public.%s set deleted_at = null, updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is not null`, table)
			}
			tag, err := pool.Exec(r.Context(), q, id, tu.TenantID)
			if err != nil {
				results = append(results, masterBulkItem{ID: id, OK: false, Reason: "Failed to update."})
				continue
			}
			if tag.RowsAffected() == 0 {
				msg := "Not found or already deleted."
				if mode == "restore" {
					msg = "Not found or not deleted."
				}
				results = append(results, masterBulkItem{ID: id, OK: false, Reason: msg})
				continue
			}
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, action, targetType, &id, nil, map[string]any{"reason": reason})
			results = append(results, masterBulkItem{ID: id, OK: true})
		}
		out := masterBulkOutcome{Results: results}
		for _, item := range results {
			if item.OK {
				if mode == "delete" {
					out.Deleted++
				} else {
					out.Restored++
				}
			} else {
				out.Skipped++
			}
		}
		response.OK(w, out, "OK")
	}
}

func readOptionalReason(r *http.Request) string {
	reason := strings.TrimSpace(r.URL.Query().Get("reason"))
	if reason != "" {
		return reason
	}
	if r.Body == nil {
		return ""
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	return strings.TrimSpace(body.Reason)
}
