#!/usr/bin/env node
/**
 * Golden-path API smoke — selling + buying + finance list endpoints must return 200.
 * Also verifies supplier-invoice attachments when at least one purchase exists.
 *
 * Usage:
 *   API_BASE=http://localhost:8080 BENCH_TOKEN=$(node scripts/mint-bench-jwt.mjs) node scripts/golden-path-smoke.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const routes = JSON.parse(readFileSync(join(__dirname, "perf", "routes.golden.json"), "utf8"));

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

console.log("");
if (failed) {
  console.error("Golden path smoke FAILED");
  process.exit(1);
}
console.log("Golden path smoke passed");
