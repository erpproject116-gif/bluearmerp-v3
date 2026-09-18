// Package invoicevoid voids the accounting voucher behind a Sales or Supplier
// invoice: the linked journal entry is cancelled (draft) or reversed (posted),
// the document is soft-deleted with a reason for audit, and inventory is left
// exactly as it is. Product rule for v1: "delete invoice" means void the voucher
// and keep the audit trail — it never reverses stock movements, serials or lots.
package invoicevoid

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

// PaymentBlocker counts settlements that must be undone before a void.
// Query takes $1 = tenant id, $2 = document id and returns a count.
type PaymentBlocker struct {
	Label string
	Query string
}

type Config struct {
	Table         string // e.g. "fin_supplier_invoices"
	NumberColumn  string // e.g. "invoice_no"
	JournalColumn string // e.g. "invoice_journal_entry_id"
	DocumentType  string // document_lifecycle_actions.document_type
	DisplayName   string // e.g. "Supplier invoice"
	AuditAction   string // e.g. "purchase.invoice.void"
	AuditTarget   string // e.g. "fin_supplier_invoice"
	// JournalRemark labels the reversing journal entry, e.g. "Void purchase INV-1".
	JournalRemark func(documentNo string) string
	Payments      []PaymentBlocker
	// ReleaseSlipsSQL optionally detaches billing slips that only track invoiced
	// qty ($1 = document id). It must never touch stock movements, serials or lots.
	ReleaseSlipsSQL string
}

// Result is the void payload returned to the client.
type Result struct {
	DocumentID      int64  `json:"document_id"`
	DocumentNo      string `json:"document_no"`
	JournalEntryID  *int64 `json:"journal_entry_id"`
	JournalAction   string `json:"journal_action"`
	ReversalEntryID *int64 `json:"reversal_journal_entry_id,omitempty"`
	ReleasedSlips   int64  `json:"released_slip_lines"`
}

var identifierRE = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// ValidateConfig guards the interpolated identifiers and required labels.
func ValidateConfig(c Config) error {
	for name, ident := range map[string]string{
		"table":          c.Table,
		"number column":  c.NumberColumn,
		"journal column": c.JournalColumn,
	} {
		if !identifierRE.MatchString(ident) {
			return fmt.Errorf("invalid void %s %q", name, ident)
		}
	}
	if strings.TrimSpace(c.DocumentType) == "" || strings.TrimSpace(c.DisplayName) == "" {
		return errors.New("document type and display name are required")
	}
	if strings.TrimSpace(c.AuditAction) == "" || strings.TrimSpace(c.AuditTarget) == "" {
		return errors.New("audit action and target are required")
	}
	if c.JournalRemark == nil {
		return errors.New("journal remark builder is required")
	}
	for _, p := range c.Payments {
		if strings.TrimSpace(p.Label) == "" || strings.TrimSpace(p.Query) == "" {
			return errors.New("payment blocker label and query are required")
		}
	}
	return nil
}

// Handler serves POST {base}/{id}/void with a { reason } body.
func Handler(pool *pgxpool.Pool, cfg Config) http.HandlerFunc {
	if err := ValidateConfig(cfg); err != nil {
		panic(err)
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		reason, ok := readReason(w, r)
		if !ok {
			return
		}

		res, blocked, err := apply(r.Context(), pool, cfg, tu, id, reason)
		if errors.Is(err, pgx.ErrNoRows) {
			response.Err(w, http.StatusNotFound, cfg.DisplayName+" not found.", "ERR_NOT_FOUND")
			return
		}
		if blocked != "" {
			response.Err(w, http.StatusConflict, blocked, "ERR_VOID_BLOCKED")
			return
		}
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to void the invoice.", "ERR_INTERNAL")
			return
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, cfg.AuditAction, cfg.AuditTarget, &id, nil, map[string]any{
			"reason":                    reason,
			"document_no":               res.DocumentNo,
			"journal_entry_id":          res.JournalEntryID,
			"journal_action":            res.JournalAction,
			"reversal_journal_entry_id": res.ReversalEntryID,
			"released_slip_lines":       res.ReleasedSlips,
			"stock_reversed":            false,
		})
		response.OK(w, res, "Invoice voided.")
	}
}

// apply runs the void in one transaction. A non-empty blocked string is a
// user-facing 409 message; err is an unexpected failure.
func apply(ctx context.Context, pool *pgxpool.Pool, cfg Config, tu auth.TenantUser, id int64, reason string) (Result, string, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return Result{}, "", err
	}
	defer tx.Rollback(ctx)

	// Same key as documentlifecycle so void never interleaves with delete/restore.
	lockKey := fmt.Sprintf("document-lifecycle:%d:%s:%d", tu.TenantID, cfg.DocumentType, id)
	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
		return Result{}, "", err
	}

	out := Result{DocumentID: id, JournalAction: invoicejournal.VoidActionNone}
	var deletedAt any
	q := fmt.Sprintf(`
		select coalesce(%s, ''), %s, deleted_at
		from public.%s where id = $1 and tenant_id = $2 for update`,
		cfg.NumberColumn, cfg.JournalColumn, cfg.Table)
	if err := tx.QueryRow(ctx, q, id, tu.TenantID).Scan(&out.DocumentNo, &out.JournalEntryID, &deletedAt); err != nil {
		return Result{}, "", err
	}
	if deletedAt != nil {
		return Result{}, cfg.DisplayName + " is already voided.", nil
	}

	for _, p := range cfg.Payments {
		var count int64
		if err := tx.QueryRow(ctx, p.Query, tu.TenantID, id).Scan(&count); err != nil {
			return Result{}, "", err
		}
		if count > 0 {
			return Result{}, fmt.Sprintf(
				"Cannot void: %s (%d). Void or unapply the payment first.", p.Label, count), nil
		}
	}

	voided, err := invoicejournal.VoidTx(ctx, tx, tu.TenantID, tu.AppUserID, out.JournalEntryID, cfg.JournalRemark(out.DocumentNo))
	if err != nil {
		// Closed fiscal year/period is the only expected failure here.
		return Result{}, "Cannot void: " + err.Error() + ".", nil
	}
	out.JournalAction = voided.Action
	out.ReversalEntryID = voided.ReversalEntryID

	if cfg.ReleaseSlipsSQL != "" {
		tag, err := tx.Exec(ctx, cfg.ReleaseSlipsSQL, id)
		if err != nil {
			return Result{}, "", err
		}
		out.ReleasedSlips = tag.RowsAffected()
	}

	update := fmt.Sprintf(`
		update public.%s
		set deleted_at = now(), deleted_by_user_id = $3, delete_reason = $4,
		    updated_at = now(), lifecycle_version = lifecycle_version + 1
		where id = $1 and tenant_id = $2 and deleted_at is null`, cfg.Table)
	tag, err := tx.Exec(ctx, update, id, tu.TenantID, tu.AppUserID, reason)
	if err != nil {
		return Result{}, "", err
	}
	if tag.RowsAffected() != 1 {
		return Result{}, "Lifecycle state changed concurrently.", nil
	}
	if _, err := tx.Exec(ctx, `
		insert into public.document_lifecycle_actions
		  (tenant_id, document_type, document_id, action, reason, actor_user_id)
		values ($1,$2,$3,'void',$4,$5)`,
		tu.TenantID, cfg.DocumentType, id, reason, tu.AppUserID); err != nil {
		return Result{}, "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return Result{}, "", err
	}
	return out, "", nil
}

func readReason(w http.ResponseWriter, r *http.Request) (string, bool) {
	var body struct {
		Reason string `json:"reason"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&body)
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		reason = strings.TrimSpace(r.URL.Query().Get("reason"))
	}
	if reason == "" {
		response.Validation(w, map[string]string{"reason": "Reason is required."})
		return "", false
	}
	if len(reason) > 2000 {
		response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
		return "", false
	}
	return reason, true
}
