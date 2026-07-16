import { createSignal, Show } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import {
  useInvalidateSerialLotLists,
  useSerialUnitList,
  type SerialUnitRow,
} from "../../../shared/useSerialLotList";
import { SerialLotLayout } from "./SerialLotLayout";
import { SerialRegisterModal } from "./SerialRegisterModal";
import {
  defaultSerialRegistryFilters,
  serialStatusLabel,
  type SerialRegistryFilters,
} from "./serialRegistryFilters";
import { SerialRegistryListFilter } from "./SerialRegistryListFilter";

export default function SerialRegistryListPage() {
  const invalidate = useInvalidateSerialLotLists();

  const [draftFilters, setDraftFilters] = createSignal<SerialRegistryFilters>(defaultSerialRegistryFilters());
  const [submittedFilters, setSubmittedFilters] = createSignal<SerialRegistryFilters | null>(null);
  const [page, setPage] = createSignal(1);
  const [sort, setSort] = createSignal("created_at");
  const [order, setOrder] = createSignal<"asc" | "desc">("desc");
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [registerOpen, setRegisterOpen] = createSignal(false);
  const pageSize = 25;

  const list = useSerialUnitList(() => {
    const f = submittedFilters();
    return {
      page: page(),
      pageSize,
      sort: sort(),
      order: order(),
      q: f?.q || undefined,
      serial_no: f?.serial_no || undefined,
      status: f?.status || undefined,
      origin: f?.origin || undefined,
      item_id: f?.item_id ?? undefined,
      location_id: f?.location_id ?? undefined,
      warranty_end_from: f?.warranty_end_from || undefined,
      warranty_end_to: f?.warranty_end_to || undefined,
      enabled: f != null,
    };
  });

  const search = () => {
    setSubmittedFilters({ ...draftFilters() });
    setPage(1);
    invalidate();
  };

  const reset = () => {
    setDraftFilters(defaultSerialRegistryFilters());
    setSubmittedFilters(null);
    setPage(1);
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
      <SerialRegistryListFilter
        value={draftFilters}
        onChange={setDraftFilters}
        onSearch={search}
        onReset={reset}
      />

      <Show when={submittedFilters()}>
        <div class="mt-6">
          <SpreadsheetGrid<SerialUnitRow>
            columns={[
              { key: "serial_no", header: "Serial no.", clickable: true },
              { key: "item_code", header: "Item code" },
              { key: "item_name", header: "Item name" },
              { key: "status", header: "Status", render: (r) => serialStatusLabel(r.status) },
              { key: "location_name", header: "Location", render: (r) => r.location_name || "—" },
              { key: "partner_name", header: "Partner", render: (r) => r.partner_name || "—" },
              { key: "warranty_end", header: "Warranty end", render: (r) => fmtDate(r.warranty_end) },
              { key: "purchase_order_no", header: "PO no.", render: (r) => r.purchase_order_no ?? "—" },
              { key: "received_at", header: "Received", render: (r) => fmtDate(r.received_at) },
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
      </Show>

      <SerialRegisterModal
        open={registerOpen()}
        onClose={() => setRegisterOpen(false)}
        onSaved={invalidate}
      />
    </SerialLotLayout>
  );
}
