import { A } from "@solidjs/router";
import { createMemo, createSignal, For, Show } from "solid-js";
import { appModules } from "../../shell/modules";
import { ECOUNT_TOP_MODULES } from "../../shell/ecount-top-nav";

type CatalogEntry = {
  label: string;
  href: string;
  group: string;
};

function buildCatalog(): CatalogEntry[] {
  const out: CatalogEntry[] = [];
  for (const top of ECOUNT_TOP_MODULES) {
    out.push({ label: top.label, href: top.href, group: "Top module" });
  }
  for (const mod of appModules) {
    out.push({ label: mod.label, href: mod.href, group: mod.label });
    for (const f of mod.features) {
      out.push({ label: `${mod.label} › ${f.label}`, href: f.href, group: mod.label });
    }
    for (const b of mod.subBranches ?? []) {
      out.push({ label: `${mod.label} › ${b.label}`, href: b.href, group: mod.label });
    }
  }
  // Dedupe by href+label
  const seen = new Set<string>();
  return out.filter((e) => {
    const k = `${e.href}|${e.label}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const CATALOG = buildCatalog();

export default function SiteMapPage() {
  const [q, setQ] = createSignal("");
  const filtered = createMemo(() => {
    const needle = q().trim().toLowerCase();
    if (!needle) return CATALOG.slice(0, 80);
    return CATALOG.filter(
      (e) => e.label.toLowerCase().includes(needle) || e.href.toLowerCase().includes(needle),
    ).slice(0, 120);
  });

  return (
    <div class="mx-auto max-w-3xl">
      <h2 class="text-lg font-semibold text-text-primary">Site Map / Search Menu</h2>
      <p class="mt-1 text-sm text-text-secondary">
        Find screens by name across the BluearmERP menu catalog.
      </p>
      <input
        type="search"
        class="mt-4 w-full rounded-lg border border-stroke px-3 py-2 text-sm shadow-sm outline-none focus:border-brand-400"
        placeholder="Search Menu (e.g. Sales List, New Receivable Payment, Serial)"
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        autofocus
      />
      <ul class="mt-4 divide-y divide-stroke rounded-xl border border-stroke bg-white shadow-sm">
        <For each={filtered()}>
          {(e) => (
            <li>
              <A href={e.href} class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-brand-50">
                <span class="min-w-0 truncate text-text-primary">{e.label}</span>
                <span class="shrink-0 text-xs text-text-secondary">{e.group}</span>
              </A>
            </li>
          )}
        </For>
      </ul>
      <Show when={filtered().length === 0}>
        <p class="mt-4 text-sm text-text-secondary">No matches. Try another keyword or open Help &amp; guides.</p>
      </Show>
      <p class="mt-4 text-sm text-text-secondary">
        <A href="/app/dashboard" class="text-brand-600 hover:underline">
          ← Back to MyPage
        </A>
      </p>
    </div>
  );
}
