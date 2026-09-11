package manufacturing

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/response"
)

type dashboardKPI struct {
	TotalProductionToday float64 `json:"total_production_today"`
	InProgressOrders     int64   `json:"in_progress_orders"`
	CompletedToday       int64   `json:"completed_today"`
	MaterialShortageItems int64  `json:"material_shortage_items"`
}

type dashboardRecentOrder struct {
	ID               int64   `json:"id"`
	WorkOrderNo      string  `json:"work_order_no"`
	BomType          string  `json:"bom_type"`
	ProductLabel     string  `json:"product_label"`
	QtyToProduce     float64 `json:"qty_to_produce"`
	QtyProduced      float64 `json:"qty_produced"`
	Status           string  `json:"status"`
	OrderDate        string  `json:"order_date"`
	FinishedUnitCode string  `json:"finished_unit_code,omitempty"`
}

type dashboardShortage struct {
	ComponentItemID int64   `json:"component_item_id"`
	ComponentCode   string  `json:"component_code"`
	ComponentName   string  `json:"component_name"`
	RequiredQty     float64 `json:"required_qty"`
	AvailableQty    float64 `json:"available_qty"`
	ShortageQty     float64 `json:"shortage_qty"`
	WorkOrderID     int64   `json:"work_order_id"`
	WorkOrderNo     string  `json:"work_order_no"`
}

type dashboardActivity struct {
	At      string `json:"at"`
	Action  string `json:"action"`
	Summary string `json:"summary"`
	RefID   int64  `json:"ref_id,omitempty"`
}

type manufacturingDashboard struct {
	KPI             dashboardKPI             `json:"kpi"`
	RecentOrders    []dashboardRecentOrder   `json:"recent_orders"`
	Shortages       []dashboardShortage      `json:"shortages"`
	RecentActivity  []dashboardActivity      `json:"recent_activity"`
	GeneratedAt     string                   `json:"generated_at"`
}

func getManufacturingDashboard(pool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tu, _ := auth.FromContext(r.Context())
		ctx := r.Context()
		out := manufacturingDashboard{
			RecentOrders:   []dashboardRecentOrder{},
			Shortages:      []dashboardShortage{},
			RecentActivity: []dashboardActivity{},
			GeneratedAt:    time.Now().UTC().Format(time.RFC3339),
		}

		_ = pool.QueryRow(ctx, `
			select coalesce(sum(qty_produced), 0)::float8
			from public.mfg_work_orders
			where tenant_id = $1 and status = 'completed'
			  and completed_at::date = (now() at time zone 'utc')::date`,
			tu.TenantID).Scan(&out.KPI.TotalProductionToday)

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint from public.mfg_work_orders
			where tenant_id = $1 and status = 'released'`,
			tu.TenantID).Scan(&out.KPI.InProgressOrders)

		_ = pool.QueryRow(ctx, `
			select count(*)::bigint from public.mfg_work_orders
			where tenant_id = $1 and status = 'completed'
			  and completed_at::date = (now() at time zone 'utc')::date`,
			tu.TenantID).Scan(&out.KPI.CompletedToday)

		rows, err := pool.Query(ctx, `
			select wo.id, wo.work_order_no, coalesce(b.bom_type, 'assembly'),
			  coalesce(nullif(trim(fi.item_name), ''), b.bom_name, wo.work_order_no),
			  wo.qty_to_produce::float8, wo.qty_produced::float8, wo.status,
			  wo.order_date::text,
			  coalesce(bu.code, coalesce(nullif(trim(fi.unit), ''), 'ea'))
			from public.mfg_work_orders wo
			join public.mfg_boms b on b.id = wo.bom_id
			left join public.inv_items fi on fi.id = wo.finished_item_id
			left join public.inv_units bu on bu.id = fi.base_unit_id
			where wo.tenant_id = $1
			order by coalesce(wo.completed_at, wo.released_at, wo.created_at) desc
			limit 8`, tu.TenantID)
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var o dashboardRecentOrder
				if err := rows.Scan(&o.ID, &o.WorkOrderNo, &o.BomType, &o.ProductLabel,
					&o.QtyToProduce, &o.QtyProduced, &o.Status, &o.OrderDate, &o.FinishedUnitCode); err == nil {
					out.RecentOrders = append(out.RecentOrders, o)
				}
			}
		}

		out.Shortages = collectDashboardShortages(ctx, pool, tu.TenantID, 12)
		seen := map[int64]struct{}{}
		for _, s := range out.Shortages {
			seen[s.ComponentItemID] = struct{}{}
		}
		out.KPI.MaterialShortageItems = int64(len(seen))

		actRows, err := pool.Query(ctx, `
			select coalesce(created_at::text, ''), coalesce(action_code, ''),
			  coalesce(target_type, '') || ' #' || coalesce(target_id::text, ''),
			  coalesce(target_id, 0)
			from public.audit_logs
			where tenant_id = $1
			  and (action_code ilike 'manufacturing.%' or target_type = 'mfg_work_order')
			order by created_at desc
			limit 10`, tu.TenantID)
		if err == nil {
			defer actRows.Close()
			for actRows.Next() {
				var a dashboardActivity
				if err := actRows.Scan(&a.At, &a.Action, &a.Summary, &a.RefID); err == nil {
					out.RecentActivity = append(out.RecentActivity, a)
				}
			}
		}
		// Fallback activity from WO timestamps when audit empty.
		if len(out.RecentActivity) == 0 {
			for _, o := range out.RecentOrders {
				out.RecentActivity = append(out.RecentActivity, dashboardActivity{
					At:      o.OrderDate,
					Action:  "manufacturing.work_order",
					Summary: o.WorkOrderNo + " · " + o.Status,
					RefID:   o.ID,
				})
			}
		}

		response.OK(w, out, "OK")
	}
}

func collectDashboardShortages(ctx context.Context, pool *pgxpool.Pool, tenantID int64, limit int) []dashboardShortage {
	out := []dashboardShortage{}
	if limit <= 0 {
		return out
	}
	rows, err := pool.Query(ctx, `
		select wo.id, wo.work_order_no
		from public.mfg_work_orders wo
		where wo.tenant_id = $1 and wo.status in ('draft', 'released')
		order by wo.updated_at desc nulls last, wo.id desc
		limit 25`, tenantID)
	if err != nil {
		return out
	}
	defer rows.Close()

	type woRef struct {
		id  int64
		no  string
	}
	var refs []woRef
	for rows.Next() {
		var r woRef
		if err := rows.Scan(&r.id, &r.no); err == nil {
			refs = append(refs, r)
		}
	}

	for _, ref := range refs {
		if len(out) >= limit {
			break
		}
		wo, err := loadWorkOrder(ctx, pool, tenantID, ref.id)
		if err != nil {
			continue
		}
		bom, err := loadBom(ctx, pool, tenantID, wo.BomID)
		if err != nil {
			continue
		}
		needs, err := buildMaterialNeeds(ctx, pool, tenantID, wo, bom)
		if err != nil {
			continue
		}
		lines := needs.Lines
		if needs.InputLine != nil {
			lines = append([]MaterialNeedLine{*needs.InputLine}, lines...)
		}
		for _, ln := range lines {
			if ln.Shortage <= 0.0001 {
				continue
			}
			out = append(out, dashboardShortage{
				ComponentItemID: ln.ComponentItemID,
				ComponentCode:   ln.ComponentCode,
				ComponentName:   ln.ComponentName,
				RequiredQty:     ln.StockToIssue,
				AvailableQty:    ln.QtyOnHand,
				ShortageQty:     ln.Shortage,
				WorkOrderID:     ref.id,
				WorkOrderNo:     ref.no,
			})
			if len(out) >= limit {
				break
			}
		}
	}
	return out
}
