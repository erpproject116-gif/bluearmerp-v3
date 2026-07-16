import { A, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, Show } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
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
import { uiLabel } from "../../../shared/branding/uiLabel";

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
  const navigate = useNavigate();
  const canInspect = () => hasPermission(auth.me, "quality.gr_inspection", "write");
  const canQc = () => hasPermission(auth.me, "quality.qc_requests", "write");
  const canReverse = () => hasPermission(auth.me, "purchase_order.goods_receipts_reverse", "write");
  const toast = useToast();
  const invalidate = useInvalidateGoodsReceipts();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "receipt_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [inspectingId, setInspectingId] = createSignal<number | null>(null);
  const [qcCreatingId, setQcCreatingId] = createSignal<number | null>(null);
  const [reversingId, setReversingId] = createSignal<number | null>(null);

  const selectedIds = createMemo(() => {
    const id = selectedId();
    return id != null ? [id] : [];
  });

  const reverseReceipt = async (row: GoodsReceiptRow) => {
    if (row.status !== "posted") return;
    const label = row.purchase_order_no || `GR #${row.id}`;
    if (!window.confirm(`Reverse posted goods receipt for ${label}? Stock and serials will be rolled back if allowed.`)) {
      return;
    }
    setReversingId(row.id);
    const res = await apiFetch(`/api/v1/goods-receipt/goods-receipts/${row.id}/reverse`, { method: "POST" });
    setReversingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to reverse goods receipt.");
      return;
    }
    toast.success(res.message ?? "Goods receipt reversed.");
    invalidate();
  };

  const createQcRequest = async (row: GoodsReceiptRow) => {
    setQcCreatingId(row.id);
    const res = await apiFetch("/api/v1/quality/qc-requests", {
      method: "POST",
      body: JSON.stringify({ source_type: "goods_receipt", goods_receipt_id: row.id }),
    });
    setQcCreatingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create QC request.");
      return;
    }
    toast.success("QC request created.");
  };

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
        <p class="text-sm text-text-secondary">
          {uiLabel("goods_receipt.list_description")} Select a posted GR, then{" "}
          <span class="font-medium">Generate slip → Purchase</span> to create the AP invoice. Track open GR lines on{" "}
          <A href="/app/purchases/purchases/pre-invoicing" class="text-brand-600 hover:underline">
            Purchases → Pre-invoicing
          </A>
          , then pay unpaid purchases from{" "}
          <A href="/app/purchases/purchases?payment=unpaid" class="text-brand-600 hover:underline">
            Purchases → Unpaid
          </A>
          .
        </p>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/inventory/serial-lot/receive"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {uiLabel("goods_receipt.receive_goods")}
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
            render: (r) => (
              <div class="flex items-center gap-2">
                <span class="capitalize">{statusLabel(r.status)}</span>
                <Show when={r.status === "posted" && canReverse()}>
                  <button
                    type="button"
                    class="text-xs text-amber-700 hover:underline disabled:opacity-50"
                    disabled={reversingId() === r.id}
                    onClick={(e) => { e.stopPropagation(); void reverseReceipt(r); }}
                  >
                    {reversingId() === r.id ? "Reversing…" : "Reverse"}
                  </button>
                </Show>
              </div>
            ),
          },
          {
            key: "qc",
            header: "QC",
            sortable: false,
            render: (r) => (
              <Show when={canQc()}>
                <button
                  type="button"
                  class="text-xs text-brand-600 hover:underline disabled:opacity-50"
                  disabled={qcCreatingId() === r.id}
                  onClick={(e) => { e.stopPropagation(); void createQcRequest(r); }}
                >
                  {qcCreatingId() === r.id ? "Creating…" : "Create QC Request"}
                </button>
              </Show>
            ),
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
        toolbarExtra={
          <GenerateOtherSlipsMenu
            sourceEntity="goods_receipt"
            targets={[{ label: "Purchase (supplier invoice)", targetEntity: "supplier_invoice" }]}
            selectedIds={selectedIds}
            onSuccess={(result) => {
              invalidate();
              const id = result.target_ids[0];
              if (id) navigate(`/app/purchases/purchases?openId=${id}`);
            }}
          />
        }
      />

      <Show when={selectedId()}>
        <GoodsReceiptScanPanel grId={selectedId()!} onClose={() => setSelectedId(null)} />
      </Show>
    </PurchaseRequestLayout>
  );
}
