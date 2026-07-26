package copilot

import (
	"encoding/json"
	"net/http"
	"strconv"
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
		if !allowCopilotRate(tu.TenantID, tu.AppUserID, "approve") {
			response.Err(w, http.StatusTooManyRequests, "Too many Approve requests. Please wait a moment.", "ERR_COPILOT_RATE")
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
		body.Draft.Payload = sanitizeDraftPayload(body.Draft.Type, body.Draft.Payload)

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
		return openUIFromDraft(actionDraft{Type: "import_rfq_pdf", Payload: draft.Payload})
	case "create_quotation_from_rfq":
		if !tu.HasPermission("quotation.quotations", auth.AccessWrite) {
			return nil, "Missing quotation write permission.", http.StatusForbidden
		}
		return openUIFromDraft(draft)
	case "map_import_dataset":
		if !tu.HasPermission("migration.center", auth.AccessWrite) {
			return nil, "Missing migration.center write permission.", http.StatusForbidden
		}
		return openUIFromDraft(draft)
	case "propose_serial_lot_import":
		// Staging only — actual serial capture still requires goods-receipt write in the UI.
		if !tu.HasPermission("inventory.serial_receive", auth.AccessRead) {
			return nil, "Missing inventory.serial_receive permission.", http.StatusForbidden
		}
		return openUIFromDraft(draft)
	case "create_follow_up":
		if !tu.HasPermission("crm.follow_up_tasks", auth.AccessWrite) {
			return nil, "Missing crm.follow_up_tasks write permission.", http.StatusForbidden
		}
		return createFollowUpFromDraft(r, pool, tu, draft.Payload)
	case "open_quotation", "open_sales_order", "open_sales", "open_purchase_request",
		"open_rfq", "open_purchase_order", "open_purchases":
		// Seeding a create form requires write on the target module; plain
		// navigation (no partner, no lines) stays open to everyone.
		if spec, ok := docSeedSpecs[draft.Type]; ok && docSeedHasContent(draft.Payload) {
			if !tu.HasPermission(spec.WritePermission, auth.AccessWrite) {
				return nil, "Missing " + spec.WritePermission + " write permission.", http.StatusForbidden
			}
		}
		return openUIFromDraft(draft)
	case "generate_quotation", "open_product_bundle", "open_bom", "bulk_inventory",
		"send_quotation_email", "send_document_email":
		return openUIFromDraft(draft)
	default:
		if strings.HasPrefix(draft.Type, "open_") || draft.Type == "bulk_inventory" {
			return openUIFromDraft(draft)
		}
		return nil, "Unsupported action type.", http.StatusBadRequest
	}
}

// openUIFromDraft resolves navigation only from the server catalog — never from client payload.ui / api.
func openUIFromDraft(draft actionDraft) (any, string, int) {
	next, api, hint := catalogNavForDraft(draft)
	if safe, ok := SafeAppPath(next); ok {
		next = safe
	} else {
		next = "/app/dashboard"
	}
	payload := sanitizeDraftPayload(draft.Type, draft.Payload)
	result := map[string]any{
		"next":    next,
		"hint":    hint,
		"payload": payload,
		"api":     api,
	}
	if draft.Type == "create_quotation_from_rfq" || draft.Type == "map_import_dataset" || draft.Type == "propose_serial_lot_import" {
		result["seed"] = payload
	} else if _, ok := docSeedSpecs[draft.Type]; ok && docSeedHasContent(payload) {
		result["seed"] = payload
	}
	return result, "", http.StatusOK
}

func catalogNavForDraft(draft actionDraft) (next, api, hint string) {
	hint = "Continue in the ERP screen."
	switch draft.Type {
	case "import_rfq_pdf":
		return "/app/quotation/quotations", "/api/v1/quotation/rfq-import", "Open Import RFQ on quotations."
	case "create_quotation_from_rfq":
		return "/app/quotation/quotations/new", "/api/v1/quotation/quotations", "Review the prefilled quotation, then save."
	case "map_import_dataset":
		return migrationCenterPath, "/api/v1/migration", "Review the column mapping in Migration Center, then confirm the import there."
	case "propose_serial_lot_import":
		return serialReceivePath, "/api/v1/goods-receipt", "Review the staged serial list in Receive / Scan, pick the goods-receipt line, then import — nothing is registered until you confirm."
	case "send_document_email", "send_quotation_email":
		next = emailUIFromPayload(draft.Payload)
		api = next
		hint = "Open the document and send mail from the compose screen."
		return next, api, hint
	}
	if spec := findOpenDocSpec(draft.Type); spec != nil {
		return spec.UI, spec.API, spec.Hint
	}
	return "/app/dashboard", "", hint
}

func emailUIFromPayload(payload map[string]any) string {
	docType := strings.ToLower(strOr(payload["doc_type"], "quotation"))
	switch docType {
	case "sales_order":
		return "/app/sales-order/sales-orders"
	case "sales":
		return "/app/sales/sales"
	case "purchase_order":
		return "/app/purchase-order/purchase-orders"
	default:
		return "/app/quotation/quotations"
	}
}

// sanitizeDraftPayload keeps only allowlisted keys and positive IDs; drops ui/api phishing vectors.
func sanitizeDraftPayload(draftType string, payload map[string]any) map[string]any {
	if payload == nil {
		return map[string]any{}
	}
	if draftType == "create_quotation_from_rfq" {
		return sanitizeRfqQuotationSeedPayload(payload)
	}
	if draftType == "map_import_dataset" {
		return sanitizeMapImportPayload(payload)
	}
	if draftType == "propose_serial_lot_import" {
		return sanitizeSerialLotPayload(payload)
	}
	if _, ok := docSeedSpecs[draftType]; ok {
		return sanitizeDocSeedPayload(payload)
	}
	allowed := allowedPayloadKeys(draftType)
	out := make(map[string]any, len(allowed))
	for _, key := range allowed {
		v, ok := payload[key]
		if !ok || v == nil {
			continue
		}
		switch key {
		case "partner_id", "quotation_id", "sales_id", "doc_id", "item_id":
			if id, ok := toPositiveInt64(v); ok {
				out[key] = id
			}
		case "amount":
			if f, ok := toFloat(v); ok {
				out[key] = f
			}
		case "ui", "api":
			// Never copy client navigation targets into sanitized payload.
			continue
		default:
			if s, ok := v.(string); ok {
				out[key] = strings.TrimSpace(s)
			} else {
				out[key] = v
			}
		}
	}
	return out
}

func allowedPayloadKeys(draftType string) []string {
	switch draftType {
	case "create_follow_up":
		return []string{"title", "due_date", "task_type", "stage", "notes", "partner_id", "quotation_id", "sales_id"}
	case "create_recurring_expense":
		return []string{"name", "amount", "frequency", "category", "vendor_name"}
	case "send_document_email", "send_quotation_email":
		return []string{"doc_type", "doc_id", "doc_no", "partner_id", "partner_name", "hint"}
	case "import_rfq_pdf":
		return []string{"hint", "note"}
	case "create_quotation_from_rfq":
		return []string{"partner_id", "partner_name", "document_type", "source_name", "lines"}
	default:
		return []string{"hint", "kind", "note", "partner_id", "partner_name", "item_id", "doc_id", "entities"}
	}
}

func sanitizeRfqQuotationSeedPayload(payload map[string]any) map[string]any {
	out := map[string]any{}
	if id, ok := toPositiveInt64(payload["partner_id"]); ok {
		out["partner_id"] = id
	}
	for _, key := range []string{"partner_name", "document_type", "source_name"} {
		if value := boundedString(payload[key], 240); value != "" {
			out[key] = value
		}
	}
	if _, ok := payload["lines"]; !ok {
		return out
	}
	lines := sanitizeSeedLines(payload["lines"])
	if lines == nil {
		return out
	}
	out["lines"] = lines
	return out
}

func boundedString(value any, maxLen int) string {
	s, ok := value.(string)
	if !ok {
		return ""
	}
	s = strings.TrimSpace(s)
	if len(s) > maxLen {
		s = s[:maxLen]
	}
	return s
}

func createFollowUpFromDraft(r *http.Request, pool *pgxpool.Pool, tu auth.TenantUser, payload map[string]any) (any, string, int) {
	title := strOr(payload["title"], "Follow-up")
	due := strOr(payload["due_date"], time.Now().UTC().Add(48*time.Hour).Format("2006-01-02"))
	taskType := strOr(payload["task_type"], "quote_follow_up")
	stage := strOr(payload["stage"], "scheduled")
	notes := strOr(payload["notes"], "")
	var partnerID, quotationID, salesID *int64
	if id, ok := toPositiveInt64(payload["partner_id"]); ok {
		partnerID = &id
	}
	if id, ok := toPositiveInt64(payload["quotation_id"]); ok {
		quotationID = &id
	}
	if id, ok := toPositiveInt64(payload["sales_id"]); ok {
		salesID = &id
	}
	var id int64
	err := pool.QueryRow(r.Context(), `
		insert into public.crm_follow_up_tasks (
		  tenant_id, task_type, stage, due_date, partner_id, pic_user_id, pic_name,
		  quotation_id, sales_id, title, notes, created_by_user_id
		) values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,$11,$12)
		returning id`,
		tu.TenantID, taskType, stage, due, partnerID, tu.AppUserID, "",
		quotationID, salesID, title, notes, tu.AppUserID,
	).Scan(&id)
	if err != nil {
		return nil, "Failed to create follow-up task.", http.StatusInternalServerError
	}
	return map[string]any{
		"id":       id,
		"title":    title,
		"due_date": due,
		"next":     "/app/crm/follow-up-tasks",
	}, "", http.StatusOK
}

func toInt64(v any) (int64, bool) {
	switch t := v.(type) {
	case float64:
		return int64(t), true
	case float32:
		return int64(t), true
	case int:
		return int64(t), true
	case int64:
		return t, true
	case json.Number:
		n, err := t.Int64()
		return n, err == nil
	case string:
		n, err := strconv.ParseInt(strings.TrimSpace(t), 10, 64)
		return n, err == nil
	default:
		return 0, false
	}
}

func toPositiveInt64(v any) (int64, bool) {
	n, ok := toInt64(v)
	if !ok || n <= 0 {
		return 0, false
	}
	return n, true
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
