#!/usr/bin/env node
/**
 * Golden-path API smoke — selling + buying + finance list endpoints must return 200.
 * Also verifies supplier-invoice attachments when at least one purchase exists.
 *
 * Usage:
 *   API_BASE=http://localhost:8080 BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs) node scripts/golden-path-smoke.mjs
 *   GOLDEN_CREATE_QUOTATION=true ...   # optional POST create draft quotation smoke
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routes = JSON.parse(readFileSync(join(__dirname, "perf", "routes.golden.json"), "utf8"));
const loadSlipRoutes = JSON.parse(readFileSync(join(__dirname, "perf", "routes.load-slip.json"), "utf8"));

const base = (process.env.API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.BENCH_TOKEN ?? "";

if (!token) {
  console.error("BENCH_TOKEN is required (mint with scripts/mint-bench-jwt.mjs)");
  process.exit(1);
}

async function request(path, options = {}) {
  const headers = { Authorization: `Bearer ${token}`, ...options.headers };
  const res = await fetch(`${base}${path}`, { ...options, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, ok: res.ok };
}

async function hit(route) {
  const res = await request(route.path);
  const ok = route.expectedStatuses.includes(res.status);
  return { id: route.id, status: res.status, ok, body: res.body };
}

let failed = false;
console.log("\nBluearm ERP v3 — golden path smoke\n");
console.log("base:", base);

for (const route of routes) {
  const r = await hit(route);
  if (!r.ok) failed = true;
  const flag = r.ok ? "✓" : "✗";
  console.log(`${flag} ${r.id.padEnd(28)} ${r.status}`);
  if (!r.ok && r.body?.message) {
    console.log(`    ${r.body.message}`);
  }
}

console.log("\nLoad slip open-line endpoints\n");
for (const route of loadSlipRoutes) {
  const r = await hit(route);
  if (!r.ok) failed = true;
  const flag = r.ok ? "✓" : "✗";
  console.log(`${flag} ${r.id.padEnd(28)} ${r.status}`);
  if (!r.ok && r.body?.message) {
    console.log(`    ${r.body.message}`);
  }
}

const poList = await request("/api/v1/purchase-order/purchase-orders?page=1&pageSize=1");
const poId = poList.body?.data?.[0]?.id;
if (poId) {
  const att = await request(`/api/v1/purchase-order/purchase-orders/${poId}/attachments`);
  const ok = att.status === 200;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} purchase_order.attachments`.padEnd(30), att.status, `(id=${poId})`);
  if (!ok && att.body?.message) console.log(`    ${att.body.message}`);
} else {
  console.log("· purchase_order.attachments     skipped (no POs in DB)");
}

const siList = await request("/api/v1/finance/supplier-invoices?page=1&pageSize=1");
const firstId = siList.body?.data?.[0]?.id;
if (firstId) {
  const att = await request(`/api/v1/finance/supplier-invoices/${firstId}/attachments`);
  const ok = att.status === 200;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} supplier_invoice.attachments`.padEnd(30), att.status, `(id=${firstId})`);
  if (!ok && att.body?.message) console.log(`    ${att.body.message}`);
} else {
  console.log("· supplier_invoice.attachments     skipped (no purchases in DB)");
}

const salesList = await request("/api/v1/sales?page=1&pageSize=1");
const saleId = salesList.body?.data?.[0]?.id;
if (saleId) {
  const inv = await request(`/api/v1/sales/${saleId}/invoice`);
  const ok = inv.status === 200;
  if (!ok) failed = true;
  console.log(`${ok ? "✓" : "✗"} sales.invoice`.padEnd(30), inv.status, `(id=${saleId})`);
  if (!ok && inv.body?.message) console.log(`    ${inv.body.message}`);
} else {
  console.log("· sales.invoice                    skipped (no sales in DB)");
}

async function firstListId(path) {
  const res = await request(path);
  if (!res.ok || !Array.isArray(res.body?.data) || res.body.data.length === 0) return null;
  return res.body.data[0];
}

async function smokeCreateQuotation() {
  if (process.env.GOLDEN_CREATE_QUOTATION !== "true") {
    console.log("· quotation.create               skipped (set GOLDEN_CREATE_QUOTATION=true)");
    return;
  }

  const partner = await firstListId("/api/v1/inventory/partners?page=1&pageSize=1&sort=partner_code&order=asc");
  const taxType = await firstListId("/api/v1/quotation/tax-types?page=1&pageSize=1&sort=sort_order&order=asc");
  const currency = await firstListId("/api/v1/quotation/currencies?page=1&pageSize=1&sort=id&order=asc");
  const location = await firstListId("/api/v1/inventory/locations?page=1&pageSize=1&sort=location_code&order=asc");
  const item = await firstListId("/api/v1/inventory/items?page=1&pageSize=1&sort=item_code&order=asc");

  if (!partner?.id || !taxType?.id || !currency?.id || !location?.id || !item?.id) {
    failed = true;
    console.log("✗ quotation.create               skipped (missing lookup seed data)");
    return;
  }

  const orderDate = new Date().toISOString().slice(0, 10);
  const body = {
    order_date: orderDate,
    tax_type_id: taxType.id,
    currency_id: currency.id,
    partner_id: partner.id,
    location_id: location.id,
    pic_name: "Golden smoke",
    progress_status: "unconfirmed",
    lines: [
      {
        line_no: 1,
        item_id: item.id,
        item_code: item.item_code ?? "SMOKE",
        item_name: item.item_name ?? "Smoke item",
        qty: 1,
        unit_price: 100,
        input_basis: "vat_inc_unit",
      },
    ],
  };

  const create = await request("/api/v1/quotation/quotations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const ok = create.status === 201 || create.status === 200;
  if (!ok) failed = true;
  const id = create.body?.data?.id;
  console.log(`${ok ? "✓" : "✗"} quotation.create`.padEnd(30), create.status, id ? `(id=${id})` : "");
  if (!ok && create.body?.message) console.log(`    ${create.body.message}`);
  if (!ok && create.body?.errors) console.log(`    ${JSON.stringify(create.body.errors)}`);
}

await smokeCreateQuotation();

console.log("");
if (failed) {
  console.error("Golden path smoke FAILED");
  process.exit(1);
}
console.log("Golden path smoke passed");
