#!/usr/bin/env node
/**
 * Branch overview audit smoke — list APIs under X-Branch-ID.
 *
 * ENGINEER-ONLY. Product/QA should use the browser Phase 2 protocol in
 * docs/runbooks/BRANCH_OVERVIEW_AUDIT.md (no JWT paste). Skip this script
 * if you do not want to handle tokens.
 *
 * Calls commercial / inventory list endpoints as the authenticated user and
 * flags rows whose location_id is set but not equal to BRANCH_ID (Class C
 * suspects). Endpoints marked expectCompanyWide (RFQ, Journal, books) are
 * reported as Class B info — they never fail the run for multi-branch data.
 *
 * Usage (PowerShell):
 *   $env:API_BASE = "https://api.example.com"
 *   $env:AUTH_TOKEN = "<supabase access token for store_admin>"
 *   $env:X_TENANT_ID = "123"
 *   $env:BRANCH_ID = "1801"
 *   node scripts/branch-overview-audit.mjs
 *
 * Optional:
 *   PAGE_SIZE=50          (default 50)
 *   STRICT=1              exit 1 on any Class C suspect (default: exit 1 only on HTTP errors)
 *   BENCH_TOKEN           alias for AUTH_TOKEN (same as golden-path-smoke)
 *
 * Do not use a platform/owner token if you are auditing store-admin isolation.
 */
const base = (process.env.API_BASE ?? "http://localhost:8080").replace(/\/$/, "");
const token = process.env.AUTH_TOKEN ?? process.env.BENCH_TOKEN ?? "";
const tenantId = process.env.X_TENANT_ID ?? process.env.TENANT_ID ?? "";
const branchId = Number(process.env.BRANCH_ID ?? process.env.X_BRANCH_ID ?? 0);
const pageSize = Number(process.env.PAGE_SIZE ?? 50);
const strict = process.env.STRICT === "1" || process.env.STRICT === "true";
const dateTo = process.env.DATE_TO ?? new Date().toISOString().slice(0, 10);
const dateFrom =
  process.env.DATE_FROM ??
  `${new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10)}`;
const dateQs = `date_from=${dateFrom}&date_to=${dateTo}`;

if (!token) {
  console.error("AUTH_TOKEN (or BENCH_TOKEN) is required.");
  process.exit(1);
}
if (!branchId || branchId <= 0) {
  console.error("BRANCH_ID is required (Active branch / X-Branch-ID to send).");
  process.exit(1);
}

/** @typedef {"commercial" | "inventory" | "company_wide" | "partial"} Expect */

/**
 * @type {{ id: string, path: string, expect: Expect, locField?: string, note?: string }[]}
 */
const ENDPOINTS = [
  {
    id: "quotations",
    path: `/api/v1/quotation/quotations?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "sales_orders",
    path: `/api/v1/sales-order/sales-orders?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "sales",
    path: `/api/v1/sales?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "purchase_requests",
    path: `/api/v1/purchase-request/purchase-requests?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "purchase_orders",
    path: `/api/v1/purchase-order/purchase-orders?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "supplier_invoices",
    path: `/api/v1/finance/supplier-invoices?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "serial_units",
    path: `/api/v1/inventory/serial-units?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "lot_batches",
    path: `/api/v1/inventory/lot-batches?page=1&pageSize=${pageSize}&sort=id&order=desc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "stock_balance",
    path: `/api/v1/inventory/reports/stock-balance?page=1&pageSize=${pageSize}&sort=item_code&order=asc`,
    expect: "commercial",
    locField: "location_id",
  },
  {
    id: "inventory_status",
    path: `/api/v1/inventory/reports/inventory-status?page=1&pageSize=${pageSize}&sort=item_code&order=asc`,
    expect: "partial",
    locField: "location_id",
    note: "Auto Active-branch may be missing; foreign rows → Class B/C",
  },
  {
    id: "inv_book",
    path: `/api/v1/inventory/reports/inv-book?page=1&pageSize=${pageSize}&${dateQs}`,
    expect: "partial",
    locField: "location_id",
    note: "Planning report; not auto-narrowed for owners (runbook Class B)",
  },
  {
    id: "rfq",
    path: `/api/v1/purchase-order/rfq`,
    expect: "company_wide",
    note: "No location_id on rfq_requests — Class B known gap",
  },
  {
    id: "journal_entries",
    path: `/api/v1/finance/journal-entries?page=1&pageSize=${pageSize}&sort=updated_at&order=desc`,
    expect: "company_wide",
    note: "JE has no location_id — Class B company-wide books",
  },
  {
    id: "trial_balance",
    path: `/api/v1/finance/reports/trial-balance?page=1&pageSize=${pageSize}&${dateQs}`,
    expect: "company_wide",
    note: "Company-wide books — Class B",
  },
];

async function request(path) {
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "X-Branch-ID": String(branchId),
  };
  if (tenantId) headers["X-Tenant-ID"] = String(tenantId);

  const res = await fetch(`${base}${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body, sentBranch: headers["X-Branch-ID"] };
}

function rowsFrom(body) {
  if (!body) return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body)) return body;
  return [];
}

function totalFrom(body, rows) {
  if (body && typeof body.total === "number") return body.total;
  if (body?.meta && typeof body.meta.total === "number") return body.meta.total;
  return rows.length;
}

function docLabel(row) {
  return (
    row.quotation_no ||
    row.sales_order_no ||
    row.sales_no ||
    row.invoice_no ||
    row.purchase_order_no ||
    row.purchase_request_no ||
    row.rfq_no ||
    row.entry_no ||
    row.serial_no ||
    row.lot_no ||
    row.item_code ||
    (row.id != null ? `id=${row.id}` : "?")
  );
}

/**
 * @param {{ id: string, expect: Expect, locField?: string, note?: string }} ep
 * @param {any[]} rows
 */
function analyze(ep, rows) {
  const field = ep.locField ?? "location_id";
  if (ep.expect === "company_wide") {
    return {
      classHint: "B",
      foreign: [],
      nullLoc: [],
      sameBranch: rows.length,
      summary: `company-wide expected (${rows.length} rows) — Class B`,
    };
  }

  const foreign = [];
  const nullLoc = [];
  let sameBranch = 0;
  for (const row of rows) {
    const loc = row[field];
    if (loc == null || loc === 0) {
      nullLoc.push(docLabel(row));
      continue;
    }
    if (Number(loc) !== branchId) {
      foreign.push({ label: docLabel(row), location_id: loc });
    } else {
      sameBranch++;
    }
  }

  let classHint = "PASS";
  if (foreign.length > 0) {
    classHint = ep.expect === "partial" ? "B/C" : "C";
  } else if (nullLoc.length > 0) {
    classHint = "F?";
  }

  return {
    classHint,
    foreign,
    nullLoc,
    sameBranch,
    summary:
      foreign.length === 0
        ? `ok (${sameBranch} @ branch ${branchId}, ${nullLoc.length} null loc)`
        : `${foreign.length} foreign location_id (suspect Class ${classHint})`,
  };
}

console.log("\nBluearm ERP v3 — branch overview audit smoke\n");
console.log("base:     ", base);
console.log("branch:   ", branchId, "(X-Branch-ID)");
console.log("tenant:   ", tenantId || "(omit X-Tenant-ID)");
console.log("pageSize: ", pageSize);
console.log("dates:    ", dateFrom, "→", dateTo);
console.log("strict:   ", strict);
console.log("");

let httpFailed = false;
let classC = 0;
const evidence = [];

for (const ep of ENDPOINTS) {
  const res = await request(ep.path);
  const rows = rowsFrom(res.body);
  const total = totalFrom(res.body, rows);
  const analysis = analyze(ep, rows);

  if (!res.ok) {
    httpFailed = true;
    console.log(`✗ ${ep.id.padEnd(22)} HTTP ${res.status}`);
    if (res.body?.message) console.log(`    ${res.body.message}`);
    evidence.push({
      id: ep.id,
      status: res.status,
      class: "HTTP",
      total: 0,
      foreign: 0,
      note: res.body?.message ?? "",
    });
    continue;
  }

  const flag =
    analysis.classHint === "PASS" || analysis.classHint === "B" || analysis.classHint === "F?"
      ? analysis.classHint === "PASS"
        ? "✓"
        : "·"
      : "✗";

  if (analysis.classHint === "C" || analysis.classHint === "B/C") classC++;

  console.log(
    `${flag} ${ep.id.padEnd(22)} HTTP ${res.status}  total=${String(total).padStart(4)}  class=${analysis.classHint.padEnd(4)}  ${analysis.summary}`,
  );
  if (ep.note) console.log(`    note: ${ep.note}`);
  if (analysis.foreign.length) {
    const sample = analysis.foreign.slice(0, 5).map((f) => `${f.label}(loc=${f.location_id})`);
    console.log(`    foreign sample: ${sample.join(", ")}`);
  }
  if (analysis.nullLoc.length && analysis.classHint !== "B") {
    const sample = analysis.nullLoc.slice(0, 3).join(", ");
    console.log(`    null location_id sample: ${sample}`);
  }

  evidence.push({
    id: ep.id,
    status: res.status,
    class: analysis.classHint,
    total,
    foreign: analysis.foreign.length,
    nullLoc: analysis.nullLoc.length,
    note: ep.note ?? "",
  });
}

console.log("\n--- Evidence summary (paste into BRANCH_OVERVIEW_AUDIT log) ---\n");
console.log(
  "| Endpoint | HTTP | Total | Foreign | Null loc | Class | Note |",
);
console.log("|----------|------|-------|---------|----------|-------|------|");
for (const e of evidence) {
  console.log(
    `| ${e.id} | ${e.status} | ${e.total} | ${e.foreign} | ${e.nullLoc ?? 0} | ${e.class} | ${(e.note || "").replace(/\|/g, "/")} |`,
  );
}

console.log("\nTaxonomy: A=config B=known gap C=list leak D=cache E=deep-link F=null location");
console.log("This script cannot detect Class A (check apply_user_scopes + user_data_scopes first).");
console.log("This script cannot detect Class D (UI cache) — use browser after branch switch.\n");

if (httpFailed) {
  process.exit(1);
}
if (strict && classC > 0) {
  console.error(`STRICT=1: ${classC} endpoint(s) with foreign location rows.`);
  process.exit(1);
}
process.exit(0);
