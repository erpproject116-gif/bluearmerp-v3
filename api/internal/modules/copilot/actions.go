package copilot

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type approveBody struct {
	SessionID *int64      `json:"session_id"`
	Draft     actionDraft `json:"draft"`
}

func postApproveAction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body approveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if strings.TrimSpace(body.Draft.Type) == "" {
			response.Validation(w, map[string]string{"draft": "Action draft is required."})
			return
		}

		result, errMsg, status := executeApprovedDraft(r, pool, tu, body.Draft)
		if errMsg != "" {
			auditAction(r, pool, tu, body.SessionID, body.Draft, "denied", map[string]any{"error": errMsg})
			response.Err(w, status, errMsg, "ERR_COPILOT_ACTION")
			return
		}
		auditAction(r, pool, tu, body.SessionID, body.Draft, "approved", result)
		response.OK(w, map[string]any{
			"decision": "approved",
			"result":   result,
			"draft":    body.Draft,
		}, "Action approved.")
	}
}

func postDenyAction(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, ok := auth.FromContext(r.Context())
		if !ok {
			response.Err(w, http.StatusUnauthorized, "Unauthorized.", "ERR_UNAUTHORIZED")
			return
		}
		var body approveBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		auditAction(r, pool, tu, body.SessionID, body.Draft, "denied", map[string]any{"reason": "user_denied"})
		response.OK(w, map[string]any{"decision": "denied"}, "Action denied.")
	}
}

func executeApprovedDraft(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, draft actionDraft) (any, string, int) {
	switch draft.Type {
	case "create_recurring_expense":
		if !tu.HasPermission("finance.contract_write", auth.AccessWrite) {
			return nil, "Missing finance.contract_write permission.", http.StatusForbidden
		}
		return createRecurringFromDraft(r, pool, tu, draft.Payload)
	case "import_rfq_pdf":
		return map[string]any{
			"next": "/app/quotation/quotations",
			"hint": "Use Import RFQ on quotations. AI enhance reuses the existing RFQ VL pipeline — no second vision stack.",
			"api":  draft.API,
		}, "", http.StatusOK
	default:
		return nil, "Unsupported action type.", http.StatusBadRequest
	}
}

func createRecurringFromDraft(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, payload map[string]any) (any, string, int) {
	name := strOr(payload["name"], "")
	if name == "" {
		return nil, "Recurring expense name is required.", http.StatusBadRequest
	}
	amount, _ := toFloat(payload["amount"])
	freq := strOr(payload["frequency"], "monthly")
	category := strOr(payload["category"], "general")
	vendor := strOr(payload["vendor_name"], "")

	var id int64
	err := pool.QueryRow(r.Context(), `
		insert into public.fin_recurring_expenses (
		  tenant_id, name, category, vendor_name, amount, frequency,
		  is_active, notes, created_by_user_id
		) values ($1, $2, $3, $4, $5, $6, true, '', $7)
		returning id`,
		tu.TenantID, name, category, vendor, amount, freq, tu.AppUserID,
	).Scan(&id)
	if err != nil {
		return nil, "Failed to create recurring expense.", http.StatusInternalServerError
	}
	return map[string]any{
		"id":         id,
		"name":       name,
		"amount":     amount,
		"frequency":  freq,
		"created_at": time.Now().UTC().Format(time.RFC3339),
	}, "", http.StatusOK
}

func auditAction(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, sessionID *int64, draft actionDraft, decision string, result any) {
	draftJSON, _ := json.Marshal(draft)
	resultJSON, _ := json.Marshal(result)
	var sid any
	if sessionID != nil {
		sid = *sessionID
	}
	_, _ = pool.Exec(r.Context(), `
		insert into public.copilot_action_audits (tenant_id, user_id, session_id, action_type, draft, decision, result)
		values ($1, $2, $3, $4, $5::jsonb, $6, $7::jsonb)`,
		tu.TenantID, tu.AppUserID, sid, draft.Type, string(draftJSON), decision, string(resultJSON))
}
