package comms

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SentMessage is a row from com_sent_messages.
type SentMessage struct {
	ID              int64    `json:"id"`
	Channel         string   `json:"channel"`
	DocType         string   `json:"doc_type"`
	DocID           int64    `json:"doc_id"`
	ToAddrs         []string `json:"to_addrs"`
	CcAddrs         []string `json:"cc_addrs"`
	Subject         string   `json:"subject"`
	BodyText        string   `json:"body_text"`
	Status          string   `json:"status"`
	SentByUserID    *int64   `json:"sent_by_user_id,omitempty"`
	SentByName      string   `json:"sent_by_name,omitempty"`
	GmailMessageID  *string  `json:"gmail_message_id,omitempty"`
	GmailThreadID   *string  `json:"gmail_thread_id,omitempty"`
	ErrorMessage    *string  `json:"error_message,omitempty"`
	CreatedAt       string   `json:"created_at"`
}

type InsertSentMessageParams struct {
	TenantID     int64
	Channel      string
	DocType      string
	DocID        int64
	ToAddrs      []string
	CcAddrs      []string
	Subject      string
	BodyText     string
	SentByUserID *int64
}

func InsertSentMessageTx(ctx context.Context, tx pgx.Tx, p InsertSentMessageParams) (int64, error) {
	channel := p.Channel
	if channel == "" {
		channel = "email"
	}
	toJSON, err := json.Marshal(p.ToAddrs)
	if err != nil {
		return 0, err
	}
	ccJSON, err := json.Marshal(p.CcAddrs)
	if err != nil {
		return 0, err
	}
	var id int64
	err = tx.QueryRow(ctx, `
		insert into public.com_sent_messages
		  (tenant_id, channel, doc_type, doc_id, to_addrs, cc_addrs, subject, body_text, status, sent_by_user_id)
		values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, 'pending', $9)
		returning id`,
		p.TenantID, channel, p.DocType, p.DocID, toJSON, ccJSON, p.Subject, p.BodyText, p.SentByUserID).
		Scan(&id)
	return id, err
}

func InsertThreadLinkTx(ctx context.Context, tx pgx.Tx, sentMessageID int64, docType string, docID int64) error {
	_, err := tx.Exec(ctx, `
		insert into public.com_thread_links (sent_message_id, doc_type, doc_id)
		values ($1, $2, $3)`, sentMessageID, docType, docID)
	return err
}

func UpdateSentMessageStatus(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64, status string, errMsg *string) error {
	_, err := pool.Exec(ctx, `
		update public.com_sent_messages
		set status = $1, error_message = $2
		where id = $3 and tenant_id = $4`, status, errMsg, id, tenantID)
	return err
}

type ListSentMessagesParams struct {
	TenantID int64
	Page     int
	PageSize int
	DocType  string
	Channel  string
}

type ListSentMessagesResult struct {
	Rows  []SentMessage
	Total int64
}

func ListSentMessages(ctx context.Context, pool *pgxpool.Pool, p ListSentMessagesParams) (ListSentMessagesResult, error) {
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
	if p.DocType != "" {
		where += fmt.Sprintf(" and m.doc_type = $%d", argN)
		args = append(args, p.DocType)
		argN++
	}
	if p.Channel != "" {
		where += fmt.Sprintf(" and m.channel = $%d", argN)
		args = append(args, p.Channel)
		argN++
	}

	var total int64
	countQ := "select count(*) from public.com_sent_messages m " + where
	if err := pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return ListSentMessagesResult{}, err
	}

	listQ := fmt.Sprintf(`
		select m.id, m.channel, m.doc_type, m.doc_id, m.to_addrs, m.cc_addrs,
		  m.subject, m.body_text, m.status, m.sent_by_user_id, coalesce(u.full_name, ''),
		  m.gmail_message_id, m.gmail_thread_id, m.error_message, m.created_at
		from public.com_sent_messages m
		left join public.users u on u.id = m.sent_by_user_id
		%s
		order by m.created_at desc
		limit $%d offset $%d`, where, argN, argN+1)
	args = append(args, pageSize, offset)

	rows, err := pool.Query(ctx, listQ, args...)
	if err != nil {
		return ListSentMessagesResult{}, err
	}
	defer rows.Close()

	var out []SentMessage
	for rows.Next() {
		var sm SentMessage
		var toRaw, ccRaw []byte
		var sentByID *int64
		var gmailMsgID, gmailThreadID, errMsg *string
		var createdAt time.Time
		if err := rows.Scan(
			&sm.ID, &sm.Channel, &sm.DocType, &sm.DocID, &toRaw, &ccRaw,
			&sm.Subject, &sm.BodyText, &sm.Status, &sentByID, &sm.SentByName,
			&gmailMsgID, &gmailThreadID, &errMsg, &createdAt,
		); err != nil {
			return ListSentMessagesResult{}, err
		}
		sm.SentByUserID = sentByID
		sm.GmailMessageID = gmailMsgID
		sm.GmailThreadID = gmailThreadID
		sm.ErrorMessage = errMsg
		sm.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		_ = json.Unmarshal(toRaw, &sm.ToAddrs)
		_ = json.Unmarshal(ccRaw, &sm.CcAddrs)
		out = append(out, sm)
	}
	return ListSentMessagesResult{Rows: out, Total: total}, rows.Err()
}

func loadSentMessage(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64) (SentMessage, error) {
	var sm SentMessage
	var toRaw, ccRaw []byte
	var sentByID *int64
	var gmailMsgID, gmailThreadID, errMsg *string
	var createdAt time.Time
	err := pool.QueryRow(ctx, `
		select m.id, m.channel, m.doc_type, m.doc_id, m.to_addrs, m.cc_addrs,
		  m.subject, m.body_text, m.status, m.sent_by_user_id, coalesce(u.full_name, ''),
		  m.gmail_message_id, m.gmail_thread_id, m.error_message, m.created_at
		from public.com_sent_messages m
		left join public.users u on u.id = m.sent_by_user_id
		where m.id = $1 and m.tenant_id = $2`, id, tenantID).Scan(
		&sm.ID, &sm.Channel, &sm.DocType, &sm.DocID, &toRaw, &ccRaw,
		&sm.Subject, &sm.BodyText, &sm.Status, &sentByID, &sm.SentByName,
		&gmailMsgID, &gmailThreadID, &errMsg, &createdAt,
	)
	if err != nil {
		return SentMessage{}, err
	}
	sm.SentByUserID = sentByID
	sm.GmailMessageID = gmailMsgID
	sm.GmailThreadID = gmailThreadID
	sm.ErrorMessage = errMsg
	sm.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	_ = json.Unmarshal(toRaw, &sm.ToAddrs)
	_ = json.Unmarshal(ccRaw, &sm.CcAddrs)
	return sm, nil
}
