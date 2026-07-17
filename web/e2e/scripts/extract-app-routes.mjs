/**
 * Extract SPA routes from src/App.tsx into e2e/fixtures/app-routes.json.
 *
 * Nesting-aware: container routes (e.g. <Route path="/app" component={AppLayout}>
 * or <Route path="/app/platform-command" component={PlatformCommandShell}>)
 * prefix their children, so /analytics under platform-command resolves to
 * /app/platform-command/analytics — not /app/analytics.
 *
 * Usage: node e2e/scripts/extract-app-routes.mjs
 * Also imported by src/routes/linkIntegrity.test.ts as the single source of truth.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Join a container prefix and a child route path. */
function joinRoute(prefix, p) {
  if (!prefix) return p;
  if (p === "/" || p === "") return prefix;
  return `${prefix}${p.startsWith("/") ? p : `/${p}`}`;
}

/**
 * Parse App.tsx line by line, tracking container routes.
 * A container is a <Route path="..."> line ending with `>` (has children),
 * closed later by a matching </Route> at the same depth.
 *
 * Returns `{ path, isRedirect }` — isRedirect is true when the route's only
 * job is `<Navigate href="..."/>` (legacy aliases). Those are kept in the
 * inventory but excluded from smokeable so they don't create false failures.
 */
export function extractRouteEntries(src) {
  const containerOpenRe = /^\s*<Route\s+path="([^"]+)"[^>]*component=\{\w+\}>\s*$/;
  const routePathRe = /<Route\s+path="([^"]+)"/;
  const lines = src.split("\n");
  const stack = [];
  const raw = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = containerOpenRe.exec(line);
    if (open) {
      stack.push(joinRoute(stack[stack.length - 1] ?? "", open[1]));
      continue;
    }
    if (/^\s*<\/Route>\s*$/.test(line)) {
      stack.pop();
      continue;
    }
    const m = routePathRe.exec(line);
    if (!m) continue;
    // Peek a few following lines to detect Navigate-only aliases.
    const window = lines.slice(i, i + 4).join("\n");
    const isRedirect = /<Navigate\b/.test(window) && !/<[A-Z][A-Za-z]+Page\b/.test(window);
    raw.push({ path: joinRoute(stack[stack.length - 1] ?? "", m[1]), isRedirect });
  }
  return raw;
}

/** Resolve extracted paths to absolute browser paths. Returns { path, isRedirect }[]. */
export function extractAbsoluteRouteEntries(src) {
  const seen = new Map();
  for (const entry of extractRouteEntries(src)) {
    let p = entry.path;
    if (p === "/" || p === "" || p === "*" || p === "/*") continue;
    if (
      !(
        p.startsWith("/app") ||
        p.startsWith("/signin") ||
        p.startsWith("/signup") ||
        p.startsWith("/demo") ||
        p.startsWith("/welcome") ||
        p.startsWith("/auth/") ||
        p.startsWith("/forgot-password") ||
        p.startsWith("/portal/") ||
        p.startsWith("/")
      )
    ) {
      p = `/${p}`;
    }
    // Prefer keeping a non-redirect entry if the same path is declared twice.
    const prev = seen.get(p);
    if (!prev || (prev.isRedirect && !entry.isRedirect)) {
      seen.set(p, { path: p, isRedirect: Boolean(entry.isRedirect) });
    }
  }
  return [...seen.values()];
}

/** Paths only — used by the link-integrity test. */
export function extractAbsoluteRoutes(src) {
  return extractAbsoluteRouteEntries(src).map((e) => e.path);
}

function classify(abs, isRedirect) {
  if (isRedirect) return "redirect";
  if (abs.includes(":") || abs.includes("*")) return "parametrized";
  if (abs.includes("/print") || abs.endsWith("/2307") || abs.endsWith("/receipt") || abs.endsWith("/warranty")) {
    return "print_or_doc";
  }
  if (!abs.startsWith("/app/")) return "public";
  // Platform Command Center requires platform staff — skip in demo tenant smoke.
  if (abs.startsWith("/app/platform")) return "platform";
  return "app_static";
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(__dirname, "../..");
  const appTsx = path.join(webRoot, "src/App.tsx");
  const outFile = path.join(webRoot, "e2e/fixtures/app-routes.json");

  const src = fs.readFileSync(appTsx, "utf8");
  const routes = extractAbsoluteRouteEntries(src)
    .map((e) => ({ path: e.path, kind: classify(e.path, e.isRedirect) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  // Default smoke covers tenant app pages only. Platform routes need a staff
  // session (set E2E_PLATFORM_SMOKE=1 to include them). Redirect aliases are
  // never smokeable — the destination page is what matters.
  const smokeable = routes.filter((r) => r.kind === "app_static").map((r) => r.path);
  if (process.env.E2E_PLATFORM_SMOKE === "1") {
    smokeable.push(...routes.filter((r) => r.kind === "platform").map((r) => r.path));
  }

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
}
