/**
 * Fail a Playwright run that reported success without actually testing anything.
 *
 * Playwright exits 0 when every test skips. Combined with auth gating, that is
 * how a suite can look green while covering nothing. This reads the JSON report
 * and enforces a floor on the number of tests that genuinely executed.
 *
 * A spec cannot do this job: no single test can see the whole run's outcome.
 *
 * Usage:
 *   node e2e/scripts/assert-coverage-floor.mjs --report results.json --job demo-smoke
 *   node e2e/scripts/assert-coverage-floor.mjs --report results.json --min 12
 *
 * Floors live in e2e/fixtures/coverage-floors.json so raising or lowering one
 * is a reviewable change rather than an invisible env tweak.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function arg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const reportPath = arg("report", "test-results/results.json");
const job = arg("job");
const explicitMin = arg("min");

if (!fs.existsSync(reportPath)) {
  console.error(`coverage floor: report not found at ${reportPath}`);
  console.error("Run Playwright with --reporter=json and PLAYWRIGHT_JSON_OUTPUT_NAME set.");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

const counts = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 };
const skippedTitles = [];

function visit(suite) {
  for (const spec of suite.specs ?? []) {
    for (const t of spec.tests ?? []) {
      const status = t.status ?? "unknown";
      if (status in counts) counts[status] += 1;
      if (status === "skipped") skippedTitles.push(spec.title);
    }
  }
  for (const child of suite.suites ?? []) visit(child);
}
for (const suite of report.suites ?? []) visit(suite);

const executed = counts.expected + counts.unexpected + counts.flaky;
const total = executed + counts.skipped;

let min = explicitMin != null ? Number(explicitMin) : undefined;
if (min == null && job) {
  const floorsFile = path.join(__dirname, "../fixtures/coverage-floors.json");
  const floors = JSON.parse(fs.readFileSync(floorsFile, "utf8"));
  if (!(job in floors)) {
    console.error(`coverage floor: no floor recorded for job "${job}" in ${floorsFile}`);
    process.exit(1);
  }
  min = Number(floors[job]);
}
if (min == null || Number.isNaN(min)) {
  console.error("coverage floor: pass --min N or --job <name>");
  process.exit(1);
}

console.log(
  `coverage floor: executed=${executed} (passed ${counts.expected}, failed ${counts.unexpected}, flaky ${counts.flaky}), skipped=${counts.skipped}, total=${total}, floor=${min}`,
);

if (executed < min) {
  console.error(
    `\ncoverage floor FAILED: only ${executed} test(s) executed but at least ${min} were expected.`,
  );
  if (skippedTitles.length) {
    console.error("Skipped:");
    for (const t of skippedTitles.slice(0, 25)) console.error(`  - ${t}`);
    if (skippedTitles.length > 25) console.error(`  ... and ${skippedTitles.length - 25} more`);
  }
  console.error(
    "\nThis usually means authentication was missing and the suite silently skipped itself.",
  );
  process.exit(1);
}

console.log("coverage floor OK");
