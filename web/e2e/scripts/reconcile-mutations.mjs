/**
 * Reconcile, and optionally reverse, the records a live mutating run created.
 *
 * A mutating run is not finished when the tests go green. It is finished when
 * nothing it created is still sitting in the tenant. This script closes that gap:
 * it reads the run ledger, asks the API which of those records still exist, and
 * either reports them or reverses them.
 *
 * Reversal is deliberately narrow. It only touches records the ledger says this
 * run created, and it refuses to act on anything whose identifier does not carry
 * the run marker. A record that cannot be proven to belong to the run is reported
 * for a human, never deleted.
 *
 * Usage:
 *   node e2e/scripts/reconcile-mutations.mjs                 # report only
 *   node e2e/scripts/reconcile-mutations.mjs --reverse       # void/delete run records
 *
 * Env:
 *   E2E_RUN_CONFIRM / E2E_RUN_ID   run whose ledger to read (required)
 *   E2E_API_BASE                   default https://api.bluearmerp.com
 *   E2E_TICKET_BEARER              bearer token
 *   E2E_TENANT_ID                  X-Tenant-ID header
 *
 * Exit codes: 0 clean, 1 misconfigured, 2 unreversed records remain.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runId = (process.env.E2E_RUN_CONFIRM || process.env.E2E_RUN_ID || "").trim();
if (!runId) {
  console.error("Set E2E_RUN_CONFIRM (or E2E_RUN_ID) to the run you want to reconcile.");
  process.exit(1);
}

const reverse = process.argv.includes("--reverse");
const apiBase = (process.env.E2E_API_BASE || "https://api.bluearmerp.com").replace(/\/$/, "");
const bearer = process.env.E2E_TICKET_BEARER || "";
const tenantId = process.env.E2E_TENANT_ID || "";

const evidenceDir = path.join(__dirname, "../.evidence", runId.replace(/[^\w.-]+/g, "_"));
const ledgerFile = path.join(evidenceDir, "mutation-ledger.jsonl");

if (!fs.existsSync(ledgerFile)) {
  console.log(`No ledger at ${ledgerFile}. Nothing was recorded for run ${runId}.`);
  process.exit(0);
}

const entries = fs
  .readFileSync(ledgerFile, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

/** Last status wins, so a record reversed in an earlier pass is not re-reversed. */
const byMarker = new Map();
for (const e of entries) {
  byMarker.set(e.marker, e);
}

const outstanding = [...byMarker.values()].filter(
  (e) => e.status === "created" || e.status === "updated" || e.status === "posted",
);

console.log(`Run ${runId}: ${entries.length} ledger entries, ${outstanding.length} outstanding.`);

if (!outstanding.length) {
  console.log("Clean: nothing left to reverse.");
  process.exit(0);
}

function headers() {
  return {
    Authorization: `Bearer ${bearer}`,
    "X-Tenant-ID": tenantId,
    "Content-Type": "application/json",
  };
}

/** A ledger marker is reversible only when it names a concrete API record. */
function apiRecord(entry) {
  const m = /^(\/api\/v1\/[\w\-/]+?)\/(\d+)$/.exec(entry.marker ?? "");
  return m ? { resource: m[1], id: m[2] } : null;
}

const results = [];
let stillLive = 0;

for (const entry of outstanding) {
  const record = apiRecord(entry);

  if (!record) {
    // Marker-only entries (a note field stamped E2E-*) cannot be addressed by id.
    // Report them; a human decides. Deleting by guessed id is how you lose real data.
    results.push({
      marker: entry.marker,
      kind: entry.kind,
      state: "needs-manual-review",
      why: "Ledger entry carries a text marker but no API record id.",
    });
    stillLive += 1;
    continue;
  }

  if (!bearer || !tenantId) {
    results.push({ ...record, marker: entry.marker, state: "unknown", why: "No API credentials provided." });
    stillLive += 1;
    continue;
  }

  const url = `${apiBase}${record.resource}/${record.id}`;
  const head = await fetch(url, { headers: headers() }).catch((e) => ({ ok: false, status: 0, error: e }));

  if (head.status === 404) {
    results.push({ ...record, marker: entry.marker, state: "already-gone" });
    continue;
  }
  if (!head.ok) {
    results.push({ ...record, marker: entry.marker, state: "unknown", why: `GET returned ${head.status}` });
    stillLive += 1;
    continue;
  }

  if (!reverse) {
    results.push({ ...record, marker: entry.marker, state: "still-live" });
    stillLive += 1;
    continue;
  }

  const del = await fetch(url, { method: "DELETE", headers: headers() }).catch((e) => ({
    ok: false,
    status: 0,
    error: e,
  }));

  if (del.ok || del.status === 404) {
    results.push({ ...record, marker: entry.marker, state: "reversed" });
    fs.appendFileSync(
      ledgerFile,
      JSON.stringify({
        at: new Date().toISOString(),
        runId,
        kind: entry.kind,
        marker: entry.marker,
        path: entry.path,
        status: "reversed",
      }) + "\n",
      "utf8",
    );
  } else {
    results.push({
      ...record,
      marker: entry.marker,
      state: "reversal-failed",
      why: `DELETE returned ${del.status}`,
    });
    stillLive += 1;
  }
}

const reportPath = path.join(evidenceDir, "reconcile.json");
fs.writeFileSync(
  reportPath,
  JSON.stringify({ at: new Date().toISOString(), runId, reversed: reverse, stillLive, results }, null, 2) + "\n",
  "utf8",
);

for (const r of results) {
  console.log(`  ${r.state.padEnd(20)} ${r.marker}${r.why ? `  (${r.why})` : ""}`);
}
console.log(`Wrote ${reportPath}`);

if (stillLive) {
  console.error(
    `\n${stillLive} record(s) from run ${runId} are still live. ` +
      (reverse ? "Reversal did not fully succeed." : "Re-run with --reverse, or clear them by hand."),
  );
  process.exit(2);
}

console.log(`\nRun ${runId} reconciled clean: no E2E residue left in the tenant.`);
