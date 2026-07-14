/**
 * Extract SPA routes from src/App.tsx into e2e/fixtures/app-routes.json.
 * Nested paths under <Route path="/app"> become /app/... absolute URLs.
 *
 * Usage: node e2e/scripts/extract-app-routes.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "../..");
const appTsx = path.join(webRoot, "src/App.tsx");
const outFile = path.join(webRoot, "e2e/fixtures/app-routes.json");

const src = fs.readFileSync(appTsx, "utf8");
const pathRe = /path="([^"]+)"/g;
const raw = [];
let m;
while ((m = pathRe.exec(src)) !== null) raw.push(m[1]);

/** Resolve Solid nested routes under /app layout to full browser paths. */
function toAbsolute(p) {
  if (p === "/" || p === "") return null;
  if (p.startsWith("/app") || p === "/app") return p === "/app" ? "/app/dashboard" : p;
  if (
    p.startsWith("/signin") ||
    p.startsWith("/signup") ||
    p.startsWith("/demo") ||
    p.startsWith("/welcome") ||
    p.startsWith("/auth/") ||
    p.startsWith("/forgot-password") ||
    p.startsWith("/portal/")
  ) {
    return p;
  }
  // Nested under AppLayout: "/dashboard" → "/app/dashboard"
  if (p.startsWith("/")) return `/app${p}`;
  return `/app/${p}`;
}

function classify(abs) {
  if (abs.includes(":") || abs.includes("*")) return "parametrized";
  if (abs.includes("/print") || abs.endsWith("/2307") || abs.endsWith("/receipt") || abs.endsWith("/warranty")) {
    return "print_or_doc";
  }
  if (!abs.startsWith("/app/")) return "public";
  // Platform / heavy admin often empty for demo tenants — still smokeable but tagged.
  if (abs.startsWith("/app/platform")) return "platform";
  return "app_static";
}

const seen = new Set();
const routes = [];
for (const p of raw) {
  const abs = toAbsolute(p);
  if (!abs || abs === "/app/" || seen.has(abs)) continue;
  seen.add(abs);
  routes.push({
    path: abs,
    source: p,
    kind: classify(abs),
  });
}

routes.sort((a, b) => a.path.localeCompare(b.path));

const smokeable = routes.filter((r) => r.kind === "app_static" || r.kind === "platform").map((r) => r.path);

const payload = {
  generatedAt: new Date().toISOString(),
  source: "src/App.tsx",
  totals: {
    all: routes.length,
    smokeable: smokeable.length,
    byKind: routes.reduce((acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    }, {}),
  },
  smokeable,
  routes,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${outFile}`);
console.log(JSON.stringify(payload.totals, null, 2));
