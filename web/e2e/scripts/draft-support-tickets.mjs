/**
 * Build Support ticket drafts from Playwright JSON report + evidence.
 * Does NOT submit tickets — review/dedupe first, then use submit script or UI.
 *
 * Usage:
 *   node e2e/scripts/draft-support-tickets.mjs [path/to/results.json]
 *
 * Output: e2e/.evidence/<run>/ticket-drafts.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../..");

function redact(s) {
  return String(s)
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/(password|token|secret)=[^\s&]+/gi, "$1=[REDACTED]");
}

function draftFromFailure(f, runId) {
  const title = f.title || f.test || "Unknown failure";
  const file = f.file || f.location?.file || "";
  const error = f.error?.message || f.message || f.status || "failed";
  const routeMatch = String(error + " " + title).match(/\/app\/[a-z0-9\-/_]+/i);
  const route = routeMatch ? routeMatch[0] : "";
  const subject = `[E2E] ${title}`.slice(0, 500);
  const description = [
    "## Problem",
    error,
    "",
    "## Why this is a problem",
    "End-user or QA automation hit a reproducible failure or incomplete path on a live/demo tenant. Silent skips are not allowed — this must be triaged.",
    "",
    "## Steps to reproduce",
    `1. Auth as live E2E account (storageState or E2E_DEMO_*).`,
    `2. Run: ${file || "see Playwright report"}`,
    `3. Observe failure on: ${route || "(see error)"}`,
    "",
    "**Expected:** Journey completes or fails with actionable validation.",
    `**Actual:** ${redact(error).slice(0, 1500)}`,
    "",
    "## Environment",
    `- Run ID: ${runId}`,
    `- E2E_BASE_URL: ${process.env.E2E_BASE_URL || "(unset)"}`,
    `- Tier: ${process.env.E2E_TIER || "read-only"}`,
    "",
    "## How to resolve (recommended fix)",
    "Reproduce manually, identify root cause (validation, API 5xx, missing seed, permission, UX copy), fix in a small PR with regression coverage.",
    "",
    "## How to make it better (UX / process)",
    "Add clear field-level errors, next-step guidance, remove orphan nav, reduce extra steps if friction was recorded.",
    "",
    "## Severity / frequency",
    "P1 unless polish-only; mark P0 if sell/buy/post blocked.",
  ].join("\n");

  return {
    subject,
    category: "technical",
    description,
    route,
    sourceFile: file,
    status: "draft",
    dedupeKey: `${route}|${title}`.toLowerCase(),
  };
}

const resultsPath =
  process.argv[2] ||
  path.join(webRoot, "test-results", "results.json");

const runId = process.env.E2E_RUN_CONFIRM || process.env.E2E_RUN_ID || `draft-${Date.now()}`;
const outDir = path.join(webRoot, "e2e/.evidence", runId.replace(/[^\w.-]+/g, "_"));
fs.mkdirSync(outDir, { recursive: true });

let failures = [];
if (fs.existsSync(resultsPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    // Playwright JSON reporter shapes vary; collect failed suites.
    const walk = (suite) => {
      for (const s of suite.suites || []) walk(s);
      for (const spec of suite.specs || []) {
        for (const t of spec.tests || []) {
          const result = (t.results || []).at(-1);
          if (result?.status === "failed" || result?.status === "timedOut") {
            failures.push({
              title: spec.title,
              file: spec.file || suite.file,
              error: result.error,
              status: result.status,
            });
          }
        }
      }
    };
    if (raw.suites) raw.suites.forEach(walk);
    else if (Array.isArray(raw)) failures = raw;
  } catch (e) {
    console.warn("Could not parse results JSON:", e.message);
  }
}

// Also ingest UX evidence friction as draft candidates
const uxFile = path.join(outDir, "ux-task-results.json");
if (fs.existsSync(uxFile)) {
  try {
    const ux = JSON.parse(fs.readFileSync(uxFile, "utf8"));
    for (const r of ux.results || []) {
      if (!r.friction?.length) continue;
      failures.push({
        title: `UX friction: ${r.label}`,
        file: "e2e/end-user-ux.spec.ts",
        message: r.friction.join("; "),
        status: "failed",
      });
    }
  } catch {
    /* ignore */
  }
}

const drafts = failures.map((f) => draftFromFailure(f, runId));
const byKey = new Map();
for (const d of drafts) {
  if (!byKey.has(d.dedupeKey)) byKey.set(d.dedupeKey, d);
}
const deduped = [...byKey.values()];

const payload = {
  generatedAt: new Date().toISOString(),
  runId,
  policy: "review_then_submit",
  note: "Do not POST to /api/v1/support/tickets until human/agent review + Support list/export dedupe.",
  draftCount: deduped.length,
  drafts: deduped,
};

const outFile = path.join(outDir, "ticket-drafts.json");
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${outFile} (${deduped.length} drafts)`);
