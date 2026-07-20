package comms

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// EmailSignature is the caller's HTML email signature / footnote.
type EmailSignature struct {
	SignatureHTML    string `json:"signature_html"`
	IncludeByDefault bool   `json:"include_by_default"`
	UpdatedAt        string `json:"updated_at,omitempty"`
}

func getEmailSignature(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sig, err := loadEmailSignature(r.Context(), pool, tu.TenantID, tu.AppUserID)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to load signature.", "ERR_INTERNAL")
			return
		}
		response.OK(w, sig, "OK")
	}
}

func putEmailSignature(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body EmailSignature
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		html := strings.TrimSpace(body.SignatureHTML)
		if len(html) > 50_000 {
			response.Validation(w, map[string]string{"signature_html": "Signature is too long (max 50KB)."})
			return
		}
		_, err := pool.Exec(r.Context(), `
			insert into public.com_email_signatures (tenant_id, user_id, signature_html, include_by_default, updated_at)
			values ($1, $2, $3, $4, now())
			on conflict (tenant_id, user_id) do update set
			  signature_html = excluded.signature_html,
			  include_by_default = excluded.include_by_default,
			  updated_at = now()`,
			tu.TenantID, tu.AppUserID, html, body.IncludeByDefault)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save signature.", "ERR_INTERNAL")
			return
		}
		sig, _ := loadEmailSignature(r.Context(), pool, tu.TenantID, tu.AppUserID)
		response.OK(w, sig, "Signature saved.")
	}
}

func loadEmailSignature(ctx context.Context, pool *pgxpool.Pool, tenantID, userID int64) (EmailSignature, error) {
	var sig EmailSignature
	var updated *time.Time
	err := pool.QueryRow(ctx, `
		select signature_html, include_by_default, updated_at
		from public.com_email_signatures
		where tenant_id = $1 and user_id = $2`, tenantID, userID).
		Scan(&sig.SignatureHTML, &sig.IncludeByDefault, &updated)
	if err == pgx.ErrNoRows {
		return EmailSignature{IncludeByDefault: true}, nil
	}
	if err != nil {
		return EmailSignature{}, err
	}
	if updated != nil {
		sig.UpdatedAt = updated.UTC().Format(time.RFC3339)
	}
	return sig, nil
}
