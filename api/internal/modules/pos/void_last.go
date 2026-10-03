package pos

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/invoicejournal"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/ledger"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type voidLastBody struct {
	Reason string `json:"reason"`
}

type voidLastResult struct {
	SalesID           int64   `json:"sales_id"`
	SalesNo           string  `json:"sales_no"`
	GrandTotal        float64 `json:"grand_total"`
	JournalAction     string  `json:"journal_action"`
	ORVoided          int     `json:"or_voided"`
	ReversalEntryID   *int64  `json:"reversal_journal_entry_id,omitempty"`
}

func registerVoidLastRoute(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("pos.checkout", auth.AccessWrite)).
		Post("/sessions/{id}/void-last", voidLastCheckout(pool))
}

// voidLastCheckout reverses the most recent completed POS sale on an open session.
// Reversal only — no hard-delete of sa_sales / tenders / movements.
func voidLastCheckout(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		sessionID, err := parseID(chi.URLParam(r, "id"))
		if err != nil || !sessionOpen(r.Context(), pool, tu.TenantID, sessionID) {
			response.Validation(w, map[string]string{"session": "Open session required."})
			return
		}
		var body voidLastBody
		_ = json.NewDecoder(r.Body).Decode(&body)
		reason := strings.TrimSpace(body.Reason)
		if reason == "" {
			reason = "Void last sale at register"
		}
		if len(reason) > 2000 {
			response.Validation(w, map[string]string{"reason": "Reason must not exceed 2000 characters."})
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to void sale.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		lockKey := fmt.Sprintf("pos-void-last:%d:%d", tu.TenantID, sessionID)
		if _, err := tx.Exec(r.Context(), `select pg_advisory_xact_lock(hashtextextended($1, 0))`, lockKey); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to lock session.", "ERR_INTERNAL")
			return
		}

		var salesID int64
		var salesNo string
		var grandTotal float64
		var jeID *int64
		err = tx.QueryRow(r.Context(), `
			select s.id, s.sales_no, s.grand_total::float8, s.invoice_journal_entry_id
			from public.pos_tenders t
			join public.sa_sales s on s.id = t.sales_id and s.tenant_id = $1 and s.deleted_at is null
			where t.session_id = $2
			order by t.id desc
			limit 1`, tu.TenantID, sessionID).Scan(&salesID, &salesNo, &grandTotal, &jeID)
		if err != nil {
			if err == pgx.ErrNoRows {
				response.Validation(w, map[string]string{"sale": "No sale to void on this shift."})
				return
			}
			response.Err(w, http.StatusInternalServerError, "Failed to load last sale.", "ERR_INTERNAL")
			return
		}

		docLock := fmt.Sprintf("document-lifecycle:%d:sa_sale:%d", tu.TenantID, salesID)
		if _, err := tx.Exec(r.Context(), `select pg_advisory_xact_lock(hashtextextended($1, 0))`, docLock); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to lock sale.", "ERR_INTERNAL")
			return
		}

		orVoided, blocked, err := voidExclusiveOfficialReceipts(r.Context(), tx, tu.TenantID, tu.AppUserID, salesID, salesNo, reason)
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to reverse official receipt.", "ERR_INTERNAL")
			return
		}
		if blocked != "" {
			response.Err(w, http.StatusConflict, blocked, "ERR_VALIDATION")
			return
		}

		if err := sales.ReverseCompletedSaleInventory(r.Context(), tx, tu.TenantID, salesID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to restore stock.", "ERR_INTERNAL")
			return
		}

		_ = voidCommissionJournalsForSale(r.Context(), tx, tu.TenantID, tu.AppUserID, salesID, salesNo)

		voided, err := invoicejournal.VoidTx(r.Context(), tx, tu.TenantID, tu.AppUserID, jeID, "Void POS sale "+salesNo)
		if err != nil {
			response.Err(w, http.StatusConflict, "Cannot void: "+err.Error()+".", "ERR_VALIDATION")
			return
		}

		tag, err := tx.Exec(r.Context(), `
			update public.sa_sales
			set deleted_at = now(), deleted_by_user_id = $3, delete_reason = $4,
			    updated_at = now(), lifecycle_version = lifecycle_version + 1
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			salesID, tu.TenantID, tu.AppUserID, reason)
		if err != nil || tag.RowsAffected() != 1 {
			response.Err(w, http.StatusConflict, "Sale state changed — refresh and try again.", "ERR_VALIDATION")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			insert into public.document_lifecycle_actions
			  (tenant_id, document_type, document_id, action, reason, actor_user_id)
			values ($1,'sa_sale',$2,'void',$3,$4)`,
			tu.TenantID, salesID, reason, tu.AppUserID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to write audit.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.pos_sessions
			set sales_total = greatest(0, sales_total - $3), updated_at = now()
			where id = $1 and tenant_id = $2`, sessionID, tu.TenantID, grandTotal); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to update session.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save void.", "ERR_INTERNAL")
			return
		}

		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "pos.void_last", "sa_sales", &salesID, nil, map[string]any{
			"session_id": sessionID,
			"sales_no":   salesNo,
			"reason":     reason,
			"or_voided":  orVoided,
		})

		response.OK(w, voidLastResult{
			SalesID:         salesID,
			SalesNo:         salesNo,
			GrandTotal:      grandTotal,
			JournalAction:   voided.Action,
			ORVoided:        orVoided,
			ReversalEntryID: voided.ReversalEntryID,
		}, "Sale voided.")
	}
}

// voidExclusiveOfficialReceipts soft-voids ORs that apply only to this sale.
// Multi-invoice ORs block void-last (Finance must unapply first).
func voidExclusiveOfficialReceipts(
	ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64, salesNo, reason string,
) (voidedCount int, blocked string, err error) {
	rows, err := tx.Query(ctx, `
		select distinct a.official_receipt_id
		from public.fin_receipt_applications a
		join public.fin_official_receipts r on r.id = a.official_receipt_id
		where a.sales_id = $1 and r.tenant_id = $2 and r.deleted_at is null`, salesID, tenantID)
	if err != nil {
		return 0, "", err
	}
	var receiptIDs []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return 0, "", err
		}
		receiptIDs = append(receiptIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, "", err
	}

	for _, rid := range receiptIDs {
		var otherCount int64
		if err := tx.QueryRow(ctx, `
			select count(*) from public.fin_receipt_applications
			where official_receipt_id = $1 and sales_id <> $2`, rid, salesID).Scan(&otherCount); err != nil {
			return voidedCount, "", err
		}
		if otherCount > 0 {
			return voidedCount, "Cannot void: official receipt is applied to other invoices. Unapply in Finance first.", nil
		}

		entryNo := ledger.EntryNo("official_receipt", rid)
		var jeID *int64
		var jeRowID int64
		err := tx.QueryRow(ctx, `
			select id from public.fin_journal_entries
			where tenant_id = $1 and entry_no = $2
			order by id desc limit 1`, tenantID, entryNo).Scan(&jeRowID)
		if err == nil {
			jeID = &jeRowID
		} else if err != pgx.ErrNoRows {
			return voidedCount, "", err
		}

		if _, err := invoicejournal.VoidTx(ctx, tx, tenantID, userID, jeID, "Void POS OR for "+salesNo); err != nil {
			return voidedCount, "Cannot void official receipt journal: " + err.Error() + ".", nil
		}

		if _, err := tx.Exec(ctx, `delete from public.fin_receipt_applications where official_receipt_id = $1`, rid); err != nil {
			return voidedCount, "", err
		}
		if _, err := tx.Exec(ctx, `
			update public.fin_official_receipts
			set deleted_at = now(), notes = coalesce(notes,'') || $3, updated_at = now()
			where id = $1 and tenant_id = $2 and deleted_at is null`,
			rid, tenantID, "\n[POS void-last] "+reason); err != nil {
			return voidedCount, "", err
		}
		voidedCount++
	}
	return voidedCount, "", nil
}

func voidCommissionJournalsForSale(ctx context.Context, tx pgx.Tx, tenantID, userID, salesID int64, salesNo string) error {
	rows, err := tx.Query(ctx, `
		select distinct journal_entry_id
		from public.sa_commission_accruals
		where tenant_id = $1 and sales_id = $2 and journal_entry_id is not null`, tenantID, salesID)
	if err != nil {
		// Table may be missing on older DBs — soft-skip.
		if strings.Contains(err.Error(), "sa_commission_accruals") {
			return nil
		}
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var jeID int64
		if err := rows.Scan(&jeID); err != nil {
			return err
		}
		id := jeID
		if _, err := invoicejournal.VoidTx(ctx, tx, tenantID, userID, &id, "Void POS commission "+salesNo); err != nil {
			return err
		}
	}
	return rows.Err()
}
