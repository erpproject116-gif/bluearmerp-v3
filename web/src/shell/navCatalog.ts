import { appModules } from "./modules";
import { ECOUNT_TOP_MODULES } from "./ecount-top-nav";

export type NavCatalogEntry = {
  label: string;
  href: string;
  group: string;
  keywords?: string[];
};

const PARTNER_FIND_ENTRIES: NavCatalogEntry[] = [
  {
    label: "Customers",
    href: "/app/inventory/partners?kind=customer",
    group: "Sales",
    keywords: ["customer", "customers", "client", "buyer", "partner", "partners"],
  },
  {
    label: "Vendors",
    href: "/app/inventory/partners?kind=vendor",
    group: "Purchase",
    keywords: ["vendor", "vendors", "supplier", "suppliers", "partner", "partners"],
  },
  {
    label: "Customers & vendors",
    href: "/app/inventory/partners",
    group: "Stock",
    keywords: ["partner", "partners", "customer", "vendor", "supplier", "client"],
  },
];

export function buildCatalog(): NavCatalogEntry[] {
  const out: NavCatalogEntry[] = [...PARTNER_FIND_ENTRIES];
  for (const top of ECOUNT_TOP_MODULES) {
    out.push({ label: top.label, href: top.href, group: "Top module" });
  }
  for (const mod of appModules) {
    out.push({ label: mod.label, href: mod.href, group: mod.label });
    for (const f of mod.features) {
      out.push({
        label: `${mod.label} › ${f.label}`,
        href: f.href,
        group: mod.label,
        keywords: f.href.includes("/partners")
          ? ["customer", "customers", "vendor", "vendors", "supplier", "partners", "clients"]
          : undefined,
      });
    }
    for (const b of mod.subBranches ?? []) {
      out.push({ label: `${mod.label} › ${b.label}`, href: b.href, group: mod.label });
    }
  }
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.href}|${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Simple fuzzy score: lower is better; negative means no match. */
export function fuzzyScore(needle: string, hay: string): number {
  const n = needle.trim().toLowerCase();
  const h = hay.toLowerCase();
  if (!n) return 0;
  if (h === n) return 0;
  if (h.startsWith(n)) return 1;
  if (h.includes(n)) return 2 + h.indexOf(n) / 100;
  let hi = 0;
  for (const ch of n) {
    const idx = h.indexOf(ch, hi);
    if (idx < 0) return -1;
    hi = idx + 1;
  }
  return 10 + n.length;
}

function catalogMatchScore(needle: string, entry: NavCatalogEntry): number {
  const parts = [entry.label, entry.href, ...(entry.keywords ?? [])];
  let best = -1;
  for (const part of parts) {
    const score = fuzzyScore(needle, part);
    if (score < 0) continue;
    if (best < 0 || score < best) best = score;
  }
  return best;
}

export function searchCatalog(entries: NavCatalogEntry[], query: string, limit = 12): NavCatalogEntry[] {
  const needle = query.trim();
  if (!needle) return entries.slice(0, limit);
  return entries
    .map((e) => ({
      entry: e,
      score: catalogMatchScore(needle, e),
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score || a.entry.label.localeCompare(b.entry.label))
    .slice(0, limit)
    .map((x) => x.entry);
}
