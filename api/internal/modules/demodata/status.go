package demodata

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

type StatusPayload struct {
	Eligible         bool              `json:"eligible"`
	CompanyCode      string            `json:"company_code"`
	IsDemoTenant     bool              `json:"is_demo_tenant"`
	CanManage        bool              `json:"can_manage"`
	ScriptsAvailable bool              `json:"scripts_available"`
	Checks           map[string]bool   `json:"checks"`
	Counts           map[string]int    `json:"counts"`
}

func loadStatus(ctx context.Context, pool *pgxpool.Pool, tenantID int64, canManage bool) (StatusPayload, error) {
	var companyCode string
	err := pool.QueryRow(ctx, `select company_code from public.tenants where id = $1`, tenantID).Scan(&companyCode)
	if err != nil {
		return StatusPayload{}, err
	}

	_, isDemo := DemoTenantCodes[companyCode]
	scriptsOK := true
	if _, err := readSQL(purgeScript); err != nil {
		scriptsOK = false
	}

	payload := StatusPayload{
		Eligible:         isDemo && canManage,
		CompanyCode:      companyCode,
		IsDemoTenant:     isDemo,
		CanManage:        canManage,
		ScriptsAvailable: scriptsOK,
		Checks:           map[string]bool{},
		Counts:           map[string]int{},
	}

	if !isDemo {
		return payload, nil
	}

	type check struct {
		key string
		q   string
	}
	checks := []check{
		{"golden_s2_pr", `select exists(
			select 1 from public.pr_purchase_requests
			where tenant_id = $1 and purchase_request_no = 'DEMO-S2-PR')`},
		{"golden_s9_dr", `select exists(
			select 1 from public.dr_delivery_receipts
			where tenant_id = $1 and delivery_no = 'DEMO-S9-DR')`},
		{"golden_s8_ap", `select exists(
			select 1 from public.fin_supplier_invoices
			where tenant_id = $1 and invoice_no = 'DEMO-S8-AP' and deleted_at is null)`},
		{"open_po_demogr902", `select exists(
			select 1 from public.po_purchase_orders
			where tenant_id = $1 and purchase_order_no = 'DEMOGR902')`},
		{"golden_s11_standalone_po", `select exists(
			select 1 from public.po_purchase_orders
			where tenant_id = $1 and purchase_order_no = 'DEMO-S11-PO' and purchase_request_id is null)`},
	}

	for _, c := range checks {
		var ok bool
		if err := pool.QueryRow(ctx, c.q, tenantID).Scan(&ok); err == nil {
			payload.Checks[c.key] = ok
		}
	}

	payload.Checks["reconciliation_clean"] = reconciliationGapCount(ctx, pool, tenantID) == 0

	countQueries := map[string]string{
		"quotations":       `select count(*)::int from public.quo_quotations where tenant_id = $1 and deleted_at is null`,
		"purchase_requests": `select count(*)::int from public.pr_purchase_requests where tenant_id = $1 and deleted_at is null`,
		"sales_orders":     `select count(*)::int from public.so_sales_orders where tenant_id = $1 and deleted_at is null`,
		"sales_invoices":   `select count(*)::int from public.sa_sales where tenant_id = $1 and deleted_at is null`,
		"delivery_receipts": `select count(*)::int from public.dr_delivery_receipts where tenant_id = $1 and deleted_at is null`,
	}

	for key, q := range countQueries {
		var n int
		if err := pool.QueryRow(ctx, q, tenantID).Scan(&n); err == nil {
			payload.Counts[key] = n
		}
	}

	return payload, nil
}

func reconciliationGapCount(ctx context.Context, pool *pgxpool.Pool, tenantID int64) int {
	var n int
	_ = pool.QueryRow(ctx, `
		select (
		  (select count(*) from (
		    select ln.id from public.sa_sales_lines ln
		    join public.sa_sales s on s.id = ln.sales_id
		    join public.inv_items i on i.id = ln.item_id
		    left join (select sales_line_id, count(*)::float8 as serial_cnt from public.inv_serial_unit_sales_lines group by sales_line_id) j on j.sales_line_id = ln.id
		    where s.tenant_id = $1 and s.deleted_at is null and i.track_serial = true and ln.qty > 0 and coalesce(j.serial_cnt, 0) <> ln.qty
		    union
		    select rl.id from public.so_sales_order_release_lines rl
		    join public.so_sales_order_lines ln on ln.id = rl.sales_order_line_id
		    join public.so_sales_orders so on so.id = ln.sales_order_id
		    join public.inv_items i on i.id = ln.item_id
		    left join (select sales_order_release_line_id, count(*)::float8 as serial_cnt from public.inv_serial_units where sales_order_release_line_id is not null group by sales_order_release_line_id) su on su.sales_order_release_line_id = rl.id
		    where so.tenant_id = $1 and so.deleted_at is null and i.track_serial = true and rl.release_qty > 0 and coalesce(su.serial_cnt, 0) <> rl.release_qty
		  ) x)
		  + (select count(distinct ln.id) from public.so_sales_order_lines ln
		    join public.so_sales_orders so on so.id = ln.sales_order_id
		    left join (select sales_order_line_id, sum(qty) as delivered from public.so_sales_order_slip_lines where slip_type = 'delivery_receipt' group by sales_order_line_id) dr on dr.sales_order_line_id = ln.id
		    left join (select sales_order_line_id, sum(qty) as sold from public.so_sales_order_slip_lines where slip_type = 'sales' group by sales_order_line_id) slip on slip.sales_order_line_id = ln.id
		    where so.tenant_id = $1 and so.deleted_at is null and coalesce(dr.delivered, 0) > 0.0001 and (coalesce(dr.delivered, 0) - coalesce(slip.sold, 0)) > 0.0001)
		  + (select count(*) from public.gr_goods_receipt_lines grl
		    join public.gr_goods_receipts gr on gr.id = grl.goods_receipt_id
		    left join (select goods_receipt_line_id, sum(qty) as billed from public.gr_goods_receipt_slip_lines where slip_type = 'supplier_invoice' group by goods_receipt_line_id) sl on sl.goods_receipt_line_id = grl.id
		    where gr.tenant_id = $1 and gr.status = 'posted' and (grl.received_qty - coalesce(sl.billed, 0)) > 0.0001)
		)::int`, tenantID).Scan(&n)
	return n
}

func tenantCompanyCode(ctx context.Context, pool *pgxpool.Pool, tenantID int64) (string, error) {
	var code string
	err := pool.QueryRow(ctx, `select company_code from public.tenants where id = $1`, tenantID).Scan(&code)
	return code, err
}

func assertDemoTenant(ctx context.Context, pool *pgxpool.Pool, tenantID int64, isSuperadmin bool) (string, error) {
	code, err := tenantCompanyCode(ctx, pool, tenantID)
	if err != nil {
		return "", err
	}
	if !isSuperadmin {
		if _, ok := DemoTenantCodes[code]; !ok {
			return code, errNotDemoTenant
		}
	}
	return code, nil
}
