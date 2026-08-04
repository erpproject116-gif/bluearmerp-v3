package finance

import (
	"context"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/approval"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func ensureAmountApproval(ctx context.Context, tx pgx.Tx, tu auth.TenantUser, entityType string, entityID int64, amount float64) (deferred bool, msg string, err error) {
	needs, threshold, err := approval.RequiresAmountApproval(ctx, tx, tu.TenantID, entityType, amount)
	if err != nil || !needs {
		return false, "", err
	}
	status, found, err := approval.Status(ctx, tx, tu.TenantID, entityType, entityID)
	if err != nil {
		return false, "", err
	}
	if found && status == "confirmed" {
		return false, "", nil
	}
	if !found {
		if err := approval.Submit(ctx, tx, tu, entityType, entityID, nil); err != nil {
			return false, "", err
		}
	}
	return true, fmt.Sprintf("Submitted for approval (threshold ≥ %.2f). Complete approval then post journal.", threshold), nil
}

func validateExpenseAmountApproval(ctx context.Context, q interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}, tu auth.TenantUser, expenseID int64, amount float64) map[string]string {
	needs, threshold, err := approval.RequiresAmountApproval(ctx, q, tu.TenantID, "expense", amount)
	if err != nil || !needs {
		return nil
	}
	status, found, err := approval.Status(ctx, q, tu.TenantID, "expense", expenseID)
	if err != nil {
		return map[string]string{"approval": "Failed to check approval status."}
	}
	if found && status == "confirmed" {
		return nil
	}
	return map[string]string{
		"approval": fmt.Sprintf("Expense amount requires approval (threshold ≥ %.2f). Submit and approve before paying.", threshold),
	}
}

func registerPaymentVoucherApprovalRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.With(auth.RequirePermission("finance.payment_vouchers", auth.AccessWrite)).Post("/payment-vouchers/{id}/post-journal", postPaymentVoucherJournal(pool))
}

func postPaymentVoucherJournal(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil || id <= 0 {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		if blockIfPosted(w, r, pool, tu.TenantID, "payment_voucher", id, "Posting") {
			return
		}
		pv, err := loadPaymentVoucher(r.Context(), pool, tu.TenantID, id)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Payment voucher not found.", "ERR_NOT_FOUND")
			return
		}
		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post journal.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())
		if deferred, msg, err := ensureAmountApproval(r.Context(), tx, tu, "payment_voucher", id, pv.AmountTotal); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to check approval.", "ERR_INTERNAL")
			return
		} else if deferred {
			response.Validation(w, map[string]string{"approval": msg})
			return
		}
		whtTotal := sumPVWithholdingTax(pv.WithholdingLines)
		paymentDate, _ := parseDate(pv.PaymentDate)
		ev := withEntryDate(buildPVPostingEvent(tu.TenantID, id, pv.PartnerID, pv.AmountTotal, whtTotal, pv.PaymentMethod, mustEWTPayableCode(r.Context(), tx, tu.TenantID)), paymentDate)
		if _, err := postWithJournalPoster(r.Context(), tx, tu.TenantID, ev); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to post journal entry.", "ERR_INTERNAL")
			return
		}
		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to save.", "ERR_INTERNAL")
			return
		}
		response.OK(w, map[string]any{"id": id, "posted": true}, "Journal posted.")
	}
}

func sumPVWithholdingTax(lines []WithholdingLineResponse) float64 {
	var total float64
	for _, ln := range lines {
		total += ln.TaxAmount
	}
	return total
}
