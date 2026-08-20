import { A, useSearchParams } from "@solidjs/router";
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { buildCatalog, searchCatalog } from "../../shell/navCatalog";

export default function SiteMapPage() {
  const catalog = buildCatalog();
  const [searchParams] = useSearchParams();
  const [q, setQ] = createSignal("");

  createEffect(() => {
    const fromUrl = typeof searchParams.q === "string" ? searchParams.q : "";
    if (fromUrl.trim()) setQ(fromUrl);
  });
  const filtered = createMemo(() => {
    const needle = q().trim();
    if (!needle) return catalog.slice(0, 80);
    return searchCatalog(catalog, needle, 120);
  });

  return (
    <div class="mx-auto max-w-3xl">
      <h2 class="text-lg font-semibold text-text-primary">Site Map / Search Menu</h2>
      <p class="mt-1 text-sm text-text-secondary">
        Find screens by name across the BluearmERP menu catalog.
      </p>
      <input
        type="text"
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
