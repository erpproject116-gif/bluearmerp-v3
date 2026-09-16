/**
 * Build coverage-manifest.json from app-routes.json + module prefixes + tier defaults.
 * Enforced by coverage-manifest.spec.ts / CI gate.
 *
 * Usage: node e2e/scripts/build-coverage-manifest.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../..");
const routesFile = path.join(webRoot, "e2e/fixtures/app-routes.json");
const outFile = path.join(webRoot, "e2e/fixtures/coverage-manifest.json");

const MODULE_OWNERS = [
  { prefix: "/app/inventory", module: "inventory", owner: "inventory", defaultTier: "read-only" },
  { prefix: "/app/quotation", module: "quotation", owner: "selling", defaultTier: "read-only" },
  { prefix: "/app/sales-order", module: "sales-order", owner: "selling", defaultTier: "read-only" },
  { prefix: "/app/sales", module: "sales", owner: "selling", defaultTier: "read-only" },
  { prefix: "/app/purchase-request", module: "purchase-request", owner: "buying", defaultTier: "read-only" },
  { prefix: "/app/purchase-order", module: "purchase-order", owner: "buying", defaultTier: "read-only" },
  { prefix: "/app/purchases", module: "purchases", owner: "buying", defaultTier: "read-only" },
  { prefix: "/app/finance", module: "finance", owner: "accounting", defaultTier: "read-only" },
  { prefix: "/app/after-sales", module: "after-sales", owner: "after-sales", defaultTier: "read-only" },
  { prefix: "/app/crm", module: "crm", owner: "crm", defaultTier: "read-only" },
  { prefix: "/app/production", module: "production", owner: "manufacturing", defaultTier: "read-only" },
  { prefix: "/app/support", module: "support", owner: "support", defaultTier: "read-only" },
  { prefix: "/app/setup", module: "setup", owner: "onboarding", defaultTier: "read-only" },
  { prefix: "/app/dashboard", module: "dashboard", owner: "shell", defaultTier: "read-only" },
  { prefix: "/app/operations", module: "operations", owner: "ops", defaultTier: "read-only" },
  { prefix: "/app/documentation", module: "documentation", owner: "help", defaultTier: "read-only" },
  { prefix: "/app/user-management", module: "user-management", owner: "admin", defaultTier: "read-only" },
];

function classifyModule(routePath) {
  for (const m of MODULE_OWNERS) {
    if (routePath === m.prefix || routePath.startsWith(m.prefix + "/")) return m;
  }
  return { prefix: "/app", module: "other", owner: "unassigned", defaultTier: "read-only" };
}

function surfaceKind(routePath) {
  if (routePath.includes("/reports")) return "report";
  if (routePath.endsWith("/settings") || routePath.includes("/settings/")) return "settings";
  if (routePath.endsWith("/new")) return "create";
  return "page";
}

const routes = JSON.parse(fs.readFileSync(routesFile, "utf8"));
const smokeable = routes.smokeable || [];
const parametrized = (routes.routes || []).filter((r) => r.kind === "parametrized").map((r) => r.path);

const entries = smokeable.map((routePath) => {
  const mod = classifyModule(routePath);
  return {
    path: routePath,
    module: mod.module,
    owner: mod.owner,
    surface: surfaceKind(routePath),
    tier: mod.defaultTier,
    contracts: {
      routeSmoke: true,
      pageShell: true,
      grid: routePath.includes("/reports") ? false : null,
      form: null,
      history: null,
      chain: null,
      uxTask: null,
    },
    status: "untested",
  };
});

const payload = {
  generatedAt: new Date().toISOString(),
  sourceRoutes: "e2e/fixtures/app-routes.json",
  sourceGeneratedAt: routes.generatedAt,
  totals: {
    smokeable: entries.length,
    parametrized: parametrized.length,
    byModule: entries.reduce((acc, e) => {
      acc[e.module] = (acc[e.module] ?? 0) + 1;
      return acc;
    }, {}),
  },
  parametrized,
  entries,
};

fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${outFile}`);
console.log(JSON.stringify(payload.totals, null, 2));
