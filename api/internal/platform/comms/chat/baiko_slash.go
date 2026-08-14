package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func messageChannel(ctx context.Context, pool *pgxpool.Pool, tenantID, messageID int64) (int64, error) {
	var channelID int64
	err := pool.QueryRow(ctx, `
		select channel_id from public.chat_messages
		where id = $1 and tenant_id = $2`, messageID, tenantID).Scan(&channelID)
	return channelID, err
}

func decodeActionDraft(raw []byte) any {
	if len(raw) == 0 {
		return nil
	}
	var v any
	if json.Unmarshal(raw, &v) != nil {
		return nil
	}
	return v
}

type slashBody struct {
	Command string `json:"command"`
	Args    string `json:"args"`
	Query   string `json:"query"`
}

type slashOpenSpec struct {
	DraftType string
	Label     string
	UI        string
}

var slashOpenDocs = map[string]slashOpenSpec{
	"quotation":        {DraftType: "open_quotation", Label: "Quotation", UI: "/app/quotation/quotations/new"},
	"sales-order":      {DraftType: "open_sales_order", Label: "Sales order", UI: "/app/sales-order/sales-orders/new"},
	"sales":            {DraftType: "open_sales", Label: "Sales invoice", UI: "/app/sales/sales/new"},
	"purchase-request": {DraftType: "open_purchase_request", Label: "Purchase request", UI: "/app/purchase-request/purchase-requests/new"},
	"purchase-order":   {DraftType: "open_purchase_order", Label: "Purchase order", UI: "/app/purchase-order/purchase-orders"},
	"rfq":              {DraftType: "open_rfq", Label: "RFQ", UI: "/app/purchase-order/rfq"},
	"purchase":         {DraftType: "open_purchases", Label: "Supplier invoice", UI: "/app/purchases/purchase-receive/new"},
}

// Navigate-only drafts (not in copilot executeApprovedDraft).
var navigateOnlyDraftTypes = map[string]bool{
	"open_support_tickets": true,
	"open_crm":             true,
	"open_baiko":           true,
}

func postSlash(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		var body slashBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"command": "Invalid JSON."})
			return
		}
		cmd := strings.ToLower(strings.TrimSpace(strings.TrimPrefix(body.Command, "/")))
		args := strings.TrimSpace(body.Args)
		if args == "" {
			args = strings.TrimSpace(body.Query)
		}

		switch cmd {
		case "reminder":
			response.Validation(w, map[string]string{"command": "Use POST /comms/chat/reminders for /reminder."})
			return
		case "ticket", "support":
			if !canUseBaikoSlash(tu) {
				response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
				return
			}
			draft := map[string]any{
				"type":     "open_support_tickets",
				"summary":  "Open Support tickets",
				"payload":  map[string]any{},
				"navigate": "/app/support/tickets",
			}
			msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID,
				"Approve to open Support tickets. Baiko does not create tickets silently — continue in the Support screen.",
				draft)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"message":      msg,
				"navigate":     "/app/support/tickets",
				"action_draft": draft,
				"approve_hint": "Open Support to create or continue a ticket — nothing is auto-posted.",
			}, "OK")
			return
		case "crm":
			if !canUseBaikoSlash(tu) {
				response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
				return
			}
			draft := map[string]any{
				"type":     "open_crm",
				"summary":  "Open CRM leads",
				"payload":  map[string]any{},
				"navigate": "/app/crm/leads",
			}
			msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID,
				"Approve to open CRM. Baiko does not create leads silently — continue in CRM.",
				draft)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"message":      msg,
				"navigate":     "/app/crm/leads",
				"action_draft": draft,
				"approve_hint": "Open CRM to continue — nothing is auto-posted.",
			}, "OK")
			return
		case "baiko", "ask", "analyze":
			// Grounded ask runs client-side via POST /copilot/ask then POST .../baiko-messages
			// (chat cannot import copilot — import cycle through notify/comms).
			if !canUseBaikoSlash(tu) {
				response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
				return
			}
			q := args
			if q == "" {
				q = "How can I help with this channel?"
			}
			if cmd == "analyze" {
				q = "Analyze the linked ERP documents in this chat: " + q
			}
			userBody := "/" + cmd
			if args != "" {
				userBody = "/" + cmd + " " + args
			}
			_, _ = pool.Exec(r.Context(), `
				insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind)
				values ($1, $2, $3, $4, 'user')`,
				tu.TenantID, channelID, tu.AppUserID, userBody)

			response.OK(w, map[string]any{
				"need_client_ask": true,
				"ask_query":       q,
				"analyze":         cmd == "analyze",
				"approve_hint":    "Baiko will reply in-channel — approve any create draft; nothing is silent-written.",
			}, "OK")
			return
		default:
			if spec, ok := slashOpenDocs[cmd]; ok {
				if !canUseBaikoSlash(tu) {
					response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
					return
				}
				text := fmt.Sprintf("Approve to open %s. Baiko tags context only — create the document in the ERP form.", spec.Label)
				draft := map[string]any{
					"type":     spec.DraftType,
					"summary":  "Open " + spec.Label,
					"payload":  map[string]any{},
					"navigate": spec.UI,
				}
				msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID, text, draft)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
					return
				}
				response.OK(w, map[string]any{
					"message":      msg,
					"navigate":     spec.UI,
					"action_draft": draft,
					"approve_hint": "Approve opens the create screen — nothing is silent-written.",
				}, "OK")
				return
			}
			response.Validation(w, map[string]string{"command": "Unknown slash command."})
			return
		}
	}
}

type baikoMessageBody struct {
	Body        string          `json:"body"`
	ActionDraft json.RawMessage `json:"action_draft"`
}

func postBaikoMessage(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !canUseBaikoSlash(tu) {
			response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
			return
		}
		channelID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid channel id."})
			return
		}
		if _, err := requireMembership(r.Context(), pool, tu.TenantID, channelID, tu.AppUserID); err != nil {
			response.Err(w, http.StatusNotFound, "Channel not found.", "ERR_NOT_FOUND")
			return
		}
		var body baikoMessageBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		text := strings.TrimSpace(body.Body)
		if text == "" {
			response.Validation(w, map[string]string{"body": "Message body is required."})
			return
		}
		if len(text) > 8000 {
			response.Validation(w, map[string]string{"body": "Message is too long."})
			return
		}
		var draft any
		if len(body.ActionDraft) > 0 && string(body.ActionDraft) != "null" {
			if err := json.Unmarshal(body.ActionDraft, &draft); err != nil {
				response.Validation(w, map[string]string{"action_draft": "Invalid action_draft JSON."})
				return
			}
		}
		msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID, text, draft)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
			return
		}
		response.OK(w, msg, "Posted.")
	}
}

func insertBaikoMessage(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, channelID int64, body string, actionDraft any) (Message, error) {
	var draftJSON []byte
	var err error
	if actionDraft != nil {
		draftJSON, err = json.Marshal(actionDraft)
		if err != nil {
			return Message{}, err
		}
	}
	var id int64
	var created time.Time
	err = pool.QueryRow(ctx, `
		insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind, action_draft)
		values ($1, $2, null, $3, 'baiko', $4)
		returning id, created_at`,
		tu.TenantID, channelID, body, draftJSON,
	).Scan(&id, &created)
	if err != nil {
		return Message{}, err
	}
	msg := Message{
		ID: id, ChannelID: channelID, Body: body,
		CreatedAt: created.Format(time.RFC3339), SenderKind: "baiko", SenderName: "Baiko",
		ActionDraft: actionDraft,
	}
	tmp := []Message{msg}
	enrichMessages(ctx, pool, tmp, tu.AppUserID)
	return tmp[0], nil
}

func baikoCapabilities(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		_ = pool
		response.OK(w, map[string]any{
			"can_use_baiko_slash": canUseBaikoSlash(tu),
			"commands": []string{
				"baiko", "ask", "analyze", "quotation", "sales-order", "sales",
				"purchase-request", "purchase-order", "rfq", "purchase", "ticket", "support", "crm",
			},
			"everyone_commands":         []string{"reminder"},
			"navigate_only_draft_types": []string{"open_support_tickets", "open_crm", "open_baiko"},
		}, "OK")
	}
}

// IsNavigateOnlyDraftType reports whether Approve should skip the copilot approve API.
func IsNavigateOnlyDraftType(t string) bool {
	return navigateOnlyDraftTypes[t]
}
