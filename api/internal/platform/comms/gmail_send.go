package comms

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SendViaGmail delivers a MIME message using the sender's connected Gmail account.
func SendViaGmail(ctx context.Context, pool *pgxpool.Pool, cfg GmailConfig, tenantID, senderUserID int64, to, cc []string, subject, htmlBody string, attachments []gmailAttachment) (messageID, threadID string, err error) {
	if cfg.StubMode || !cfg.OAuthConfigured() {
		return "", "", fmt.Errorf("Gmail OAuth not configured")
	}
	row, err := loadGmailConnectionForUser(ctx, pool, tenantID, senderUserID)
	if err != nil {
		return "", "", fmt.Errorf("Gmail not connected for sender")
	}
	accessToken, err := ensureAccessToken(ctx, pool, cfg, row)
	if err != nil {
		return "", "", err
	}

	raw := buildMIMERaw(row.GoogleEmail, to, cc, subject, htmlBody, attachments)
	encoded := base64.RawURLEncoding.EncodeToString(raw)
	body := map[string]string{"raw": encoded}
	payload, _ := json.Marshal(body)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", bytes.NewReader(payload))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", "", fmt.Errorf("gmail send: %s", strings.TrimSpace(string(respBody)))
	}
	var sent struct {
		ID       string `json:"id"`
		ThreadID string `json:"threadId"`
	}
	if err := json.Unmarshal(respBody, &sent); err != nil {
		return "", "", err
	}
	return sent.ID, sent.ThreadID, nil
}

type gmailAttachment struct {
	Filename    string
	ContentType string
	Data        []byte
}

func buildMIMERaw(from string, to, cc []string, subject, htmlBody string, attachments []gmailAttachment) []byte {
	boundary := fmt.Sprintf("bluearm-gmail-%d", time.Now().UnixNano())
	var msg bytes.Buffer
	msg.WriteString("From: " + from + "\r\n")
	msg.WriteString("To: " + strings.Join(trimNonEmptyAddrs(to), ", ") + "\r\n")
	if len(cc) > 0 {
		msg.WriteString("Cc: " + strings.Join(trimNonEmptyAddrs(cc), ", ") + "\r\n")
	}
	msg.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	msg.WriteString("MIME-Version: 1.0\r\n")
	msg.WriteString(fmt.Sprintf("Content-Type: multipart/mixed; boundary=%q\r\n", boundary))
	msg.WriteString("\r\n")

	writePart := func(contentType, body string) {
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString("Content-Type: " + contentType + "\r\n")
		msg.WriteString("Content-Transfer-Encoding: 8bit\r\n\r\n")
		msg.WriteString(body)
		msg.WriteString("\r\n")
	}
	writePart("text/html; charset=UTF-8", htmlBody)

	for _, att := range attachments {
		if len(att.Data) == 0 {
			continue
		}
		ct := att.ContentType
		if ct == "" {
			ct = "application/octet-stream"
		}
		name := att.Filename
		if name == "" {
			name = "attachment"
		}
		msg.WriteString("--" + boundary + "\r\n")
		msg.WriteString(fmt.Sprintf("Content-Type: %s; name=%q\r\n", ct, name))
		msg.WriteString("Content-Transfer-Encoding: base64\r\n")
		msg.WriteString(fmt.Sprintf("Content-Disposition: attachment; filename=%q\r\n\r\n", name))
		encoded := base64.StdEncoding.EncodeToString(att.Data)
		for i := 0; i < len(encoded); i += 76 {
			end := i + 76
			if end > len(encoded) {
				end = len(encoded)
			}
			msg.WriteString(encoded[i:end] + "\r\n")
		}
	}
	msg.WriteString("--" + boundary + "--\r\n")
	return msg.Bytes()
}

func trimNonEmptyAddrs(addrs []string) []string {
	var out []string
	for _, a := range addrs {
		a = strings.TrimSpace(a)
		if a != "" {
			out = append(out, a)
		}
	}
	return out
}

func UpdateSentMessageGmailIDs(ctx context.Context, pool *pgxpool.Pool, tenantID, id int64, messageID, threadID string) error {
	_, err := pool.Exec(ctx, `
		update public.com_sent_messages
		set gmail_message_id = $1, gmail_thread_id = $2
		where id = $3 and tenant_id = $4`, messageID, threadID, id, tenantID)
	return err
}
