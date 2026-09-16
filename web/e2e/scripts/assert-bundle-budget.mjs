/**
 * Enforce a web performance budget on the built bundle.
 *
 * The number that decides how long a user stares at a blank screen is the
 * first-load payload: the entry script plus everything index.html preloads. That
 * is what this measures, alongside two guard rails — total JavaScript shipped,
 * and the size of the single largest chunk — so growth cannot hide by being
 * spread thinly or parked in one enormous lazy chunk.
 *
 * Budgets live in e2e/fixtures/perf-budget.json. Raising one is a reviewable
 * change with a reason attached, which is the point.
 *
 * Usage:
 *   npm run build
 *   node e2e/scripts/assert-bundle-budget.mjs
 *   node e2e/scripts/assert-bundle-budget.mjs --write   # re-measure and record
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../..");
const distDir = path.join(webRoot, "dist");
const budgetFile = path.join(__dirname, "../fixtures/perf-budget.json");

if (!fs.existsSync(distDir)) {
  console.error(`perf budget: no build at ${distDir}. Run npm run build first.`);
  process.exit(1);
}

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

function sizeOf(assetPath) {
  const file = path.join(distDir, assetPath.replace(/^\//, ""));
  return fs.existsSync(file) ? fs.statSync(file).size : 0;
}

const html = fs.readFileSync(path.join(distDir, "index.html"), "utf8");
const firstLoadRefs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const firstLoadBytes = firstLoadRefs.reduce((sum, ref) => sum + sizeOf(ref), 0);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : [full];
  });
}

// Only the bundler's own output. Third-party runtimes copied into dist wholesale
// (the OCR wasm loaders, for one) are not chunks we control, and letting the
// largest of them define the metric would make it say nothing about our code.
const assetsDir = path.join(distDir, "assets");
const jsFiles = walk(assetsDir).filter(
  (f) => f.endsWith(".js") && !/\bsw\.js$|workbox-/.test(path.basename(f)),
);
const totalJsBytes = jsFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const largest = jsFiles
  .map((f) => ({ name: path.basename(f), bytes: fs.statSync(f).size }))
  .sort((a, b) => b.bytes - a.bytes)[0];

const measured = {
  firstLoadKb: kb(firstLoadBytes),
  totalJsKb: kb(totalJsBytes),
  largestChunkKb: kb(largest.bytes),
  largestChunkName: largest.name,
};

if (process.argv.includes("--write")) {
  // Record with a little headroom so ordinary feature work does not trip the gate.
  const headroom = (n) => Math.ceil(n * 1.05);
  fs.writeFileSync(
    budgetFile,
    JSON.stringify(
      {
        _comment:
          "Web performance budget in KiB, uncompressed, over dist/assets only. firstLoadKb is the entry script plus everything index.html preloads: the bytes a user waits on before anything renders. Budgets carry ~5% headroom over the measurement below. Raising a budget needs a reason in the pull request.",
        _measuredAt: new Date().toISOString().slice(0, 10),
        _measured: measured,
        firstLoadKb: headroom(measured.firstLoadKb),
        totalJsKb: headroom(measured.totalJsKb),
        largestChunkKb: headroom(measured.largestChunkKb),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`perf budget: recorded from this build -> ${budgetFile}`);
  console.log(measured);
  process.exit(0);
}

const budget = JSON.parse(fs.readFileSync(budgetFile, "utf8"));

const checks = [
  ["first load (entry + preloads)", measured.firstLoadKb, budget.firstLoadKb],
  ["total JavaScript", measured.totalJsKb, budget.totalJsKb],
  [`largest chunk (${measured.largestChunkName})`, measured.largestChunkKb, budget.largestChunkKb],
];

let failed = false;
for (const [label, actual, limit] of checks) {
  const over = actual > limit;
  failed = failed || over;
  console.log(`  ${over ? "OVER" : "ok  "}  ${label}: ${actual} KiB (budget ${limit} KiB)`);
}

if (failed) {
  console.error(
    "\nperf budget FAILED. Either trim the payload, or raise the budget in " +
      "e2e/fixtures/perf-budget.json and say why in the pull request.",
  );
  process.exit(1);
}

console.log("perf budget OK");
