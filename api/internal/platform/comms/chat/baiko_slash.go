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
			msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID,
				"Approve to open Support tickets. Baiko does not create tickets silently — continue in the Support screen.")
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"message":      msg,
				"navigate":     "/app/support/tickets",
				"action_draft": map[string]any{"type": "open_support_tickets", "payload": map[string]any{}},
				"approve_hint": "Open Support to create or continue a ticket — nothing is auto-posted.",
			}, "OK")
			return
		case "crm":
			if !canUseBaikoSlash(tu) {
				response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
				return
			}
			msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID,
				"Approve to open CRM. Baiko does not create leads silently — continue in CRM.")
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"message":      msg,
				"navigate":     "/app/crm/leads",
				"action_draft": map[string]any{"type": "open_crm", "payload": map[string]any{}},
				"approve_hint": "Open CRM to continue — nothing is auto-posted.",
			}, "OK")
			return
		case "baiko", "ask", "analyze":
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

			reply := fmt.Sprintf(
				"Baiko received: %s\n\nOpen Baiko to continue with grounded tools and approve-to-seed drafts. Nothing is auto-posted from chat.",
				q,
			)
			if len(reply) > 4000 {
				reply = reply[:4000]
			}
			msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID, reply)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
				return
			}
			response.OK(w, map[string]any{
				"message":      msg,
				"navigate":     "/app/baiko",
				"ask_query":    q,
				"approve_hint": "Continue in Baiko — approve any create drafts there.",
			}, "OK")
			return
		default:
			if spec, ok := slashOpenDocs[cmd]; ok {
				if !canUseBaikoSlash(tu) {
					response.Err(w, http.StatusForbidden, "Baiko slash skills require tenant owner or platform superadmin.", "ERR_FORBIDDEN")
					return
				}
				text := fmt.Sprintf("Approve to open %s. Baiko tags context only — create the document in the ERP form.", spec.Label)
				msg, err := insertBaikoMessage(r.Context(), pool, tu, channelID, text)
				if err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to post Baiko message.", "ERR_INTERNAL")
					return
				}
				response.OK(w, map[string]any{
					"message": msg,
					"navigate": spec.UI,
					"action_draft": map[string]any{
						"type":    spec.DraftType,
						"payload": map[string]any{},
					},
					"approve_hint": "Approve opens the prefilled create screen — nothing is silent-written.",
				}, "OK")
				return
			}
			response.Validation(w, map[string]string{"command": "Unknown slash command."})
			return
		}
	}
}

func insertBaikoMessage(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, channelID int64, body string) (Message, error) {
	var id int64
	var created time.Time
	err := pool.QueryRow(ctx, `
		insert into public.chat_messages (tenant_id, channel_id, sender_user_id, body, sender_kind)
		values ($1, $2, null, $3, 'baiko')
		returning id, created_at`,
		tu.TenantID, channelID, body,
	).Scan(&id, &created)
	if err != nil {
		return Message{}, err
	}
	msg := Message{
		ID: id, ChannelID: channelID, Body: body,
		CreatedAt: created.Format(time.RFC3339), SenderKind: "baiko", SenderName: "Baiko",
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
			"everyone_commands": []string{"reminder"},
		}, "OK")
	}
}
