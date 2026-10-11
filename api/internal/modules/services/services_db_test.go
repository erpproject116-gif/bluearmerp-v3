package services

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/bluearm/bluearm-erp-v3/api/internal/platform/auth"
)

// TestServicesDatabaseProof runs the contract's negative cases against Postgres.
// Set BLUEARM_SVC_TEST_DSN to a database that already has the application
// migrations, including 319_services_module.sql.
func TestServicesDatabaseProof(t *testing.T) {
	dsn := os.Getenv("BLUEARM_SVC_TEST_DSN")
	if dsn == "" {
		t.Skip("BLUEARM_SVC_TEST_DSN is not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	if _, err := pool.Exec(ctx, `delete from public.tenants where company_code like 'ZSVC%'`); err != nil {
		t.Fatal(err)
	}
	var enabled int
	if err := pool.QueryRow(ctx, `
		select count(*) from public.tenant_modules
		where module_code = 'services' and is_enabled`).Scan(&enabled); err != nil {
		t.Fatal(err)
	}
	if enabled != 0 {
		t.Fatalf("services is enabled for %d tenant(s); migration 319 must not turn the module on", enabled)
	}

	var tenantA, tenantB, userA, userB, loc1, loc2, partner, tax, currency, salesOrder int64
	err = pool.QueryRow(ctx, `
		insert into public.tenants (company_name, company_code) values ('Svc A', 'ZSVCA') returning id`).Scan(&tenantA)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.tenants (company_name, company_code) values ('Svc B', 'ZSVCB') returning id`).Scan(&tenantB)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into public.tenant_roles (tenant_id, role_code, role_name)
		values ($1, 'member', 'Member'), ($2, 'member', 'Member')`, tenantA, tenantB); err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.users (tenant_id, email, full_name) values ($1, 'a@zsvc.test', 'Owner A') returning id`, tenantA).Scan(&userA)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.users (tenant_id, email, full_name) values ($1, 'b@zsvc.test', 'Owner B') returning id`, tenantB).Scan(&userB)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process)
		values ($1, 'LOC01', 'Origin', 'location', 'service') returning id`, tenantA).Scan(&loc1)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.inv_locations (tenant_id, location_code, location_name, location_type, production_process)
		values ($1, 'LOC02', 'Destination', 'location', 'service') returning id`, tenantA).Scan(&loc2)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.inv_partners (tenant_id, partner_code, partner_kind, company_name)
		values ($1, 'CUST1', 'customer', 'Customer One') returning id`, tenantA).Scan(&partner)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.quo_tax_types (tenant_id, tax_code, name) values ($1, 'VAT00', 'VAT') returning id`, tenantA).Scan(&tax)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.quo_currencies (tenant_id, currency_code, name) values ($1, 'PHP', 'Peso') returning id`, tenantA).Scan(&currency)
	if err != nil {
		t.Fatal(err)
	}
	err = pool.QueryRow(ctx, `
		insert into public.so_sales_orders (
		  tenant_id, order_date, date_seq, sales_order_no, tax_type_id, currency_id, partner_id, location_id
		) values ($1, current_date, 1, 'SO-ZSVC-1', $2, $3, $4, $5) returning id`,
		tenantA, tax, currency, partner, loc1).Scan(&salesOrder)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into public.tenant_modules (tenant_id, module_code, is_enabled)
		values ($1, 'services', true)`, tenantA); err != nil {
		t.Fatal(err)
	}
	if err := ensureFoundation(ctx, pool, tenantA); err != nil {
		t.Fatal(err)
	}
	var typeID int64
	if err := pool.QueryRow(ctx, `
		select id from public.svc_service_types where tenant_id = $1 and code = 'consulting'`, tenantA).Scan(&typeID); err != nil {
		t.Fatal(err)
	}

	owner := auth.TenantUser{AppUserID: userA, TenantID: tenantA, IsTenantOwner: true}
	other := auth.TenantUser{AppUserID: userB, TenantID: tenantB, IsTenantOwner: true}
	clerk := auth.TenantUser{
		AppUserID: userA, TenantID: tenantA, TenantRole: "staff",
		StrictBranchIsolation: true, HomeLocationID: loc1,
	}

	reached := false
	disabled := requireEnabled(pool)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Fatal("disabled module called the handler")
	}))
	code, body := invoke(t, other, disabled, http.MethodGet, "/api/v1/services/jobs", "", nil)
	if code != http.StatusForbidden || body.Code != "ERR_MODULE_DISABLED" {
		t.Fatalf("disabled module: status=%d code=%s body=%s", code, body.Code, body.raw)
	}
	enabledGate := requireEnabled(pool)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached = true
		w.WriteHeader(http.StatusNoContent)
	}))
	code, body = invoke(t, owner, enabledGate, http.MethodGet, "/api/v1/services/jobs", "", nil)
	if !reached || code != http.StatusNoContent {
		t.Fatalf("enabled module was rejected: status=%d body=%s", code, body.raw)
	}

	before := countLedgers(t, ctx, pool, tenantA)

	code, body = invoke(t, owner, createEquipment(pool), http.MethodPost, "/equipment", jsonBody(map[string]any{
		"partner_id": partner, "location_id": loc1, "name": "Pump", "qty": 2,
	}), nil)
	if code != http.StatusOK || !body.Success {
		t.Fatalf("create equipment: %d %s", code, body.raw)
	}
	equipmentID := body.mustID(t)
	code, body = invoke(t, other, getEquipment(pool), http.MethodGet, "/equipment/"+idStr(equipmentID), "", map[string]string{"id": idStr(equipmentID)})
	if code != http.StatusNotFound {
		t.Fatalf("cross-tenant equipment read: status=%d body=%s", code, body.raw)
	}

	code, body = invoke(t, owner, createRequest(pool), http.MethodPost, "/requests", jsonBody(map[string]any{
		"subject": "Portal label", "service_type_id": typeID, "partner_id": partner,
		"location_id": loc1, "source": "portal",
	}), nil)
	if code != http.StatusOK || !body.Success {
		t.Fatalf("create request: %d %s", code, body.raw)
	}
	requestID := body.mustID(t)
	code, body = invoke(t, owner, convertRequest(pool), http.MethodPost, "/convert", `{}`, map[string]string{"id": idStr(requestID)})
	if code != http.StatusOK || !body.Success {
		t.Fatalf("convert: %d %s", code, body.raw)
	}
	convertedID := body.mustID(t)
	code, body = invoke(t, owner, convertRequest(pool), http.MethodPost, "/convert", `{}`, map[string]string{"id": idStr(requestID)})
	if code != http.StatusOK || body.boolField(t, "created") {
		t.Fatalf("second convert created a job: %d %s", code, body.raw)
	}
	if body.mustID(t) != convertedID {
		t.Fatalf("second convert returned %d, want %d", body.mustID(t), convertedID)
	}

	code, body = invoke(t, owner, jobFromSalesOrder(pool), http.MethodPost, "/from-so", jsonBody(map[string]any{
		"service_type_id": typeID,
	}), map[string]string{"salesOrderId": idStr(salesOrder)})
	if code != http.StatusOK || !body.Success || !body.boolField(t, "created") {
		t.Fatalf("generate: %d %s", code, body.raw)
	}
	generatedID := body.mustID(t)
	code, body = invoke(t, owner, jobFromSalesOrder(pool), http.MethodPost, "/from-so", jsonBody(map[string]any{
		"service_type_id": typeID,
	}), map[string]string{"salesOrderId": idStr(salesOrder)})
	if code != http.StatusOK || body.boolField(t, "created") || body.mustID(t) != generatedID {
		t.Fatalf("second generate: %d %s", code, body.raw)
	}
	var jobsForOrder int
	if err := pool.QueryRow(ctx, `
		select count(*) from public.svc_jobs
		where tenant_id = $1 and sales_order_id = $2 and deleted_at is null`, tenantA, salesOrder).Scan(&jobsForOrder); err != nil {
		t.Fatal(err)
	}
	if jobsForOrder != 1 {
		t.Fatalf("sales order has %d jobs", jobsForOrder)
	}

	code, body = invoke(t, owner, patchJobStatus(pool), http.MethodPatch, "/status", jsonBody(map[string]any{
		"approval_status": "approved", "row_version": 1,
	}), map[string]string{"id": idStr(generatedID)})
	if code == http.StatusOK {
		t.Fatalf("status patch confirmed the job: %s", body.raw)
	}
	var approval string
	if err := pool.QueryRow(ctx, `select approval_status from public.svc_jobs where id = $1 and tenant_id = $2`, generatedID, tenantA).Scan(&approval); err != nil {
		t.Fatal(err)
	}
	if approval == "approved" {
		t.Fatal("status patch stored approved")
	}
	code, body = invoke(t, owner, confirmJob(pool), http.MethodPost, "/confirm", `{}`, map[string]string{"id": idStr(generatedID)})
	if code != http.StatusOK || !body.Success {
		t.Fatalf("confirm: %d %s", code, body.raw)
	}
	if err := pool.QueryRow(ctx, `select approval_status from public.svc_jobs where id = $1`, generatedID).Scan(&approval); err != nil {
		t.Fatal(err)
	}
	if approval != "approved" {
		t.Fatalf("approval_status=%s", approval)
	}

	code, body = invoke(t, owner, createSlip(pool), http.MethodPost, "/slips", jsonBody(map[string]any{
		"slip_type": "receiving", "origin_location_id": loc1, "destination_location_id": loc2,
		"items": []map[string]any{{"equipment_id": equipmentID, "qty": 2}},
	}), nil)
	if code != http.StatusOK || !body.Success {
		t.Fatalf("receiving slip: %d %s", code, body.raw)
	}
	receiveID := body.mustID(t)
	code, body = invoke(t, clerk, receiveSlip(pool), http.MethodPost, "/receive", `{}`, map[string]string{"id": idStr(receiveID)})
	if code != http.StatusForbidden {
		t.Fatalf("cross-branch receive: status=%d body=%s", code, body.raw)
	}
	code, body = invoke(t, owner, receiveSlip(pool), http.MethodPost, "/receive", `{}`, map[string]string{"id": idStr(receiveID)})
	if code != http.StatusOK || !body.Success {
		t.Fatalf("owner receive: %d %s", code, body.raw)
	}
	code, body = invoke(t, owner, createSlip(pool), http.MethodPost, "/slips", jsonBody(map[string]any{
		"slip_type": "release", "origin_location_id": loc1,
		"items": []map[string]any{{"equipment_id": equipmentID, "qty": 0.5}},
	}), nil)
	if code != http.StatusOK || !body.Success {
		t.Fatalf("partial release slip: %d %s", code, body.raw)
	}
	releaseID := body.mustID(t)
	code, body = invoke(t, owner, releaseSlip(pool), http.MethodPost, "/release", `{}`, map[string]string{"id": idStr(releaseID)})
	if code != http.StatusOK || !body.Success {
		t.Fatalf("release: %d %s", code, body.raw)
	}
	var inCustody float64
	if err := pool.QueryRow(ctx, `select qty_in_custody::float8 from public.svc_customer_equipment where id = $1`, equipmentID).Scan(&inCustody); err != nil {
		t.Fatal(err)
	}
	if inCustody != 1.5 {
		t.Fatalf("qty_in_custody=%v, want 1.5", inCustody)
	}

	after := countLedgers(t, ctx, pool, tenantA)
	if before != after || after != (ledgerCounts{}) {
		t.Fatalf("stock or journals changed: before=%+v after=%+v", before, after)
	}
	var movements int
	if err := pool.QueryRow(ctx, `select count(*) from public.svc_custody_movements where tenant_id = $1`, tenantA).Scan(&movements); err != nil {
		t.Fatal(err)
	}
	if movements == 0 {
		t.Fatal("release did not append a custody movement")
	}
}

type ledgerCounts struct{ stock, journals, balances int }

func countLedgers(t *testing.T, ctx context.Context, pool *pgxpool.Pool, tenantID int64) ledgerCounts {
	t.Helper()
	var c ledgerCounts
	err := pool.QueryRow(ctx, `
		select
		  (select count(*) from public.inv_stock_movements where tenant_id = $1),
		  (select count(*) from public.fin_journal_entries where tenant_id = $1),
		  (select count(*) from public.inv_item_location_balances where tenant_id = $1)`, tenantID).Scan(&c.stock, &c.journals, &c.balances)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

type apiEnv struct {
	Success bool            `json:"success"`
	Code    string          `json:"code"`
	Data    json.RawMessage `json:"data"`
	raw     string
}

func (e apiEnv) mustID(t *testing.T) int64 {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(e.Data, &m); err != nil {
		t.Fatalf("data: %s", e.raw)
	}
	n, ok := m["id"].(float64)
	if !ok || n <= 0 {
		t.Fatalf("missing id: %s", e.raw)
	}
	return int64(n)
}

func (e apiEnv) boolField(t *testing.T, key string) bool {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(e.Data, &m); err != nil {
		t.Fatalf("data: %s", e.raw)
	}
	v, _ := m[key].(bool)
	return v
}

func invoke(t *testing.T, tu auth.TenantUser, h http.Handler, method, target, payload string, params map[string]string) (int, apiEnv) {
	t.Helper()
	var rdr io.Reader
	if payload != "" {
		rdr = strings.NewReader(payload)
	}
	req := httptest.NewRequest(method, target, rdr)
	ctx := context.WithValue(req.Context(), auth.UserContextKey, tu)
	if len(params) > 0 {
		rctx := chi.NewRouteContext()
		for k, v := range params {
			rctx.URLParams.Add(k, v)
		}
		ctx = context.WithValue(ctx, chi.RouteCtxKey, rctx)
	}
	req = req.WithContext(ctx)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	env := apiEnv{raw: rec.Body.String()}
	_ = json.Unmarshal(rec.Body.Bytes(), &env)
	return rec.Code, env
}

func jsonBody(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func idStr(id int64) string { return strconv.FormatInt(id, 10) }
