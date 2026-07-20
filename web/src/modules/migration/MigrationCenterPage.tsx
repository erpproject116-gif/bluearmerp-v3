import { createSignal, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { MigrationMappedImportModal } from "./MigrationMappedImportModal";
import type { MigKind } from "../../shared/migrationCsvImport";

const ENTITIES: { kind: MigKind; title: string; blurb: string; href: string }[] = [
  {
    kind: "partners",
    title: "Customers & suppliers",
    blurb: "Import partners from CSV with flexible column mapping (company, kind, contacts, TIN).",
    href: "/app/inventory/partners",
  },
  {
    kind: "items",
    title: "Products / items",
    blurb: "Import item master from another POS or ERP spreadsheet, including prices and tracking flags.",
    href: "/app/inventory/items",
  },
  {
    kind: "accounts",
    title: "Chart of accounts",
    blurb: "Import or update GL accounts by code/name/type from an external COA export.",
    href: "/app/finance/acct-i/chart-of-accounts",
  },
];

export default function MigrationCenterPage() {
  const [kind, setKind] = createSignal<MigKind | null>(null);

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Migration Center</h2>
        <p class="mt-1 max-w-3xl text-sm text-text-secondary">
          Move data from other platforms into Bluearm. Upload CSV files, map their columns to our fields, save mapping
          profiles for repeat imports, then review the destination lists.
        </p>
        <p class="mt-2 text-sm text-text-secondary">
          Tip: finish Chart of Accounts first, then partners, then items — the same order as Setup.
        </p>
      </section>

      <div class="grid gap-4 md:grid-cols-3">
        <For each={ENTITIES}>
          {(e) => (
            <article class="flex flex-col rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <h3 class="font-semibold text-text-primary">{e.title}</h3>
              <p class="mt-2 flex-1 text-sm text-text-secondary">{e.blurb}</p>
              <div class="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                  onClick={() => setKind(e.kind)}
                >
                  Import CSV
                </button>
                <A href={e.href} class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50">
                  Open list
                </A>
              </div>
            </article>
          )}
        </For>
      </div>

      <Show when={kind()}>
        {(k) => (
          <MigrationMappedImportModal
            open
            kind={k()}
            title={`Import ${ENTITIES.find((e) => e.kind === k())?.title ?? k()}`}
            onClose={() => setKind(null)}
            onImported={() => setKind(null)}
          />
        )}
      </Show>
    </div>
  );
}
