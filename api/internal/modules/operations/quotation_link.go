package operations

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type createQuotationResult struct {
	QuotationID   int64  `json:"quotation_id"`
	ReferenceNo   string `json:"reference_no"`
	WorkItemID    int64  `json:"work_item_id"`
	EditURL       string `json:"edit_url"`
}

func createQuotationFromWorkItem(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		workItemID, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid work item id."})
			return
		}

		item, err := loadWorkItem(r.Context(), pool, tu.TenantID, workItemID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Work item not found.", "ERR_NOT_FOUND")
			return
		}
		if item.QuotationID != nil && *item.QuotationID > 0 {
			response.Validation(w, map[string]string{"quotation": "Work item already has a linked quotation."})
			return
		}

		ws, err := loadWorkspace(r.Context(), pool, tu.TenantID, item.WorkspaceID)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Workspace not found.", "ERR_NOT_FOUND")
			return
		}

		tx, err := pool.Begin(r.Context())
		if err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to start transaction.", "ERR_INTERNAL")
			return
		}
		defer tx.Rollback(r.Context())

		var partnerID int64
		if item.PartnerID != nil && *item.PartnerID > 0 {
			partnerID = *item.PartnerID
		} else {
			response.Validation(w, map[string]string{"partner_id": "Assign a customer to the work item before creating a quotation."})
			return
		}

		taxTypeID, err := firstActiveTaxTypeID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"tax_type_id": "No active transaction type found."})
			return
		}
		currencyID, err := defaultCurrencyID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"currency_id": "No active currency found."})
			return
		}
		locationID, err := firstActiveLocationID(r.Context(), tx, tu.TenantID)
		if err != nil {
			response.Validation(w, map[string]string{"location_id": "No active location found."})
			return
		}

		orderDate := time.Now().UTC()
		var dateSeq int
		var referenceNo string
		if err := tx.QueryRow(r.Context(),
			`select date_seq, reference_no from public.allocate_quotation_sequences($1, $2::date)`,
			tu.TenantID, orderDate).Scan(&dateSeq, &referenceNo); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to allocate quotation number.", "ERR_INTERNAL")
			return
		}

		notes := item.Title
		if item.Description != nil && strings.TrimSpace(*item.Description) != "" {
			notes = item.Title + "\n\n" + strings.TrimSpace(*item.Description)
		}

		var quotationID int64
		if err := tx.QueryRow(r.Context(), `
			insert into public.quo_quotations (
			  tenant_id, order_date, date_seq, reference_no,
			  tax_type_id, currency_id, partner_id, pic_user_id,
			  location_id, project_id, progress_status,
			  subtotal, tax_total, grand_total, created_by_user_id, notes
			) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unconfirmed',0,0,0,$11,$12)
			returning id`,
			tu.TenantID, orderDate, dateSeq, referenceNo,
			taxTypeID, currencyID, partnerID, tu.AppUserID,
			locationID, ws.InvProjectID, tu.AppUserID, notes,
		).Scan(&quotationID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create quotation.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			update public.wm_work_items set quotation_id = $3, updated_at = now()
			where id = $1 and tenant_id = $2`,
			workItemID, tu.TenantID, quotationID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to link quotation.", "ERR_INTERNAL")
			return
		}

		if _, err := tx.Exec(r.Context(), `
			insert into public.wm_links (work_item_id, link_type, doc_type, doc_id)
			values ($1, 'quotation', 'quo_quotation', $2)`,
			workItemID, quotationID); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to record link.", "ERR_INTERNAL")
			return
		}

		if err := tx.Commit(r.Context()); err != nil {
			response.Err(w, http.StatusInternalServerError, "Failed to create quotation.", "ERR_INTERNAL")
			return
		}

		result := createQuotationResult{
			QuotationID: quotationID,
			ReferenceNo: referenceNo,
			WorkItemID:  workItemID,
			EditURL:     "/app/quotation/quotations/" + strconv.FormatInt(quotationID, 10),
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "operations.work_item.create_quotation", "wm_work_item", &workItemID, nil, result)
		EmitERPEvent(r.Context(), pool, tu.TenantID, "work_item.quotation_created", map[string]any{
			"work_item_id": workItemID, "quotation_id": quotationID, "reference_no": referenceNo,
			"workspace_id": item.WorkspaceID, "actor_user_id": tu.AppUserID,
		})
		response.OK(w, result, "Quotation created.")
	}
}
