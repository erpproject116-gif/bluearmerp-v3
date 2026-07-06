import { A } from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { PURCHASE_REQUEST_SETTINGS_HREF } from "../../../shared/entityTypes";
import { useListState } from "../../../shared/useListState";
import {
  useGoodsReceiptList,
  useInvalidateGoodsReceipts,
  type GoodsReceiptRow,
} from "../../../shared/useGoodsReceiptList";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { GoodsReceiptScanPanel } from "../../../shared/GoodsReceiptScanPanel";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { hasPermission, useAuth } from "../../../shared/auth-context";

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
  const auth = useAuth();
  const canInspect = () => hasPermission(auth.me, "quality.gr_inspection", "write");
  const toast = useToast();
  const invalidate = useInvalidateGoodsReceipts();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "receipt_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [inspectingId, setInspectingId] = createSignal<number | null>(null);

  const patchInspection = async (row: GoodsReceiptRow, status: "held" | "released") => {
    if (row.status !== "draft") return;
    setInspectingId(row.id);
    const res = await apiFetch(`/api/v1/quality/goods-receipts/${row.id}/inspection`, {
      method: "PATCH",
      body: JSON.stringify({ inspection_status: status }),
    });
    setInspectingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update inspection.");
      return;
    }
    toast.success(status === "released" ? "Inspection released." : "Receipt placed on hold.");
    invalidate();
  };

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
            key: "inspection_status",
            header: "Inspection",
            sortable: false,
            render: (r) => (
              <div class="flex items-center gap-2 capitalize">
                <span>{(r.inspection_status ?? "pending").replace(/_/g, " ")}</span>
                <Show when={r.status === "draft" && canInspect()}>
                  <button
                    type="button"
                    class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "released"); }}
                  >
                    Release
                  </button>
                  <button
                    type="button"
                    class="text-xs text-amber-700 hover:underline disabled:opacity-50"
                    disabled={inspectingId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void patchInspection(r, "held"); }}
                  >
                    Hold
                  </button>
                </Show>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => <span class="capitalize">{statusLabel(r.status)}</span>,
          },
          { key: "reference", header: "Reference" },
          { key: "created_by_name", header: "Created by" },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink
                module="purchase_request"
                targetType="gr_goods_receipt"
                targetId={r.id}
                title={`History — ${r.purchase_order_no}`}
              />
            ),
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={() => {}}
        onEdit={() => {}}
        settingsHref={PURCHASE_REQUEST_SETTINGS_HREF.goodsReceipt}
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

      <Show when={selectedId()}>
        <GoodsReceiptScanPanel grId={selectedId()!} onClose={() => setSelectedId(null)} />
      </Show>
    </PurchaseRequestLayout>
  );
}
