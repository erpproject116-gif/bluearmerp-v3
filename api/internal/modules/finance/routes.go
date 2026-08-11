package finance

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

func RegisterRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Route("/finance", func(fr chi.Router) {
		registerFinanceWorkspaceRoutes(fr, pool)
		registerOfficialReceiptRoutes(fr, pool)
		registerOpenPaymentRoutes(fr, pool)
		registerSupplierInvoiceRoutes(fr, pool)
		registerSupplierInvoiceAttachmentRoutes(fr, pool)
		registerPaymentVoucherRoutes(fr, pool)
		registerReportRoutes(fr, pool)
		registerFinancialReportRoutes(fr, pool)
		registerJournalEntryRoutes(fr, pool)
		registerBankReconciliationRoutes(fr, pool)
		registerPaymentEntryRoutes(fr, pool)
		registerFiscalYearRoutes(fr, pool)
		registerAccountRoutes(fr, pool)
		registerWithholdingRoutes(fr, pool)
		registerWithholdingPrintRoutes(fr, pool)
		registerStatutoryRoutes(fr, pool)
		registerCheckRoutes(fr, pool)
		registerNoteRoutes(fr, pool)
		registerLandedCostRoutes(fr, pool)
		registerContractRoutes(fr, pool)
		registerRecurringExpenseRoutes(fr, pool)
		registerExpenseRoutes(fr, pool)
		registerCreditNoteRoutes(fr, pool)
		registerVendorCreditRoutes(fr, pool)
		registerRetainerRoutes(fr, pool)
		registerRecurringInvoiceRoutes(fr, pool)
	})
}

func softDelete(pool *pgxpool.Pool, w http.ResponseWriter, r *http.Request, table, action, targetType string) {
	tu, _ := auth.FromContext(r.Context())
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		response.Validation(w, map[string]string{"id": "Invalid id."})
		return
	}
	q := fmt.Sprintf(`update public.%s set deleted_at = now(), updated_at = now() where id = $1 and tenant_id = $2 and deleted_at is null`, table)
	tag, err := pool.Exec(r.Context(), q, id, tu.TenantID)
	if err != nil || tag.RowsAffected() == 0 {
		response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
		return
	}
	_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, action, targetType, &id, nil, nil)
	response.OK(w, nil, "Deleted.")
}
