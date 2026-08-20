import { searchHelp } from "../modules/help-assistant/helpSearch";
import { searchCatalog, type NavCatalogEntry } from "./navCatalog";

export type PaletteItem =
  | { kind: "nav"; entry: NavCatalogEntry }
  | { kind: "help"; title: string; detail: string; href: string }
  | { kind: "ask"; query: string }
  | { kind: "goto"; path: string }
  | { kind: "sitemap"; query: string };

/** Accept `/app/...` or `app/...` paths typed literally in the palette. */
export function normalizePalettePath(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const base = t.split(/[?#]/)[0]?.trim();
  if (!base) return null;
  if (base.startsWith("/app/")) return base;
  if (base.startsWith("app/")) return `/${base}`;
  return null;
}

export function paletteItemLabel(item: PaletteItem): string {
  switch (item.kind) {
    case "nav":
      return item.entry.label;
    case "help":
      return item.title;
    case "ask":
      return `Ask Baiko: “${item.query}”`;
    case "goto":
      return `Go to ${item.path}`;
    case "sitemap":
      return `Search all menus for “${item.query}”`;
  }
}

export function paletteItemGroup(item: PaletteItem): string {
  switch (item.kind) {
    case "nav":
      return item.entry.group;
    case "help":
      return "Help";
    case "ask":
      return "Baiko";
    case "goto":
      return "Go to";
    case "sitemap":
      return "Site map";
  }
}

export function paletteItemDetail(item: PaletteItem): string | undefined {
  if (item.kind === "help") return item.detail;
  return undefined;
}

export function buildPaletteResults(opts: {
  query: string;
  catalog: NavCatalogEntry[];
  quickActions: NavCatalogEntry[];
  recent: NavCatalogEntry[];
  pathname: string;
  canAccess: (href: string) => boolean;
}): PaletteItem[] {
  const needle = opts.query.trim();
  if (!needle) {
    const recent = opts.recent;
    if (recent.length > 0) return recent.map((entry) => ({ kind: "nav", entry }));
    return opts.catalog.slice(0, 10).map((entry) => ({ kind: "nav", entry }));
  }

  const out: PaletteItem[] = [{ kind: "ask", query: needle }];

  const path = normalizePalettePath(needle);
  if (path) out.push({ kind: "goto", path });

  out.push({ kind: "sitemap", query: needle });

  const actionHits = searchCatalog(opts.quickActions, needle, 6);
  const navHits = searchCatalog(opts.catalog, needle, 12);
  const seen = new Set<string>();
  for (const entry of [...actionHits, ...navHits]) {
    if (seen.has(entry.href)) continue;
    if (!opts.canAccess(entry.href)) continue;
    seen.add(entry.href);
    out.push({ kind: "nav", entry });
  }

  for (const hit of searchHelp(needle, opts.pathname, 5, 0.75)) {
    out.push({
      kind: "help",
      title: hit.chunk.title,
      detail: hit.snippet,
      href: hit.chunk.href,
    });
  }

  return out;
}
