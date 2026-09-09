import { createSignal, onMount, Show } from "solid-js";
import { A, useNavigate } from "@solidjs/router";
import { CollapsibleFilterPanel } from "../../../shared/CollapsibleFilterPanel";
import { DateInput } from "../../../shared/DateInput";
import { downloadReportCsv } from "../../../shared/reports/downloadReportCsv";
import { Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { inventoryRefLink } from "../../../shared/inventoryRefLink";
import {
  defaultLotBookDateRange,
  lotBookExportUrl,
  useLotBookReport,
  type LotBookDetailRow,
  type LotBookFilters,
  type LotBookSummaryRow,
} from "../../../shared/useLotReports";
import { SerialLotLayout } from "./SerialLotLayout";
import { InvBookFamilyNav } from "../InvBookFamilyNav";

function defaultFilters(): LotBookFilters {
  const range = defaultLotBookDateRange();
  return {
    view: "general",
    ...range,
    q: "",
    lot_no: "",
    event_type: "",
    inventory_qty: "",
    include_transfers: false,
    exclude_no_tx: true,
  };
}

function withRowIds<T extends object>(rows: T[], page: number, pageSize: number): (T & { id: number })[] {
  return rows.map((r, i) => ({ ...r, id: page * pageSize + i + 1 }));
}

export default function LotBookReportPage() {
  const navigate = useNavigate();
  const [draft, setDraft] = createSignal<LotBookFilters>(defaultFilters());
  const [submitted, setSubmitted] = createSignal<LotBookFilters>(defaultFilters());
  const [runId, setRunId] = createSignal(0);
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("created_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const pageSize = 25;

  const goToLot = (row: { lot_no: string }) =>
    navigate(`/app/inventory/serial-lot/lots?q=${encodeURIComponent(row.lot_no)}`);

  const report = useLotBookReport(() => {
    const f = submitted();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      filters: f,
      enabled: true,
      runId: runId(),
    };
  });

  const patch = (p: Partial<LotBookFilters>) => setDraft((prev) => ({ ...prev, ...p }));

  const search = () => {
    setSubmitted({ ...draft() });
    setPage(1);
    setRunId((n) => n + 1);
  };

  const reset = () => {
    const defaults = defaultFilters();
    setDraft(defaults);
    setSubmitted(defaults);
    setPage(1);
    setRunId((n) => n + 1);
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") {
        e.preventDefault();
        search();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const isSummary = () => (submitted()?.view ?? "general") === "summary";

  return (
    <SerialLotLayout>
      <InvBookFamilyNav active="lot" />
      <CollapsibleFilterPanel
        title="Lot Inv. Book"
        description="Lot movement history (slip ledger) — increase / release / running qty. For on-hand by branch use Inv. Balance by Location. Search (F8)."
        actions={
          <>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              disabled={report.isFetching}
              onClick={search}
            >
              {report.isFetching ? "Running…" : "Search (F8)"}
            </button>
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50" onClick={reset}>
              Reset
            </button>
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
              onClick={() => void downloadReportCsv(lotBookExportUrl(submitted()), "lot-inv-book.csv")}
            >
              Export CSV
            </button>
          </>
        }
      >
        <div class="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view !== "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "general" })}
          >
            General
          </button>
          <button
            type="button"
            class={`rounded-lg px-3 py-1.5 text-sm ${draft().view === "summary" ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
            onClick={() => patch({ view: "summary" })}
          >
            Summary by Lot No.
          </button>
        </div>
        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Field label="Date from">
            <DateInput value={draft().date_from} onInput={(e) => patch({ date_from: e.currentTarget.value })} />
          </Field>
          <Field label="Date to">
            <DateInput value={draft().date_to} onInput={(e) => patch({ date_to: e.currentTarget.value })} />
          </Field>
          <Field label="Keyword">
            <input class={inputClass} value={draft().q ?? ""} onInput={(e) => patch({ q: e.currentTarget.value })} placeholder="Lot, item…" />
          </Field>
          <Field label="Lot no.">
            <input class={inputClass} value={draft().lot_no ?? ""} onInput={(e) => patch({ lot_no: e.currentTarget.value })} />
          </Field>
          <Field label="Item ID">
            <input
              type="number"
              class={inputClass}
              value={draft().item_id ?? ""}
              onInput={(e) => patch({ item_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
            />
          </Field>
          <Field label="Location ID">
            <input
              type="number"
              class={inputClass}
              value={draft().location_id ?? ""}
              onInput={(e) => patch({ location_id: e.currentTarget.value ? Number(e.currentTarget.value) : undefined })}
            />
          </Field>
          <Field label="Event type">
            <select
              class={inputClass}
              value={draft().event_type ?? ""}
              onChange={(e) => patch({ event_type: e.currentTarget.value || undefined })}
            >
              <option value="">All</option>
              <option value="received">Received</option>
              <option value="returned">Returned</option>
              <option value="produced">Produced</option>
              <option value="sold">Sold</option>
              <option value="consumed">Consumed</option>
              <option value="voided">Voided</option>
              <option value="transferred">Location transfer</option>
            </select>
          </Field>
          <Field label="Inventory qty (summary)">
            <select
              class={inputClass}
              value={draft().inventory_qty ?? ""}
              onChange={(e) => patch({ inventory_qty: e.currentTarget.value || undefined })}
            >
              <option value="">All</option>
              <option value="1">1 (in stock)</option>
              <option value="0">0 (zero)</option>
              <option value="others">Others</option>
            </select>
          </Field>
          <Field label="Validity from">
            <DateInput value={draft().validity_from ?? ""} onInput={(e) => patch({ validity_from: e.currentTarget.value || undefined })} />
          </Field>
          <Field label="Validity to">
            <DateInput value={draft().validity_to ?? ""} onInput={(e) => patch({ validity_to: e.currentTarget.value || undefined })} />
          </Field>
        </div>
        <div class="mt-4 flex flex-wrap gap-4 text-sm text-text-secondary">
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(draft().include_transfers)}
              onChange={(e) => patch({ include_transfers: e.currentTarget.checked })}
            />
            Include location transfers
          </label>
          <label class="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft().exclude_no_tx !== false}
              onChange={(e) => patch({ exclude_no_tx: e.currentTarget.checked })}
            />
            Exclude lots without transactions
          </label>
        </div>
      </CollapsibleFilterPanel>

      <div class="mt-6">
        <Show
          when={isSummary()}
          fallback={
            <SpreadsheetGrid<LotBookDetailRow>
              columns={[
                { key: "created_at", header: "When", render: (r) => r.created_at.slice(0, 19).replace("T", " ") },
                { key: "lot_no", header: "Lot no.", clickable: true },
                { key: "item_code", header: "Item code" },
                { key: "item_name", header: "Item name" },
                { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
                {
                  key: "terms_of_validity",
                  header: "Terms of validity",
                  render: (r) => r.terms_of_validity || "—",
                },
                { key: "slip_type", header: "Slip type" },
                { key: "partner_name", header: "Customer/Vendor", render: (r) => r.partner_name || "—" },
                { key: "increase_qty", header: "Increase", render: (r) => String(r.increase_qty) },
                { key: "release_qty", header: "Release qty", render: (r) => String(r.release_qty) },
                { key: "inventory_qty", header: "Inventory qty", render: (r) => String(r.inventory_qty) },
                {
                  key: "ref_type",
                  header: "Linked slip",
                  render: (r) => {
                    const link = inventoryRefLink(r.ref_type, r.ref_id);
                    return link.href ? (
                      <A class="text-brand-600 hover:underline" href={link.href}>
                        {link.label}
                      </A>
                    ) : (
                      link.label
                    );
                  },
                },
              ]}
              rows={(report.data?.rows ?? []) as LotBookDetailRow[]}
              loading={report.isFetching}
              selectedId={selectedId()}
              onSelect={setSelectedId}
              codeKey="lot_no"
              nameKey="slip_type"
              sortKey={sort()}
              sortOrder={order()}
              onSort={toggleSort}
              page={page()}
              pageSize={pageSize}
              total={report.data?.total ?? 0}
              onPageChange={setPage}
              onRefresh={search}
              onNew={() => {}}
              onEdit={goToLot}
              showNew={false}
            />
          }
        >
          <SpreadsheetGrid<LotBookSummaryRow & { id: number }>
            columns={[
              { key: "lot_no", header: "Lot no.", clickable: true },
              { key: "item_code", header: "Item code" },
              { key: "item_name", header: "Item name" },
              { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
              { key: "opening_qty", header: "Opening", render: (r) => String(r.opening_qty) },
              { key: "received_qty", header: "Received", render: (r) => String(r.received_qty) },
              { key: "issued_qty", header: "Issued", render: (r) => String(r.issued_qty) },
              { key: "closing_qty", header: "Closing", render: (r) => String(r.closing_qty) },
            ]}
            rows={withRowIds((report.data?.rows ?? []) as LotBookSummaryRow[], page(), pageSize)}
            loading={report.isFetching}
            selectedId={selectedId()}
            onSelect={setSelectedId}
            codeKey="lot_no"
            nameKey="item_name"
            sortKey={sort()}
            sortOrder={order()}
            onSort={toggleSort}
            page={page()}
            pageSize={pageSize}
            total={report.data?.total ?? 0}
            onPageChange={setPage}
            onRefresh={search}
            onNew={() => {}}
            onEdit={goToLot}
            showNew={false}
          />
        </Show>
      </div>
    </SerialLotLayout>
  );
}
