import { createSignal, For, onMount, Show } from "solid-js";
import { A } from "@solidjs/router";
import { MigrationMappedImportModal } from "./MigrationMappedImportModal";
import { takeMigImportSeed, downloadMigImportTemplate, type MigImportSeed, type MigKind } from "../../shared/migrationCsvImport";
import { useToast } from "../../shared/toast";

type EntityCard = {
  kind: MigKind;
  title: string;
  blurb: string;
  href: string;
  optional?: boolean;
};

const MASTERS: EntityCard[] = [
  {
    kind: "accounts",
    title: "Chart of accounts",
    blurb: "Optional. Import or update GL accounts by code. Skip if the seeded PH chart is enough.",
    href: "/app/finance/acct-i/chart-of-accounts",
    optional: true,
  },
  {
    kind: "partners",
    title: "Customers & suppliers",
    blurb: "Optional. Map company, kind, contacts, TIN. Re-import updates matches instead of duplicating.",
    href: "/app/inventory/partners",
    optional: true,
  },
  {
    kind: "items",
    title: "Products / items",
    blurb: "Optional. Map names, prices, and tracking flags. Match existing items by code or exact name.",
    href: "/app/inventory/items",
    optional: true,
  },
];

const OPENING: EntityCard[] = [
  {
    kind: "opening_stock",
    title: "Opening stock",
    blurb: "Optional. Current on-hand as of go-live (one receipt per location). Serial/lot items are skipped — receive those separately.",
    href: "/app/inventory/stock-entries",
    optional: true,
  },
];

const OPEN_DOCS: EntityCard[] = [
  {
    kind: "open_si",
    title: "Open unpaid sales invoices",
    blurb: "Optional. Remaining customer balances only. Does not deduct stock or create Official Receipts.",
    href: "/app/sales/sales",
    optional: true,
  },
  {
    kind: "open_ap",
    title: "Open unpaid supplier invoices",
    blurb: "Optional. Remaining payables only. Does not create goods receipts.",
    href: "/app/finance/supplier-invoices",
    optional: true,
  },
  {
    kind: "open_po",
    title: "Undelivered purchase orders",
    blurb: "Optional. Outstanding PO qty still expected. Left as draft — do not receive here.",
    href: "/app/purchase-order/purchase-orders",
    optional: true,
  },
  {
    kind: "in_transit",
    title: "In-transit stock",
    blurb: "Optional. Qty still on the van or between warehouses as of go-live.",
    href: "/app/inventory/stock-entries",
    optional: true,
  },
];

function CardGrid(props: { items: EntityCard[]; onImport: (kind: MigKind) => void }) {
  const toast = useToast();
  return (
    <div class="grid gap-4 md:grid-cols-3">
      <For each={props.items}>
        {(e) => (
          <article class="flex flex-col rounded-xl border border-stroke bg-white p-5 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-semibold text-text-primary">{e.title}</h3>
              <Show when={e.optional}>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                  Optional
                </span>
              </Show>
            </div>
            <p class="mt-2 flex-1 text-sm text-text-secondary">{e.blurb}</p>
            <div class="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => props.onImport(e.kind)}
              >
                Import file
              </button>
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
                onClick={() => void downloadMigImportTemplate(e.kind).catch(() => toast.error("Could not download template."))}
              >
                Download template
              </button>
              <A href={e.href} class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50">
                Open list
              </A>
            </div>
          </article>
        )}
      </For>
    </div>
  );
}

export default function MigrationCenterPage() {
  const [kind, setKind] = createSignal<MigKind | null>(null);
  const [seed, setSeed] = createSignal<MigImportSeed | null>(null);

  onMount(() => {
    const staged = takeMigImportSeed();
    if (staged) {
      setSeed(staged);
      setKind(staged.kind);
    }
  });

  const titleFor = (k: MigKind) =>
    [...MASTERS, ...OPENING, ...OPEN_DOCS].find((e) => e.kind === k)?.title ?? k;

  return (
    <div class="space-y-6">
      <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Migration Center</h2>
        <p class="mt-1 max-w-3xl text-sm text-text-secondary">
          Optional helper for new workspaces moving from another system (Zoho, Xero, QuickBooks, SAP, Utak, spreadsheets).
          Skip any step you do not need — you can enter masters and opening balances in the normal screens instead.
        </p>
        <p class="mt-2 text-sm text-text-secondary">
          Suggested order if you do import: accounts → partners → items → bank opening (Banking) → opening stock → unpaid
          invoices. Import remaining unpaid amounts only. Do not import paid history. Official Receipts start at go-live.
        </p>
        <p class="mt-2 text-xs text-text-secondary">
          Mapping Center (document-generation rules) is a different tool. CSV/XLSX column mapping lives only here.
        </p>
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-text-primary">1. Masters (optional)</h3>
        <CardGrid items={MASTERS} onImport={setKind} />
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-text-primary">2. Opening position (optional)</h3>
        <p class="text-xs text-text-secondary">
          Set bank opening balances under{" "}
          <A href="/app/finance/banking" class="text-brand-600 hover:underline">
            Banking
          </A>
          . Opening qty uses a posted stock entry receipt — not stock-adjustment approval.
        </p>
        <CardGrid items={OPENING} onImport={setKind} />
      </section>

      <section class="space-y-3">
        <h3 class="text-sm font-semibold text-text-primary">3. Open documents (optional)</h3>
        <CardGrid items={OPEN_DOCS} onImport={setKind} />
      </section>

      <Show when={kind()}>
        {(k) => (
          <MigrationMappedImportModal
            open
            kind={k()}
            title={`Import ${titleFor(k())}`}
            seed={seed()}
            onClose={() => {
              setKind(null);
              setSeed(null);
            }}
            onImported={() => {
              setKind(null);
              setSeed(null);
            }}
          />
        )}
      </Show>
    </div>
  );
}
