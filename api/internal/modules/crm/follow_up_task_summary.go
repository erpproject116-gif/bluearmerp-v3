package crm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type FollowUpTaskSummary struct {
	OpenCount    int     `json:"open_count"`
	LatestTaskID *int64  `json:"latest_task_id,omitempty"`
	LatestTitle  string  `json:"latest_title,omitempty"`
	LatestNotes  *string `json:"latest_notes,omitempty"`
	LatestStage  string  `json:"latest_stage,omitempty"`
}

type followUpSummariesBody struct {
	QuotationIDs       []int64 `json:"quotation_ids"`
	SalesIDs           []int64 `json:"sales_ids"`
	WarrantyAssetIDs   []int64 `json:"warranty_asset_ids"`
	PurchaseRequestIDs []int64 `json:"purchase_request_ids"`
}

type followUpSummariesResponse struct {
	ByQuotation       map[string]FollowUpTaskSummary `json:"by_quotation"`
	BySales           map[string]FollowUpTaskSummary `json:"by_sales"`
	ByWarranty        map[string]FollowUpTaskSummary `json:"by_warranty"`
	ByPurchaseRequest map[string]FollowUpTaskSummary `json:"by_purchase_request"`
}

func batchFollowUpTaskSummaries(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body followUpSummariesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		out := followUpSummariesResponse{
			ByQuotation:       map[string]FollowUpTaskSummary{},
			BySales:           map[string]FollowUpTaskSummary{},
			ByWarranty:        map[string]FollowUpTaskSummary{},
			ByPurchaseRequest: map[string]FollowUpTaskSummary{},
		}
		var err error
		if len(body.QuotationIDs) > 0 {
			out.ByQuotation, err = loadSummariesForColumn(r.Context(), pool, tu, "quotation_id", body.QuotationIDs)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load task summaries.", "ERR_INTERNAL")
				return
			}
		}
		if len(body.SalesIDs) > 0 {
			out.BySales, err = loadSummariesForColumn(r.Context(), pool, tu, "sales_id", body.SalesIDs)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load task summaries.", "ERR_INTERNAL")
				return
			}
		}
		if len(body.WarrantyAssetIDs) > 0 {
			out.ByWarranty, err = loadSummariesForColumn(r.Context(), pool, tu, "warranty_asset_id", body.WarrantyAssetIDs)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load task summaries.", "ERR_INTERNAL")
				return
			}
		}
		if len(body.PurchaseRequestIDs) > 0 {
			out.ByPurchaseRequest, err = loadSummariesForColumn(r.Context(), pool, tu, "purchase_request_id", body.PurchaseRequestIDs)
			if err != nil {
				response.Err(w, http.StatusInternalServerError, "Failed to load task summaries.", "ERR_INTERNAL")
				return
			}
		}
		response.OK(w, out, "OK")
	}
}

func loadSummariesForColumn(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, column string, ids []int64) (map[string]FollowUpTaskSummary, error) {
	if len(ids) == 0 {
		return map[string]FollowUpTaskSummary{}, nil
	}
	switch column {
	case "quotation_id", "sales_id", "warranty_asset_id", "purchase_request_id":
	default:
		return nil, fmt.Errorf("invalid column %q", column)
	}
	args := []any{tu.TenantID, ids}
	argN := 3
	scope, argN := tu.PicOrCreatedScopeSQL("t", argN, &args)
	q := fmt.Sprintf(`
		select
		  t.%s::text as entity_key,
		  count(*) filter (where t.stage not in ('completed', 'cancelled', 'closed'))::int as open_count,
		  (array_agg(t.id order by t.updated_at desc))[1] as latest_id,
		  coalesce((array_agg(t.title order by t.updated_at desc))[1], '') as latest_title,
		  (array_agg(t.notes order by t.updated_at desc))[1] as latest_notes,
		  coalesce((array_agg(t.stage order by t.updated_at desc))[1], '') as latest_stage
		from public.crm_follow_up_tasks t
		where t.tenant_id = $1 and t.%s = any($2::bigint[])%s
		group by t.%s`, column, column, scope, column)
	_ = argN
	rows, err := pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]FollowUpTaskSummary{}
	for rows.Next() {
		var key string
		var s FollowUpTaskSummary
		var latestID *int64
		if err := rows.Scan(&key, &s.OpenCount, &latestID, &s.LatestTitle, &s.LatestNotes, &s.LatestStage); err != nil {
			return nil, err
		}
		s.LatestTaskID = latestID
		out[key] = s
	}
	return out, nil
}

func isTerminalTaskStage(stage string) bool {
	switch stage {
	case "completed", "cancelled", "closed":
		return true
	default:
		return false
	}
}

func findOpenLinkedTask(ctx context.Context, pool *pgxpool.Pool, tenantID int64, quotationID, salesID, warrantyAssetID, purchaseRequestID *int64) (*int64, error) {
	var id int64
	var err error
	switch {
	case quotationID != nil && *quotationID > 0:
		err = pool.QueryRow(ctx, `
			select id from public.crm_follow_up_tasks
			where tenant_id = $1 and quotation_id = $2
			  and stage not in ('completed', 'cancelled', 'closed')
			limit 1`, tenantID, *quotationID).Scan(&id)
	case salesID != nil && *salesID > 0:
		err = pool.QueryRow(ctx, `
			select id from public.crm_follow_up_tasks
			where tenant_id = $1 and sales_id = $2
			  and stage not in ('completed', 'cancelled', 'closed')
			limit 1`, tenantID, *salesID).Scan(&id)
	case warrantyAssetID != nil && *warrantyAssetID > 0:
		err = pool.QueryRow(ctx, `
			select id from public.crm_follow_up_tasks
			where tenant_id = $1 and warranty_asset_id = $2
			  and stage not in ('completed', 'cancelled', 'closed')
			limit 1`, tenantID, *warrantyAssetID).Scan(&id)
	case purchaseRequestID != nil && *purchaseRequestID > 0:
		err = pool.QueryRow(ctx, `
			select id from public.crm_follow_up_tasks
			where tenant_id = $1 and purchase_request_id = $2
			  and stage not in ('completed', 'cancelled', 'closed')
			limit 1`, tenantID, *purchaseRequestID).Scan(&id)
	default:
		return nil, nil
	}
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &id, nil
}

func conflictWithExistingTask(ctx context.Context, w http.ResponseWriter, pool *pgxpool.Pool, taskID int64) {
	row, err := scanFollowUpTask(pool.QueryRow(ctx, followUpTaskByIDQuery(), taskID))
	if err != nil {
		response.Err(w, http.StatusConflict, "An open task already exists for this record.", "ERR_CONFLICT")
		return
	}
	response.JSON(w, http.StatusConflict, response.Envelope{
		Success: false,
		Message: "An open task already exists for this record.",
		Code:    "ERR_CONFLICT",
		Data:    row,
	})
}
