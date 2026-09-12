import { A, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, Show } from "solid-js";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { ModalFormGuide } from "../../../shared/ModalFormGuide";
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
import { showBlockerResult } from "../../../shared/handleSaveResult";
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
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't reverse this goods receipt. Try again." });
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
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't create the QC request. Try again." });
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
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't update inspection. Try again." });
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
        <div class="space-y-2 text-sm text-text-secondary">
          <p class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            <span class="font-medium">Receive history (legacy).</span> For new stock-in with serials, use{" "}
            <A href="/app/purchases/purchase-receive/new" class="font-medium text-brand-700 hover:underline">
              New Purchase Receive
            </A>
            — confirm posts inventory and AP. This list keeps posted/draft receives for reverse and audit.
          </p>
          <p>
            {uiLabel("goods_receipt.list_description")} Click a row (or PO no.) to open that receive. Pre-invoicing:{" "}
            <A href="/app/purchases/purchase-receive/pre-invoicing" class="text-brand-600 hover:underline">
              open GR not yet billed
            </A>
            ; unpaid Purchase Receive:{" "}
            <A href="/app/purchases/purchase-receive?payment=unpaid" class="text-brand-600 hover:underline">
              Unpaid
            </A>
            .
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <A
            href="/app/purchases/purchase-receive/new"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            New Purchase Receive
          </A>
          <A
            href="/app/inventory/serial-lot/receive"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Legacy receive
          </A>
          <A
            href="/app/purchase-order/purchase-orders"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Purchase orders
          </A>
        </div>
      </div>

      <div class="mb-4">
        <ModalFormGuide guideId="goods_receipt" />
      </div>

      <SpreadsheetGrid<GoodsReceiptRow>
        columns={[
          { key: "receipt_date", header: "Receipt date", clickable: true },
          { key: "purchase_order_no", header: "PO no.", clickable: true },
          { key: "location_name", header: "Location In" },
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
        onNew={() => navigate("/app/purchases/purchase-receive/new")}
        onEdit={(row) => {
          setSelectedId(row.id);
          navigate(`/app/inventory/serial-lot/receive?gr_id=${row.id}`);
        }}
        newLabel={uiLabel("goods_receipt.receive_goods")}
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
            targets={[{ label: "Purchase Receive", targetEntity: "supplier_invoice" }]}
            selectedIds={selectedIds}
            onSuccess={(result) => {
              invalidate();
              const id = result.target_ids[0];
              if (id) navigate(`/app/purchases/purchase-receive?openId=${id}`);
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
