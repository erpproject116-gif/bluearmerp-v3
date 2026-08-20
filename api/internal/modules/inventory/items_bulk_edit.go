package inventory

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type bulkItemEditBody struct {
	IDs           []int64  `json:"ids"`
	ItemName      *string  `json:"item_name"`
	SpecName      *string  `json:"spec_name"`
	PurchasePrice *float64 `json:"purchase_price"`
	SalesPrice    *float64 `json:"sales_price"`
	VipPrice      *float64 `json:"vip_price"`
}

type bulkItemEditOutcome struct {
	Updated int `json:"updated"`
	Skipped int `json:"skipped"`
}

func bulkEditItems(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		if !tu.HasPermission("inventory.items_bulk_edit", auth.AccessWrite) {
			response.Err(w, http.StatusForbidden, "You do not have permission to bulk edit items.", "ERR_FORBIDDEN")
			return
		}
		var body bulkItemEditBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.IDs) == 0 {
			response.Validation(w, map[string]string{"ids": "At least one id is required."})
			return
		}
		if len(body.IDs) > 500 {
			response.Validation(w, map[string]string{"ids": "At most 500 ids per request."})
			return
		}
		hasPatch := body.ItemName != nil || body.SpecName != nil ||
			body.PurchasePrice != nil || body.SalesPrice != nil || body.VipPrice != nil
		if !hasPatch {
			response.Validation(w, map[string]string{"body": "Provide at least one field to update."})
			return
		}
		if body.ItemName != nil && strings.TrimSpace(*body.ItemName) == "" {
			response.Validation(w, map[string]string{"item_name": "Item name cannot be empty."})
			return
		}

		setClauses := []string{"updated_at = now()"}
		args := []any{tu.TenantID}
		argN := 2
		if body.ItemName != nil {
			setClauses = append(setClauses, fmt.Sprintf("item_name = $%d", argN))
			args = append(args, strings.TrimSpace(*body.ItemName))
			argN++
		}
		if body.SpecName != nil {
			setClauses = append(setClauses, fmt.Sprintf("spec_name = $%d", argN))
			args = append(args, strings.TrimSpace(*body.SpecName))
			argN++
		}
		if body.PurchasePrice != nil {
			setClauses = append(setClauses, fmt.Sprintf("purchase_price = $%d", argN))
			args = append(args, *body.PurchasePrice)
			argN++
		}
		if body.SalesPrice != nil {
			setClauses = append(setClauses, fmt.Sprintf("sales_price = $%d", argN))
			args = append(args, *body.SalesPrice)
			argN++
		}
		if body.VipPrice != nil {
			setClauses = append(setClauses, fmt.Sprintf("vip_price = $%d", argN))
			args = append(args, *body.VipPrice)
			argN++
		}

		out := bulkItemEditOutcome{}
		for _, id := range body.IDs {
			if id <= 0 {
				out.Skipped++
				continue
			}
			qArgs := append(append([]any{}, args...), id)
			tag, err := pool.Exec(r.Context(),
				fmt.Sprintf(`update public.inv_items set %s where tenant_id = $1 and id = $%d and deleted_at is null`,
					strings.Join(setClauses, ", "), argN),
				qArgs...)
			if err != nil || tag.RowsAffected() == 0 {
				out.Skipped++
				continue
			}
			out.Updated++
		}
		_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "inventory.items.bulk_edit", "inv_item", nil, nil, body)
		response.OK(w, out, "OK")
	}
}
