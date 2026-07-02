package sales

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/audit"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type linkSalesBody struct {
	SalesIDs []int64 `json:"sales_ids"`
}

func registerCollectiveInvoiceLinkRoutes(r chi.Router, pool *pgxpool.Pool) {
	r.Post("/collective-invoices/{id}/link-sales", linkCollectiveInvoiceSales(pool))
	r.Post("/collective-invoices/{id}/unlink-sales", unlinkCollectiveInvoiceSales(pool))
}

func linkCollectiveInvoiceSales(pool *pgxpool.Pool) http.HandlerFunc {
	return mutateCollectiveInvoiceSales(pool, true)
}

func unlinkCollectiveInvoiceSales(pool *pgxpool.Pool) http.HandlerFunc {
	return mutateCollectiveInvoiceSales(pool, false)
}

func mutateCollectiveInvoiceSales(pool *pgxpool.Pool, link bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
		if err != nil {
			response.Validation(w, map[string]string{"id": "Invalid id."})
			return
		}
		var body linkSalesBody
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			response.Validation(w, map[string]string{"body": "Invalid JSON."})
			return
		}
		if len(body.SalesIDs) == 0 {
			response.Validation(w, map[string]string{"sales_ids": "At least one sale is required."})
			return
		}

		var status string
		err = pool.QueryRow(r.Context(), `
			select status from public.sa_collective_invoices where id = $1 and tenant_id = $2`,
			id, tu.TenantID).Scan(&status)
		if err != nil {
			response.Err(w, http.StatusNotFound, "Not found.", "ERR_NOT_FOUND")
			return
		}
		if status == "confirmed" || status == "cancelled" {
			response.Validation(w, map[string]string{"status": "Cannot modify sales on confirmed or cancelled invoices."})
			return
		}

		if link {
			sales, err := fetchEligibleSales(r.Context(), pool, tu.TenantID, body.SalesIDs)
			if err != nil || len(sales) != len(body.SalesIDs) {
				response.Validation(w, map[string]string{"sales_ids": "One or more sales are not eligible."})
				return
			}
			var headerPartner int64
			_ = pool.QueryRow(r.Context(), `
				select partner_id from public.sa_collective_invoices where id = $1`, id).Scan(&headerPartner)
			partnerID, err := validateSamePartner(sales)
			if err != nil {
				response.Validation(w, map[string]string{"sales_ids": err.Error()})
				return
			}
			if headerPartner > 0 && partnerID != headerPartner {
				response.Validation(w, map[string]string{"sales_ids": "Sales customer must match invoice customer."})
				return
			}
			var maxSort int
			_ = pool.QueryRow(r.Context(), `
				select coalesce(max(sort_order), 0) from public.sa_collective_invoice_sales where collective_invoice_id = $1`, id).Scan(&maxSort)
			for i, s := range sales {
				if _, err := pool.Exec(r.Context(), `
					insert into public.sa_collective_invoice_sales (collective_invoice_id, sales_id, sort_order)
					values ($1, $2, $3)
					on conflict do nothing`, id, s.ID, maxSort+i+1); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to link sale.", "ERR_INTERNAL")
					return
				}
			}
			_, _ = pool.Exec(r.Context(), `
				update public.sa_collective_invoices ci set
				  subtotal = sub.sum_sub, tax_total = sub.sum_tax, grand_total = sub.sum_grand, updated_at = now()
				from (
				  select coalesce(sum(s.subtotal), 0)::float8 as sum_sub,
				    coalesce(sum(s.tax_total), 0)::float8 as sum_tax,
				    coalesce(sum(s.grand_total), 0)::float8 as sum_grand
				  from public.sa_collective_invoice_sales cis
				  join public.sa_sales s on s.id = cis.sales_id
				  where cis.collective_invoice_id = $1
				) sub where ci.id = $1 and ci.tenant_id = $2`, id, tu.TenantID)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.collective_invoice.link", "sa_collective_invoice", &id, nil, body)
		} else {
			for _, sid := range body.SalesIDs {
				if _, err := pool.Exec(r.Context(), `
					delete from public.sa_collective_invoice_sales
					where collective_invoice_id = $1 and sales_id = $2`, id, sid); err != nil {
					response.Err(w, http.StatusInternalServerError, "Failed to unlink sale.", "ERR_INTERNAL")
					return
				}
			}
			_, _ = pool.Exec(r.Context(), `
				update public.sa_collective_invoices ci set
				  subtotal = sub.sum_sub, tax_total = sub.sum_tax, grand_total = sub.sum_grand, updated_at = now()
				from (
				  select coalesce(sum(s.subtotal), 0)::float8 as sum_sub,
				    coalesce(sum(s.tax_total), 0)::float8 as sum_tax,
				    coalesce(sum(s.grand_total), 0)::float8 as sum_grand
				  from public.sa_collective_invoice_sales cis
				  join public.sa_sales s on s.id = cis.sales_id
				  where cis.collective_invoice_id = $1
				) sub where ci.id = $1 and ci.tenant_id = $2`, id, tu.TenantID)
			_ = audit.Log(r.Context(), pool, tu.TenantID, tu.AppUserID, "sales.collective_invoice.unlink", "sa_collective_invoice", &id, nil, body)
		}

		row, _ := loadCollectiveInvoice(r.Context(), pool, tu.TenantID, id)
		action := "Linked"
		if !link {
			action = "Unlinked"
		}
		response.OK(w, row, action+".")
	}
}

func exportFormat(r *http.Request) string {
	return strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
}
