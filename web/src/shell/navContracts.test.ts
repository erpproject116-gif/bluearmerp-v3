/**
 * Nav contracts for the Home sidebar.
 *
 * linkIntegrity.test.ts accepts a link when some *deeper* route exists, so a
 * parent landing like "/app/sales/sales" passes there purely because
 * "/app/sales/sales/new" is declared. That loophole is what let the Sales and
 * Purchase parents ship pointing at the wrong screen. These contracts resolve
 * every sidebar href exactly, and pin the landings a first-time user depends on.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs module without type declarations
import { extractAbsoluteRoutes } from "../../e2e/scripts/extract-app-routes.mjs";
import { HOME_SIDEBAR_AREAS, type HomeSidebarArea } from "./ecount-top-nav";

const SHELL_DIR = __dirname;
const APP_TSX = path.resolve(SHELL_DIR, "..", "App.tsx");

const routes: string[] = extractAbsoluteRoutes(fs.readFileSync(APP_TSX, "utf8"));
const staticRoutes = new Set(routes.filter((r) => !r.includes(":") && !r.includes("*")));
const dynamicRoutes = routes
  .filter((r) => r.includes(":") || r.includes("*"))
  .map((r) => {
    const pattern = r
      .split("/")
      .map((seg) => {
        if (seg.startsWith(":")) return "[^/]+";
        if (seg === "*" || seg.endsWith("*")) return ".*";
        return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("/");
    return new RegExp(`^${pattern}$`);
  });

/** Path a click actually lands on: query and hash dropped, trailing slash trimmed. */
function landingPath(href: string): string {
  return href.split(/[?#]/)[0]!.replace(/\/+$/, "");
}

/** Exact resolution only. A deeper route does not make its ancestor navigable. */
function resolvesExactly(href: string): boolean {
  const p = landingPath(href);
  return staticRoutes.has(p) || dynamicRoutes.some((re) => re.test(p));
}

type Entry = { area: HomeSidebarArea; trail: string };

function flatten(areas: HomeSidebarArea[], parentLabel = ""): Entry[] {
  const out: Entry[] = [];
  for (const area of areas) {
    const trail = parentLabel ? `${parentLabel} > ${area.label}` : area.label;
    out.push({ area, trail });
    if (area.children?.length) out.push(...flatten(area.children, trail));
  }
  return out;
}

const allEntries = flatten(HOME_SIDEBAR_AREAS);
const parents = HOME_SIDEBAR_AREAS.filter((a) => (a.children?.length ?? 0) > 0);

describe("home sidebar nav contracts", () => {
  it("reads a sane route table from App.tsx", () => {
    expect(routes.length).toBeGreaterThan(200);
    expect(allEntries.length).toBeGreaterThan(50);
  });

  it("every sidebar href resolves to a route declared in App.tsx", () => {
    const broken = allEntries
      .filter(({ area }) => !resolvesExactly(area.href))
      .map(({ area, trail }) => `${trail}  ->  ${area.href}`);
    expect(broken, `Sidebar links with no exact route:\n${broken.join("\n")}`).toEqual([]);
  });

  it("every parent landing is navigable on its own, so no child href is ever substituted", () => {
    const unroutable = parents
      .filter((a) => !resolvesExactly(a.href))
      .map((a) => `${a.label} -> ${a.href}`);
    expect(
      unroutable,
      `Parent areas whose own landing does not resolve (SidebarNav would have to fall back to a child):\n${unroutable.join("\n")}`,
    ).toEqual([]);
  });

  it("SidebarNav never rewrites a parent link to one of its children", () => {
    const src = fs.readFileSync(path.join(SHELL_DIR, "SidebarNav.tsx"), "utf8");
    // The shipped bug: parents with no child sharing their href were silently
    // redirected to children[0].href, so "Sales" opened Customers.
    expect(src).not.toMatch(/\bkids\s*\[\s*0\s*\]/);
    expect(src).not.toMatch(/children\s*\(\s*\)\s*\[\s*0\s*\]/);
    expect(src).not.toMatch(/\bparentArea\b/);
  });

  it("Sales lands on the sales list and offers New Sales as a child", () => {
    const sell = HOME_SIDEBAR_AREAS.find((a) => a.id === "sell");
    expect(sell?.href).toBe("/app/sales/sales");
    expect(sell?.children?.find((c) => c.id === "sales")?.href).toBe("/app/sales/sales/new");
    expect(sell && resolvesExactly(sell.href)).toBe(true);
  });

  it("Purchase lands on the purchases list, not on purchase orders", () => {
    const buy = HOME_SIDEBAR_AREAS.find((a) => a.id === "buy");
    expect(buy?.href).toBe("/app/purchases/purchase-receive");
    expect(buy?.children?.find((c) => c.id === "purchases")?.href).toBe(
      "/app/purchases/purchase-receive/new",
    );
    expect(buy?.children?.find((c) => c.id === "purchase_order")?.href).toBe(
      "/app/purchase-order/purchase-orders",
    );
    expect(buy && resolvesExactly(buy.href)).toBe(true);
  });

  it("a parent that repeats its landing does so as its own first child", () => {
    // Repeating the parent landing as the first child is the safe pattern: it
    // guarantees the parent row and its overview row agree. If a later child
    // duplicates the parent instead, the first child is what users hit first.
    const misplaced = parents
      .filter((a) => {
        const kids = a.children ?? [];
        const at = kids.findIndex((k) => k.href === a.href);
        return at > 0;
      })
      .map((a) => `${a.label} (${a.href}) repeats at child #${(a.children ?? []).findIndex((k) => k.href === a.href) + 1}`);
    expect(
      misplaced,
      `Parent landing duplicated by a non-first child:\n${misplaced.join("\n")}`,
    ).toEqual([]);
  });
});
