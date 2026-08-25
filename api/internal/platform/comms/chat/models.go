package chat

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

type Channel struct {
	ID              int64   `json:"id"`
	Type            string  `json:"type"`
	Name            string  `json:"name"`
	Topic           string  `json:"topic,omitempty"`
	IsPrivate       bool    `json:"is_private"`
	CreatedByUserID *int64  `json:"created_by_user_id,omitempty"`
	CreatedAt       string  `json:"created_at"`
	ArchivedAt      *string `json:"archived_at,omitempty"`
	UnreadCount     int64   `json:"unread_count"`
	MemberCount     int64   `json:"member_count"`
	LastMessageAt   *string `json:"last_message_at,omitempty"`
	LastMessagePreview string `json:"last_message_preview,omitempty"`
}

type Member struct {
	UserID           int64   `json:"user_id"`
	FullName         string  `json:"full_name"`
	Email            string  `json:"email,omitempty"`
	Role             string  `json:"role"`
	LastReadMessageID *int64 `json:"last_read_message_id,omitempty"`
	JoinedAt         string  `json:"joined_at"`
}

type MessageLink struct {
	ID         int64  `json:"id"`
	EntityType string `json:"entity_type"`
	EntityID   *int64 `json:"entity_id,omitempty"`
	Label      string `json:"label"`
	Href       string `json:"href"`
}

type MessageAttachment struct {
	ID               int64  `json:"id"`
	FileName         string `json:"file_name"`
	MimeType         string `json:"mime_type"`
	SizeBytes        int64  `json:"size_bytes"`
	UploadedByUserID *int64 `json:"uploaded_by_user_id,omitempty"`
	CreatedAt        string `json:"created_at"`
	DownloadPath     string `json:"download_path"`
}

type MessageReaction struct {
	Emoji string `json:"emoji"`
	Count int64  `json:"count"`
	Me    bool   `json:"me"`
}

type ParentPreview struct {
	ID         int64  `json:"id"`
	Body       string `json:"body"`
	SenderName string `json:"sender_name,omitempty"`
	Deleted    bool   `json:"deleted,omitempty"`
}

type Message struct {
	ID                     int64               `json:"id"`
	ChannelID              int64               `json:"channel_id"`
	SenderUserID           *int64              `json:"sender_user_id,omitempty"`
	SenderName             string              `json:"sender_name,omitempty"`
	SenderKind             string              `json:"sender_kind,omitempty"`
	Body                   string              `json:"body"`
	CreatedAt              string              `json:"created_at"`
	DeletedAt              *string             `json:"deleted_at,omitempty"`
	ParentMessageID        *int64              `json:"parent_message_id,omitempty"`
	ForwardedFromMessageID *int64              `json:"forwarded_from_message_id,omitempty"`
	ParentPreview          *ParentPreview      `json:"parent_preview,omitempty"`
	MentionIDs             []int64             `json:"mention_ids,omitempty"`
	Links                  []MessageLink       `json:"links,omitempty"`
	Attachments            []MessageAttachment `json:"attachments,omitempty"`
	Reactions              []MessageReaction   `json:"reactions,omitempty"`
	// ActionDraft is Baiko approve-to-open metadata (jsonb); omit for normal user messages.
	ActionDraft any `json:"action_draft,omitempty"`
}

type TypingUser struct {
	UserID   int64  `json:"user_id"`
	FullName string `json:"full_name"`
}

type Reminder struct {
	ID               int64   `json:"id"`
	ChannelID        *int64  `json:"channel_id,omitempty"`
	CreatedByUserID  *int64  `json:"created_by_user_id,omitempty"`
	Title            string  `json:"title"`
	Body             string  `json:"body,omitempty"`
	RemindAt         string  `json:"remind_at"`
	Status           string  `json:"status"`
	CRMTaskID        *int64  `json:"crm_task_id,omitempty"`
	NotifyChannel    bool    `json:"notify_channel"`
	CreatedAt        string  `json:"created_at"`
}

func canUseBaikoSlash(tu auth.TenantUser) bool {
	return tu.IsPlatformSuperadmin || tu.IsTenantOwner || auth.IsPlatformConsoleEmail(tu.Email)
}

type ChatUser struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Email    string `json:"email"`
}

type DocSearchHit struct {
	EntityType string `json:"entity_type"`
	EntityID   int64  `json:"entity_id"`
	Label      string `json:"label"`
	Href       string `json:"href"`
}

func requireMembership(ctx context.Context, pool *pgxpool.Pool, tenantID, channelID, userID int64) (role string, err error) {
	err = pool.QueryRow(ctx, `
		select m.role
		from public.chat_channel_members m
		join public.chat_channels c on c.id = m.channel_id
		where m.channel_id = $1 and m.user_id = $2 and c.tenant_id = $3 and c.archived_at is null`,
		channelID, userID, tenantID).Scan(&role)
	return role, err
}

func requireChannel(ctx context.Context, pool *pgxpool.Pool, tenantID, channelID int64) error {
	var id int64
	return pool.QueryRow(ctx, `
		select id from public.chat_channels
		where id = $1 and tenant_id = $2`, channelID, tenantID).Scan(&id)
}

func tenantUserExists(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) bool {
	var id int64
	err := pool.QueryRow(ctx, `
		select id from public.users
		where id = $1 and tenant_id = $2 and status = 'active'`, userID, tenantID).Scan(&id)
	return err == nil
}

func dmKey(a, b int64) string {
	if a > b {
		a, b = b, a
	}
	return fmt.Sprintf("%d:%d", a, b)
}

func allowedChatMime(mime, name string) bool {
	m := strings.ToLower(strings.TrimSpace(mime))
	ext := strings.ToLower(filepath.Ext(name))
	switch {
	case strings.HasPrefix(m, "image/"),
		strings.HasPrefix(m, "video/"),
		strings.HasPrefix(m, "audio/"):
		return true
	case m == "application/pdf", m == "application/msword",
		m == "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		m == "application/vnd.ms-excel",
		m == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		m == "application/vnd.ms-powerpoint",
		m == "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		m == "application/zip", m == "application/x-zip-compressed",
		m == "application/octet-stream",
		m == "text/plain", m == "text/csv", m == "text/markdown":
		return true
	case ext == ".pdf", ext == ".doc", ext == ".docx", ext == ".xls", ext == ".xlsx",
		ext == ".ppt", ext == ".pptx", ext == ".txt", ext == ".csv", ext == ".md",
		ext == ".png", ext == ".jpg", ext == ".jpeg", ext == ".gif", ext == ".webp",
		ext == ".heic", ext == ".bmp",
		ext == ".mp4", ext == ".webm", ext == ".mov", ext == ".m4a", ext == ".mp3",
		ext == ".zip", ext == ".rar", ext == ".7z":
		return true
	default:
		return ext != "" && len(ext) <= 8
	}
}

func resolveEntityLabel(ctx context.Context, pool *pgxpool.Pool, tenantID int64, entityType string, entityID int64) (label string, ok bool) {
	if IsReportEntityType(entityType) {
		switch entityType {
		case "report_ar_book":
			return "AR Customer/Vendor Book", true
		case "report_ap_book":
			return "AP Customer/Vendor Book", true
		case "report_stock_ledger":
			return "Stock Ledger", true
		}
	}
	switch entityType {
	case "quo_quotation":
		err := pool.QueryRow(ctx, `select reference_no from public.quo_quotations where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "so_sales_order":
		err := pool.QueryRow(ctx, `select sales_order_no from public.so_sales_orders where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "sa_sales":
		err := pool.QueryRow(ctx, `select sales_no from public.sa_sales where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "pr_purchase_request":
		err := pool.QueryRow(ctx, `select purchase_request_no from public.pr_purchase_requests where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "rfq_request":
		err := pool.QueryRow(ctx, `select rfq_no from public.rfq_requests where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "rfq_supplier_quotation":
		err := pool.QueryRow(ctx, `select quote_no from public.rfq_supplier_quotations where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "po_purchase_order":
		err := pool.QueryRow(ctx, `select purchase_order_no from public.po_purchase_orders where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "gr_goods_receipt":
		err := pool.QueryRow(ctx, `
			select coalesce(nullif(trim(reference), ''), 'GR-' || id::text)
			from public.gr_goods_receipts where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "fin_supplier_invoice":
		err := pool.QueryRow(ctx, `select invoice_no from public.fin_supplier_invoices where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "fin_official_receipt":
		err := pool.QueryRow(ctx, `select receipt_no from public.fin_official_receipts where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "fin_payment_voucher":
		err := pool.QueryRow(ctx, `select payment_no from public.fin_payment_vouchers where id=$1 and tenant_id=$2 and deleted_at is null`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "job_cost_project":
		err := pool.QueryRow(ctx, `select project_code from public.job_cost_projects where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "support_ticket":
		err := pool.QueryRow(ctx, `select coalesce(ticket_no, 'T-' || id::text) from public.sup_support_tickets where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	case "crm_warranty_asset":
		err := pool.QueryRow(ctx, `select coalesce(serial_no, 'WA-' || id::text) from public.crm_warranty_assets where id=$1 and tenant_id=$2`, entityID, tenantID).Scan(&label)
		return label, err == nil
	default:
		return "", false
	}
}
