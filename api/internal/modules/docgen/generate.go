package docgen

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

const maxGenerateBatch = 100

type generateBody struct {
	SourceEntity string  `json:"source_entity"`
	TargetEntity string  `json:"target_entity"`
	SourceIDs    []int64 `json:"source_ids"`
	RuleID       *int64  `json:"rule_id,omitempty"`
}

type generateResult struct {
	TargetIDs []int64  `json:"target_ids"`
	Warnings  []string `json:"warnings,omitempty"`
}

func previewGenerate(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body generateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		warnings, err := validateGenerate(r.Context(), pool, tu.TenantID, body)
		if err != nil {
			response.Validation(w, map[string]string{"source_ids": err.Error()})
			return
		}
		response.OK(w, map[string]any{"eligible": len(body.SourceIDs), "warnings": warnings}, "Preview.")
	}
}

func generateDocuments(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		var body generateBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SourceIDs) == 0 {
			response.Validation(w, map[string]string{"source_ids": "At least one source id is required."})
			return
		}
		if len(body.SourceIDs) > maxGenerateBatch {
			response.Validation(w, map[string]string{"source_ids": fmt.Sprintf("Maximum %d sources per batch.", maxGenerateBatch)})
			return
		}
		body.SourceEntity = strings.TrimSpace(body.SourceEntity)
		body.TargetEntity = strings.TrimSpace(body.TargetEntity)
		rule, err := resolveRule(r.Context(), pool, tu.TenantID, body.SourceEntity, body.TargetEntity, body.RuleID)
		if err != nil {
			response.Validation(w, map[string]string{"rule": "No active generation rule found for this source/target pair."})
			return
		}
		warnings, err := validateGenerate(r.Context(), pool, tu.TenantID, body)
		if err != nil {
			response.Validation(w, map[string]string{"source_ids": err.Error()})
			return
		}
		targetIDs, err := executeGenerate(r.Context(), pool, tu, rule, body.SourceIDs)
		if err != nil {
			response.Validation(w, map[string]string{"generate": err.Error()})
			return
		}
		_, _ = pool.Exec(r.Context(), `
			insert into public.doc_generation_log (tenant_id, rule_id, source_entity, target_entity, source_ids, target_id, created_by_user_id)
			values ($1,$2,$3,$4,$5,$6,$7)`,
			tu.TenantID, rule.ID, body.SourceEntity, body.TargetEntity, body.SourceIDs, firstID(targetIDs), tu.AppUserID)
		response.OK(w, generateResult{TargetIDs: targetIDs, Warnings: warnings}, "Generated.")
	}
}

func firstID(ids []int64) *int64 {
	if len(ids) == 0 {
		return nil
	}
	return &ids[0]
}

func validateGenerate(ctx context.Context, pool *pgxpool.Pool, tenantID int64, body generateBody) ([]string, error) {
	var warnings []string
	pair := body.SourceEntity + "->" + body.TargetEntity
	switch pair {
	case "quotation->sales_order", "sales_order->sales", "sales_order->delivery_receipt",
		"purchase_request->purchase_order", "goods_receipt->supplier_invoice", "sales_order->release":
	default:
		return warnings, fmt.Errorf("unsupported generation pair: %s", pair)
	}
	for _, id := range body.SourceIDs {
		if id <= 0 {
			return warnings, fmt.Errorf("invalid source id")
		}
	}
	return warnings, nil
}

func executeGenerate(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, rule Rule, sourceIDs []int64) ([]int64, error) {
	pair := rule.SourceEntity + "->" + rule.TargetEntity
	switch pair {
	case "purchase_request->purchase_order":
		return generatePOFromPR(ctx, pool, tu, sourceIDs)
	case "quotation->sales_order":
		return generateSOFromQuotation(ctx, pool, tu, sourceIDs)
	default:
		return nil, fmt.Errorf("generation for %s is not yet automated; use module create endpoints", pair)
	}
}

func generatePOFromPR(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, prIDs []int64) ([]int64, error) {
	var out []int64
	for _, prID := range prIDs {
		var poID int64
		err := pool.QueryRow(ctx, `
			select po.id from public.po_purchase_orders po
			where po.tenant_id = $1 and po.purchase_request_id = $2 and po.deleted_at is null
			order by po.id desc limit 1`, tu.TenantID, prID).Scan(&poID)
		if err == nil {
			out = append(out, poID)
			continue
		}
		return out, fmt.Errorf("create PO from PR %d via purchase order module (from-purchase-request endpoint)", prID)
	}
	return out, nil
}

func generateSOFromQuotation(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, quoIDs []int64) ([]int64, error) {
	var out []int64
	for _, qid := range quoIDs {
		var soID int64
		err := pool.QueryRow(ctx, `
			select id from public.so_sales_orders
			where tenant_id = $1 and source_quotation_id = $2 and deleted_at is null
			order by id desc limit 1`, tu.TenantID, qid).Scan(&soID)
		if err == nil {
			out = append(out, soID)
			continue
		}
		return out, fmt.Errorf("create SO from quotation %d via sales order module", qid)
	}
	return out, nil
}
