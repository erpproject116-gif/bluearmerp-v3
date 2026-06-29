import { A } from "@solidjs/router";
import { createSignal } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { PURCHASE_REQUEST_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useGoodsReceiptList,
  useInvalidateGoodsReceipts,
  type GoodsReceiptRow,
} from "../../../shared/useGoodsReceiptList";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
  { value: "reversed", label: "Reversed" },
];

function statusLabel(status: string): string {
  return STATUS_TABS.find((t) => t.value === status)?.label ?? status.replace(/_/g, " ");
}

export default function GoodsReceiptListPage() {
  const invalidate = useInvalidateGoodsReceipts();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "receipt_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );

  const [selectedId, setSelectedId] = createSignal<number | null>(null);

  const list = useGoodsReceiptList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  return (
    <PurchaseRequestLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Goods Receipt List</h2>
          <p class="text-sm text-text-secondary">Goods receipts created from purchase orders.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/inventory/serial-lot/receive"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Receive goods
          </A>
          <A
            href="/app/purchase-request/purchase-orders"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Purchase orders
          </A>
        </div>
      </div>

      <SpreadsheetGrid<GoodsReceiptRow>
        columns={[
          { key: "receipt_date", header: "Receipt date", clickable: true },
          { key: "purchase_order_no", header: "PO no.", clickable: true },
          { key: "location_name", header: "Location" },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => <span class="capitalize">{statusLabel(r.status)}</span>,
          },
          { key: "reference", header: "Reference" },
          { key: "created_by_name", header: "Created by" },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={() => {}}
        onEdit={() => {}}
        settingsHref={PURCHASE_REQUEST_SETTINGS_HREF.purchaseRequest}
        codeKey="purchase_order_no"
        nameKey="receipt_date"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search PO no., reference, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />
    </PurchaseRequestLayout>
  );
}
