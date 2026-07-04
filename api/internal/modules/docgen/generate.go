package docgen

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/deliveryreceipt"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/finance"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/purchaseorder"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/purchaserequest"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/sales"
	"github.com/bluearm/bluearm-erp-v3/api/internal/modules/salesorder"
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
		"sales_order->purchase_request",
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
	case "sales_order->sales":
		return generateSalesFromSO(ctx, pool, tu, sourceIDs)
	case "sales_order->delivery_receipt":
		return generateDRFromSO(ctx, pool, tu, sourceIDs)
	case "sales_order->purchase_request":
		return generatePRFromSO(ctx, pool, tu, sourceIDs)
	case "goods_receipt->supplier_invoice":
		return generateSupplierInvoiceFromGR(ctx, pool, tu, sourceIDs)
	default:
		return nil, fmt.Errorf("generation for %s is not yet automated; use module create endpoints", pair)
	}
}

func generatePOFromPR(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, prIDs []int64) ([]int64, error) {
	var out []int64
	for _, prID := range prIDs {
		poID, err := purchaseorder.CreateFromPurchaseRequest(ctx, pool, tu, prID, purchaseorder.CreateFromPROptions{})
		if err != nil {
			return out, fmt.Errorf("PR %d: %w", prID, err)
		}
		out = append(out, poID)
	}
	return out, nil
}

func generateSOFromQuotation(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, quoIDs []int64) ([]int64, error) {
	var out []int64
	for _, qid := range quoIDs {
		soID, err := salesorder.CreateFromQuotation(ctx, pool, tu, qid)
		if err != nil {
			return out, fmt.Errorf("quotation %d: %w", qid, err)
		}
		out = append(out, soID)
	}
	return out, nil
}

func generateSalesFromSO(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soIDs []int64) ([]int64, error) {
	var out []int64
	for _, soID := range soIDs {
		saleID, err := sales.CreateFromSalesOrder(ctx, pool, tu, soID)
		if err != nil {
			return out, fmt.Errorf("sales order %d: %w", soID, err)
		}
		out = append(out, saleID)
	}
	return out, nil
}

func generateDRFromSO(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soIDs []int64) ([]int64, error) {
	var out []int64
	for _, soID := range soIDs {
		drID, err := deliveryreceipt.CreateFromSalesOrder(ctx, pool, tu, soID)
		if err != nil {
			return out, fmt.Errorf("sales order %d: %w", soID, err)
		}
		out = append(out, drID)
	}
	return out, nil
}

func generatePRFromSO(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, soIDs []int64) ([]int64, error) {
	var out []int64
	for _, soID := range soIDs {
		prID, err := purchaserequest.CreateFromSalesOrder(ctx, pool, tu, soID)
		if err != nil {
			return out, fmt.Errorf("sales order %d: %w", soID, err)
		}
		out = append(out, prID)
	}
	return out, nil
}

func generateSupplierInvoiceFromGR(ctx context.Context, pool *pgxpool.Pool, tu auth.TenantUser, grIDs []int64) ([]int64, error) {
	var out []int64
	for _, grID := range grIDs {
		invID, err := finance.CreateSupplierInvoiceFromGoodsReceipt(ctx, pool, tu, grID)
		if err != nil {
			return out, fmt.Errorf("goods receipt %d: %w", grID, err)
		}
		out = append(out, invID)
	}
	return out, nil
}
