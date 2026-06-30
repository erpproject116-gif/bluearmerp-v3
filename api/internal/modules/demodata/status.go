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
	}

	for _, c := range checks {
		var ok bool
		if err := pool.QueryRow(ctx, c.q, tenantID).Scan(&ok); err == nil {
			payload.Checks[c.key] = ok
		}
	}

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
