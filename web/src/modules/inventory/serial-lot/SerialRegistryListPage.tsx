import { createSignal, onMount, Show } from "solid-js";
import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import {
  useInvalidateSerialLotLists,
  useSerialUnitList,
  type SerialUnitRow,
} from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";
import { SerialRegisterModal } from "./SerialRegisterModal";
import { SerialGenerateModal } from "./SerialGenerateModal";
import {
  defaultSerialRegistryFilters,
  serialStatusLabel,
  type SerialRegistryFilters,
} from "./serialRegistryFilters";
import { SerialRegistryListFilter } from "./SerialRegistryListFilter";
import { InlineTip } from "../../../shared/inlineGuides";

export default function SerialRegistryListPage() {
  const invalidate = useInvalidateSerialLotLists();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [draftFilters, setDraftFilters] = createSignal<SerialRegistryFilters>(defaultSerialRegistryFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SerialRegistryFilters>(defaultSerialRegistryFilters());
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("created_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [registerOpen, setRegisterOpen] = createSignal(false);
  const [generateOpen, setGenerateOpen] = createSignal(false);
  const [urlFilterActive, setUrlFilterActive] = createSignal(false);
  const pageSize = 25;

  const list = useSerialUnitList(() => {
    const f = submittedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      q: f.q || undefined,
      serial_no: f.serial_no || undefined,
      status: f.status || undefined,
      origin: f.origin || undefined,
      item_id: f.item_id ?? undefined,
      location_id: f.location_id ?? undefined,
      warranty_end_from: f.warranty_end_from || undefined,
      warranty_end_to: f.warranty_end_to || undefined,
      enabled: true,
    };
  });

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    invalidate();
  };

  onMount(() => {
    const one = (key: string) => {
      const v = searchParams[key];
      return typeof v === "string" ? v.trim() : "";
    };
    const q = one("q");
    const itemId = Number(one("item_id"));
    const locationId = Number(one("location_id"));
    const status = one("status");
    if (!q && !(itemId > 0) && !(locationId > 0) && !status) return;
    const next: SerialRegistryFilters = {
      ...defaultSerialRegistryFilters(),
      q: q || "",
      item_id: itemId > 0 ? itemId : null,
      location_id: locationId > 0 ? locationId : null,
      status: status || "",
    };
    setDraftFilters(next);
    setSubmittedFilters(next);
    setUrlFilterActive(true);
  });

  const reset = () => {
    const defaults = defaultSerialRegistryFilters();
    setDraftFilters(defaults);
    setSubmittedFilters(defaults);
    setPage(1);
    setUrlFilterActive(false);
    navigate("/app/inventory/serial-lot/registry", { replace: true });
    invalidate();
  };

  const filterBannerText = () => {
    const f = submittedFilters();
    const parts: string[] = [];
    if (f.q) parts.push(f.q);
    if (f.item_id) parts.push(`item #${f.item_id}`);
    if (f.location_id) parts.push(`location #${f.location_id}`);
    if (f.status) parts.push(serialStatusLabel(f.status));
    return parts.length ? parts.join(" · ") : "";
  };

  const toggleSort = (key: string) => {
    if (sort() === key) setOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setOrder("asc");
    }
  };

  const fmtDate = (v?: string | null) => (v ? v.slice(0, 10) : "—");

  return (
    <SerialLotLayout>
      <InlineTip class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p class="font-medium">Prefer Purchase Receive for inbound serials</p>
        <p class="mt-1 text-amber-900/90">
          Confirming a Purchase Receive posts stock and serials. Use Registry to find and manage units — Generate is for allocating
          numbers only, not receiving goods.
        </p>
        <A
          href="/app/purchases/purchase-receive/new"
          class="mt-2 inline-block rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
        >
          Use Purchase Receive
        </A>
      </InlineTip>
      <Show when={urlFilterActive() && filterBannerText()}>
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-950">
          <p>
            <span class="font-medium">Filtered:</span> {filterBannerText()}
          </p>
          <button
            type="button"
            class="rounded-lg border border-brand-300 bg-white px-3 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
            onClick={reset}
          >
            Clear filters
          </button>
        </div>
      </Show>
      <div class="mb-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm text-text-secondary shadow-sm hover:bg-slate-50"
          onClick={() => setGenerateOpen(true)}
        >
          Generate serials / print labels
        </button>
      </div>
      <SerialRegistryListFilter
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={search}
        onReset={reset}
      />

      <Show when={!list.isFetching && (list.data?.total ?? 0) === 0}>
        <p class="mb-3 rounded-lg border border-dashed border-stroke bg-slate-50 px-4 py-3 text-sm text-text-secondary">
          No serials match. For inbound stock, complete a{" "}
          <A href="/app/purchases/purchase-receive" class="font-medium text-brand-700 hover:underline">
            Purchase Receive
          </A>{" "}
          first — units appear here after confirm.
        </p>
      </Show>
      <div class="mt-6">
        <SpreadsheetGrid<SerialUnitRow>
          columns={[
            {
              key: "serial_no",
              header: "Serial no.",
              clickable: true,
              render: (r) => (
                <A
                  href={`/app/inventory/serial-lot/trace?serial_no=${encodeURIComponent(r.serial_no)}`}
                  class="text-brand-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {r.serial_no}
                </A>
              ),
            },
            { key: "item_code", header: "Item code" },
            { key: "item_name", header: "Item name" },
            { key: "status", header: "Status", render: (r) => serialStatusLabel(r.status) },
            { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
            { key: "partner_name", header: "Partner", render: (r) => r.partner_name || "—" },
            { key: "warranty_end", header: "Warranty end", render: (r) => fmtDate(r.warranty_end) },
            { key: "purchase_order_no", header: "PO no.", render: (r) => r.purchase_order_no ?? "—" },
            { key: "received_at", header: "Received", render: (r) => fmtDate(r.received_at) },
            {
              key: "trace",
              header: "Trace",
              sortable: false,
              render: (r) => (
                <A
                  href={`/app/inventory/serial-lot/trace?serial_no=${encodeURIComponent(r.serial_no)}`}
                  class="text-brand-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Trace
                </A>
              ),
            },
            {
              key: "history",
              header: "History",
              sortable: false,
              render: (r) => (
                <ActivityHistoryLink module="serial-lot" targetType="inv_serial_unit" targetId={r.id} title={`History — ${r.serial_no}`} />
              ),
            },
          ]}
          rows={list.data?.rows ?? []}
          loading={list.isFetching}
          selectedId={selectedId()}
          onSelect={setSelectedId}
          codeKey="serial_no"
          nameKey="item_name"
          sortKey={sort()}
          sortOrder={order()}
          onSort={toggleSort}
          page={page()}
          pageSize={pageSize}
          total={list.data?.total ?? 0}
          onPageChange={setPage}
          onRefresh={invalidate}
          onNew={() => setRegisterOpen(true)}
          onEdit={() => {}}
        />
      </div>

      <SerialRegisterModal
        open={registerOpen()}
        onClose={() => setRegisterOpen(false)}
        onSaved={invalidate}
      />
      <SerialGenerateModal
        open={generateOpen()}
        onClose={() => setGenerateOpen(false)}
        onGenerated={() => invalidate()}
      />
    </SerialLotLayout>
  );
}
