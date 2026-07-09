package comms

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// MailMessage is a row from com_mail_messages for API responses.
type MailMessage struct {
	ID              int64    `json:"id"`
	Direction       string   `json:"direction"`
	FromAddr        string   `json:"from_addr"`
	ToAddrs         []string `json:"to_addrs"`
	CcAddrs         []string `json:"cc_addrs"`
	Subject         string   `json:"subject"`
	Snippet         string   `json:"snippet"`
	BodyText        string   `json:"body_text,omitempty"`
	GmailMessageID  string   `json:"gmail_message_id"`
	GmailThreadID   *string  `json:"gmail_thread_id,omitempty"`
	InternalDate    *string  `json:"internal_date,omitempty"`
	LinkedDocType   *string  `json:"linked_doc_type,omitempty"`
	LinkedDocID     *int64   `json:"linked_doc_id,omitempty"`
	SentMessageID   *int64   `json:"sent_message_id,omitempty"`
	OwnerUserID     *int64   `json:"owner_user_id,omitempty"`
	OwnerName       string   `json:"owner_name,omitempty"`
	IsStub          bool     `json:"is_stub,omitempty"`
	SyncedAt        string   `json:"synced_at"`
}

type insertMailMessageParams struct {
	TenantID       int64
	ConnectionID   *int64
	OwnerUserID    *int64
	GmailMessageID string
	GmailThreadID  *string
	Direction      string
	FromAddr       string
	ToAddrs        []string
	CcAddrs        []string
	Subject        string
	Snippet        string
	BodyText       string
	InternalDate   time.Time
	SentMessageID  *int64
	LinkedDocType  *string
	LinkedDocID    *int64
	IsStub         bool
}

func upsertMailMessage(ctx context.Context, pool *pgxpool.Pool, p insertMailMessageParams) (int, error) {
	toJSON, _ := json.Marshal(p.ToAddrs)
	ccJSON, _ := json.Marshal(p.CcAddrs)
	tag, err := pool.Exec(ctx, `
		insert into public.com_mail_messages
		  (tenant_id, connection_id, owner_user_id, gmail_message_id, gmail_thread_id, direction,
		   from_addr, to_addrs, cc_addrs, subject, snippet, body_text, internal_date,
		   sent_message_id, linked_doc_type, linked_doc_id, is_stub, synced_at)
		values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,now())
		on conflict (tenant_id, gmail_message_id) do update set
		  snippet = excluded.snippet,
		  body_text = case when excluded.body_text <> '' then excluded.body_text else com_mail_messages.body_text end,
		  linked_doc_type = coalesce(excluded.linked_doc_type, com_mail_messages.linked_doc_type),
		  linked_doc_id = coalesce(excluded.linked_doc_id, com_mail_messages.linked_doc_id),
		  sent_message_id = coalesce(excluded.sent_message_id, com_mail_messages.sent_message_id),
		  synced_at = now()`,
		p.TenantID, p.ConnectionID, p.OwnerUserID, p.GmailMessageID, p.GmailThreadID, p.Direction,
		p.FromAddr, toJSON, ccJSON, p.Subject, p.Snippet, p.BodyText, p.InternalDate,
		p.SentMessageID, p.LinkedDocType, p.LinkedDocID, p.IsStub)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// DocEmailEntry combines sent log and synced mail for document modals.
type DocEmailEntry struct {
	Source          string   `json:"source"`
	ID              int64    `json:"id"`
	Direction       string   `json:"direction"`
	Subject         string   `json:"subject"`
	FromAddr        string   `json:"from_addr,omitempty"`
	ToAddrs         []string `json:"to_addrs"`
	Status          string   `json:"status,omitempty"`
	SentByName      string   `json:"sent_by_name,omitempty"`
	BodyText        string   `json:"body_text,omitempty"`
	Snippet         string   `json:"snippet,omitempty"`
	GmailThreadID   *string  `json:"gmail_thread_id,omitempty"`
	CreatedAt       string   `json:"created_at"`
}

func ListDocEmails(ctx context.Context, pool *pgxpool.Pool, tenantID int64, docType string, docID int64) ([]DocEmailEntry, error) {
	var out []DocEmailEntry

	sentRows, err := pool.Query(ctx, `
		select m.id, m.subject, m.to_addrs, m.cc_addrs, m.body_text, m.status,
		  coalesce(u.full_name, ''), m.gmail_thread_id, m.created_at
		from public.com_thread_links tl
		join public.com_sent_messages m on m.id = tl.sent_message_id
		left join public.users u on u.id = m.sent_by_user_id
		where tl.doc_type = $1 and tl.doc_id = $2 and m.tenant_id = $3
		order by m.created_at desc`, docType, docID, tenantID)
	if err != nil {
		return nil, err
	}
	defer sentRows.Close()

	threadIDs := map[string]bool{}
	for sentRows.Next() {
		var entry DocEmailEntry
		var toRaw []byte
		var gmailThreadID *string
		var createdAt time.Time
		if err := sentRows.Scan(&entry.ID, &entry.Subject, &toRaw, new([]byte), &entry.BodyText, &entry.Status,
			&entry.SentByName, &gmailThreadID, &createdAt); err != nil {
			return nil, err
		}
		entry.Source = "sent"
		entry.Direction = "outbound"
		_ = json.Unmarshal(toRaw, &entry.ToAddrs)
		entry.GmailThreadID = gmailThreadID
		entry.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		out = append(out, entry)
		if gmailThreadID != nil && *gmailThreadID != "" {
			threadIDs[*gmailThreadID] = true
		}
	}
	if err := sentRows.Err(); err != nil {
		return nil, err
	}

	mailRows, err := pool.Query(ctx, `
		select id, direction, subject, from_addr, to_addrs, snippet, body_text, gmail_thread_id,
		  coalesce(internal_date, synced_at)
		from public.com_mail_messages
		where tenant_id = $1
		  and (
		    (linked_doc_type = $2 and linked_doc_id = $3)
		    or gmail_thread_id in (
		      select distinct m.gmail_thread_id
		      from public.com_thread_links tl
		      join public.com_sent_messages m on m.id = tl.sent_message_id
		      where tl.doc_type = $2 and tl.doc_id = $3 and m.gmail_thread_id is not null
		    )
		  )
		order by coalesce(internal_date, synced_at) desc`, tenantID, docType, docID)
	if err != nil {
		return nil, err
	}
	defer mailRows.Close()

	for mailRows.Next() {
		var entry DocEmailEntry
		var toRaw []byte
		var gmailThreadID *string
		var when time.Time
		if err := mailRows.Scan(&entry.ID, &entry.Direction, &entry.Subject, &entry.FromAddr, &toRaw,
			&entry.Snippet, &entry.BodyText, &gmailThreadID, &when); err != nil {
			return nil, err
		}
		entry.Source = "mail"
		_ = json.Unmarshal(toRaw, &entry.ToAddrs)
		entry.GmailThreadID = gmailThreadID
		entry.CreatedAt = when.UTC().Format(time.RFC3339)
		out = append(out, entry)
	}
	return out, mailRows.Err()
}

type ListInboxParams struct {
	TenantID int64
	User     auth.TenantUser
	Page     int
	PageSize int
	Q        string
}

type ListInboxResult struct {
	Rows  []MailMessage
	Total int64
}

func canViewAllCommsInbox(tu auth.TenantUser) bool {
	if tu.IsPlatformSuperadmin || tu.IsTenantOwner || tu.IsStoreAdmin {
		return true
	}
	return tu.HasPermission("comms.admin", auth.AccessWrite)
}

func ListInboxMessages(ctx context.Context, pool *pgxpool.Pool, p ListInboxParams) (ListInboxResult, error) {
	page := p.Page
	if page < 1 {
		page = 1
	}
	pageSize := p.PageSize
	if pageSize < 1 || pageSize > 100 {
		pageSize = 25
	}
	offset := (page - 1) * pageSize

	where := "where m.tenant_id = $1"
	args := []any{p.TenantID}
	argN := 2

	if !canViewAllCommsInbox(p.User) {
		scope := fmt.Sprintf(` and (
		  m.owner_user_id = $%d
		  or exists (
		    select 1 from public.com_sent_messages sm
		    where sm.id = m.sent_message_id and sm.sent_by_user_id = $%d
		  )
		  or (m.linked_doc_type = 'quotation' and exists (
		    select 1 from public.quo_quotations q
		    where q.id = m.linked_doc_id and q.tenant_id = m.tenant_id
		      and (q.pic_user_id = $%d or q.created_by_user_id = $%d)
		  ))
		  or (m.linked_doc_type = 'sales_order' and exists (
		    select 1 from public.so_sales_orders so
		    where so.id = m.linked_doc_id and so.tenant_id = m.tenant_id
		      and (so.pic_user_id = $%d or so.sales_person_id = $%d or so.created_by_user_id = $%d)
		  ))
		  or (m.linked_doc_type = 'sales' and exists (
		    select 1 from public.sa_sales s
		    where s.id = m.linked_doc_id and s.tenant_id = m.tenant_id
		      and (s.pic_user_id = $%d or s.created_by_user_id = $%d)
		  ))
		)`, argN, argN, argN, argN, argN, argN, argN, argN, argN)
		where += scope
		args = append(args, p.User.AppUserID)
		argN++
	}

	if p.Q != "" {
		where += fmt.Sprintf(" and (m.subject ilike $%d or m.from_addr ilike $%d or m.snippet ilike $%d)", argN, argN, argN)
		args = append(args, "%"+p.Q+"%")
		argN++
	}

	countQ := "select count(*) from public.com_mail_messages m " + where
	var total int64
	if err := pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return ListInboxResult{}, err
	}

	listQ := fmt.Sprintf(`
		select m.id, m.direction, m.from_addr, m.to_addrs, m.cc_addrs, m.subject, m.snippet, m.body_text,
		  m.gmail_message_id, m.gmail_thread_id, m.internal_date, m.linked_doc_type, m.linked_doc_id,
		  m.sent_message_id, m.owner_user_id, coalesce(u.full_name, ''), m.is_stub, m.synced_at
		from public.com_mail_messages m
		left join public.users u on u.id = m.owner_user_id
		%s
		order by coalesce(m.internal_date, m.synced_at) desc
		limit $%d offset $%d`, where, argN, argN+1)
	args = append(args, pageSize, offset)

	rows, err := pool.Query(ctx, listQ, args...)
	if err != nil {
		return ListInboxResult{}, err
	}
	defer rows.Close()

	var out []MailMessage
	for rows.Next() {
		var mm MailMessage
		var toRaw, ccRaw []byte
		var internalDate, syncedAt time.Time
		var internalPtr *time.Time
		if err := rows.Scan(
			&mm.ID, &mm.Direction, &mm.FromAddr, &toRaw, &ccRaw, &mm.Subject, &mm.Snippet, &mm.BodyText,
			&mm.GmailMessageID, &mm.GmailThreadID, &internalPtr, &mm.LinkedDocType, &mm.LinkedDocID,
			&mm.SentMessageID, &mm.OwnerUserID, &mm.OwnerName, &mm.IsStub, &syncedAt,
		); err != nil {
			return ListInboxResult{}, err
		}
		_ = json.Unmarshal(toRaw, &mm.ToAddrs)
		_ = json.Unmarshal(ccRaw, &mm.CcAddrs)
		if internalPtr != nil {
			internalDate = *internalPtr
			s := internalDate.UTC().Format(time.RFC3339)
			mm.InternalDate = &s
		}
		mm.SyncedAt = syncedAt.UTC().Format(time.RFC3339)
		out = append(out, mm)
	}
	return ListInboxResult{Rows: out, Total: total}, rows.Err()
}
