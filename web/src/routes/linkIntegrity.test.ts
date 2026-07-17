/**
 * Link integrity: every hardcoded "/app/..." path in the frontend source
 * (documentation articles, workflow guides, nav configs, buttons) must
 * resolve to a route declared in src/App.tsx.
 *
 * Routes are re-extracted from App.tsx at test time (via the same script
 * that generates e2e/fixtures/app-routes.json) so this can never go stale —
 * renaming or removing a route immediately fails any file that still links
 * to the old path.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without type declarations
import { extractAbsoluteRoutes } from "../../e2e/scripts/extract-app-routes.mjs";

const SRC_ROOT = path.resolve(__dirname, "..");
const APP_TSX = path.join(SRC_ROOT, "App.tsx");

function routePatternToRegex(route: string): RegExp {
  const pattern = route
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) return "[^/]+";
      if (seg === "*" || seg.endsWith("*")) return ".*";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${pattern}$`);
}

// ---------------------------------------------------------------------------
// Link scanning
// ---------------------------------------------------------------------------

type FoundLink = { link: string; file: string; line: number };

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Collect quoted string literals that are exactly an /app/... path
 * (optionally with query/hash). Template literals with interpolation and
 * prose that merely mentions a path are intentionally skipped, as are
 * ellipsis placeholders like "/app/sales-order/..." used in comments.
 */
function collectAppLinks(): FoundLink[] {
  const found: FoundLink[] = [];
  const linkRe = /["'`](\/app\/[A-Za-z0-9\-_/:]*)(?:[?#][^"'`]*)?["'`]/g;
  for (const file of walk(SRC_ROOT)) {
    if (path.resolve(file) === path.resolve(APP_TSX)) continue; // route declarations themselves
    const text = fs.readFileSync(file, "utf8");
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(text)) !== null) {
      const link = m[1].replace(/\/+$/, "");
      if (!link || link === "/app") continue;
      const line = text.slice(0, m.index).split("\n").length;
      found.push({ link, file: path.relative(SRC_ROOT, file), line });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

describe("frontend link integrity", () => {
  const routes: string[] = extractAbsoluteRoutes(fs.readFileSync(APP_TSX, "utf8"));
  const staticRoutes = new Set(routes.filter((r) => !r.includes(":") && !r.includes("*")));
  const dynamicPatterns = routes
    .filter((r) => r.includes(":") || r.includes("*"))
    .map((r) => routePatternToRegex(r));

  const resolves = (link: string): boolean => {
    if (staticRoutes.has(link)) return true;
    if (dynamicPatterns.some((re) => re.test(link))) return true;
    // A link may be a section prefix that a more specific route serves
    // (e.g. "/app/quotation" — module base paths and workflow prefixes
    // redirect or resolve to a child page).
    for (const r of staticRoutes) {
      if (r.startsWith(`${link}/`)) return true;
    }
    return false;
  };

  it("extracts a sane number of routes from App.tsx", () => {
    expect(routes.length).toBeGreaterThan(200);
  });

  it("every hardcoded /app/... link resolves to a declared route", () => {
    const links = collectAppLinks();
    expect(links.length).toBeGreaterThan(100); // sanity: the scanner is finding links

    const broken = links.filter((l) => !resolves(l.link));
    const summary = broken.map((b) => `${b.link}  (${b.file}:${b.line})`).join("\n");
    expect(broken, `Broken app links (${broken.length}):\n${summary}`).toEqual([]);
  });
});
