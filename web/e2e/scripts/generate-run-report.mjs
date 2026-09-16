/**
 * Publish a run report from coverage manifest + evidence + optional ticket drafts.
 * Usage: node e2e/scripts/generate-run-report.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../..");
const runId = process.env.E2E_RUN_CONFIRM || process.env.E2E_RUN_ID || "latest";
const evidenceDir = path.join(webRoot, "e2e/.evidence", runId.replace(/[^\w.-]+/g, "_"));
const docsOut = path.join(webRoot, "../docs/qa/live-e2e-run-report.md");
const localOut = path.join(evidenceDir, "run-report.md");

const routes = JSON.parse(fs.readFileSync(path.join(webRoot, "e2e/fixtures/app-routes.json"), "utf8"));
const manifest = JSON.parse(
  fs.readFileSync(path.join(webRoot, "e2e/fixtures/coverage-manifest.json"), "utf8"),
);

let drafts = { draftCount: 0, drafts: [] };
const draftsFile = path.join(evidenceDir, "ticket-drafts.json");
if (fs.existsSync(draftsFile)) {
  drafts = JSON.parse(fs.readFileSync(draftsFile, "utf8"));
}

let ledger = [];
const ledgerFile = path.join(evidenceDir, "mutation-ledger.jsonl");
if (fs.existsSync(ledgerFile)) {
  ledger = fs
    .readFileSync(ledgerFile, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

const byModule = manifest.totals.byModule || {};
const md = [
  `# Live E2E run report`,
  ``,
  `| Field | Value |`,
  `|-------|-------|`,
  `| Generated | ${new Date().toISOString()} |`,
  `| Run ID | ${runId} |`,
  `| Tier | ${process.env.E2E_TIER || "read-only"} |`,
  `| Base URL | ${process.env.E2E_BASE_URL || "(unset)"} |`,
  `| Smokeable routes | ${routes.totals.smokeable} |`,
  `| Manifest entries | ${manifest.totals.smokeable} |`,
  `| Ticket drafts | ${drafts.draftCount} |`,
  `| Mutation ledger rows | ${ledger.length} |`,
  ``,
  `## Module inventory (smokeable)`,
  ``,
  `| Module | Routes |`,
  `|--------|-------:|`,
  ...Object.entries(byModule)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `| ${k} | ${v} |`),
  ``,
  `## Mutation ledger (E2E-* only)`,
  ``,
  ledger.length
    ? ledger.map((e) => `- \`${e.status}\` ${e.kind} \`${e.marker}\` ${e.path || ""}`).join("\n")
    : "_No mutations recorded (expected for read-only)._",
  ``,
  `## Ticket drafts (review before submit)`,
  ``,
  drafts.draftCount
    ? drafts.drafts.map((d) => `- **${d.subject}** — ${d.route || "n/a"}`).join("\n")
    : "_No drafts. Run Playwright then \`npm run e2e:tickets:draft\`._",
  ``,
  `## Residual risks`,
  ``,
  `- Green run ≠ all permissions/browsers/concurrency covered.`,
  `- Full route smoke may hit 429 on live; use paced batches.`,
  `- Posting tier requires proven reversal; never raw DELETE of posted docs.`,
  `- Migration 298 remains a separately reviewed data operation.`,
  ``,
  `## Definition of done checklist`,
  ``,
  `- [ ] Every manifest entry has evidence-backed state`,
  `- [ ] Allowed E2E-* mutations reconciled or reversed`,
  `- [ ] No pre-existing row altered`,
  `- [ ] Zero unexplained 5xx/schema/reconciliation failures`,
  `- [ ] Accepted findings have deduplicated Support tickets`,
  `- [ ] Regression suite green after fixes`,
  ``,
].join("\n");

fs.mkdirSync(evidenceDir, { recursive: true });
fs.writeFileSync(localOut, md);
// Also write under docs/qa for the close-and-report todo
const docsQa = path.join(webRoot, "..", "docs", "qa");
const altDocs = path.join(webRoot, "docs", "qa");
const targetDocs = fs.existsSync(path.join(webRoot, "docs", "qa"))
  ? path.join(webRoot, "docs", "qa", "live-e2e-run-report.md")
  : path.join(webRoot, "..", "docs", "qa", "live-e2e-run-report.md");
try {
  fs.mkdirSync(path.dirname(targetDocs), { recursive: true });
  fs.writeFileSync(targetDocs, md);
  console.log(`Wrote ${targetDocs}`);
} catch (e) {
  console.warn("docs write skipped:", e.message);
}
console.log(`Wrote ${localOut}`);
