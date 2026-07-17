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
 */
export function extractRouteEntries(src) {
  const containerOpenRe = /^\s*<Route\s+path="([^"]+)"[^>]*component=\{\w+\}>\s*$/;
  const routePathRe = /<Route\s+path="([^"]+)"/;
  const stack = [];
  const raw = [];

  for (const line of src.split("\n")) {
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
    if (m) raw.push(joinRoute(stack[stack.length - 1] ?? "", m[1]));
  }
  return raw;
}

/** Resolve extracted paths to absolute browser paths. */
export function extractAbsoluteRoutes(src) {
  const seen = new Set();
  for (const p of extractRouteEntries(src)) {
    if (p === "/" || p === "" || p === "*" || p === "/*") continue;
    if (p.startsWith("/app")) {
      seen.add(p);
    } else if (
      p.startsWith("/signin") ||
      p.startsWith("/signup") ||
      p.startsWith("/demo") ||
      p.startsWith("/welcome") ||
      p.startsWith("/auth/") ||
      p.startsWith("/forgot-password") ||
      p.startsWith("/portal/")
    ) {
      seen.add(p);
    } else if (p.startsWith("/")) {
      // Top-level route outside any container (public pages).
      seen.add(p);
    } else {
      seen.add(`/${p}`);
    }
  }
  return [...seen];
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

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webRoot = path.resolve(__dirname, "../..");
  const appTsx = path.join(webRoot, "src/App.tsx");
  const outFile = path.join(webRoot, "e2e/fixtures/app-routes.json");

  const src = fs.readFileSync(appTsx, "utf8");
  const routes = extractAbsoluteRoutes(src)
    .map((abs) => ({ path: abs, kind: classify(abs) }))
    .sort((a, b) => a.path.localeCompare(b.path));

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
}
