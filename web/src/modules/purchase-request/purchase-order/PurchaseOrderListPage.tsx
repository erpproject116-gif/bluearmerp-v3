import { A, useNavigate } from "@solidjs/router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { hasDocSeed } from "../../../shared/docSeed";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
import { useListState } from "../../../shared/useListState";
import {
  confirmPurchaseOrder,
  createPurchaseOrderFromRequest,
  createPurchaseOrderFromSupplierQuotation,
  useInvalidatePurchaseOrders,
  usePurchaseOrderList,
  type PurchaseOrderRow,
} from "../../../shared/usePurchaseOrderList";
import { useToast } from "../../../shared/toast";
import { PurchaseOrderModal } from "./PurchaseOrderModal";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";
import { ActivityHistoryLink } from "../../../shared/ActivityHistoryLink";
import { formatMoney } from "../purchase-request/purchaseRequestPrint";
import { DOC_PROGRESS_STATUS_TABS, docProgressStatusLabel } from "../../../shared/docProgressStatusTabs";
import { hasPermission, useAuth } from "../../../shared/auth-context";
import { useDocumentLifecycle } from "../../../shared/documentLifecycle";

const OPERATIONAL_STATUS_TABS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status: string): string {
  return OPERATIONAL_STATUS_TABS.find((t) => t.value === status)?.label ?? status;
}

type PurchaseRequestLookupRow = {
  id: number;
  purchase_request_no: string;
  partner_name: string;
  item_name_summary?: string;
};

type SupplierQuotationLookupRow = {
  id: number;
  quote_no: string;
  status: string;
  line_count: number;
  partner_id: number;
  grand_total: number;
};

async function fetchPurchaseRequests(q: string): Promise<LookupOption[]> {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const qs = new URLSearchParams({
    page: "1",
    pageSize: "20",
    sort: "request_date",
    order: "desc",
    date_from: yearAgo,
    date_to: today,
  });
  if (q) qs.set("q", q);
  const res = await apiFetch<PurchaseRequestLookupRow[]>(`/api/v1/purchase-request/purchase-requests?${qs}`);
  return (res.data ?? []).map((pr) => ({
    id: pr.id,
    label: `${pr.purchase_request_no} — ${pr.partner_name}`,
    sublabel: pr.item_name_summary,
  }));
}

async function fetchSupplierQuotations(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ status: "received" });
  if (q) qs.set("q", q);
  const res = await apiFetch<SupplierQuotationLookupRow[]>(`/api/v1/purchase-order/supplier-quotations?${qs}`);
  return (res.data ?? []).map((sq) => ({
    id: sq.id,
    label: sq.quote_no,
    sublabel: `status: ${sq.status}`,
  }));
}

function CreateFromPrModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [prLabel, setPrLabel] = createSignal("");
  const [prId, setPrId] = createSignal<number | null>(null);
  const [creating, setCreating] = createSignal(false);

  const reset = () => {
    setPrLabel("");
    setPrId(null);
  };

  const create = async () => {
    const id = prId();
    if (!id) {
      toast.warning("Select a purchase request.");
      return;
    }
    setCreating(true);
    const res = await createPurchaseOrderFromRequest(id);
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create purchase order.");
      return;
    }
    toast.success(`Purchase order ${res.data?.purchase_order_no ?? "created"}.`);
    reset();
    props.onCreated();
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-text-primary">Create from Purchase Request</h2>
            <button
              type="button"
              class={modalDismissClass}
              onClick={() => {
                reset();
                props.onClose();
              }}
            >
              Close
            </button>
          </div>
          <LookupCombo
            label="Purchase Request"
            required
            value={prLabel}
            selectedId={prId}
            onInput={setPrLabel}
            onSelect={(o) => {
              setPrId(o.id);
              setPrLabel(o.label);
            }}
            onClear={() => {
              setPrId(null);
              setPrLabel("");
            }}
            fetchOptions={fetchPurchaseRequests}
          />
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                reset();
                props.onClose();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={creating()}
              onClick={() => void create()}
            >
              {creating() ? "Creating…" : "Create purchase order"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

function CreateFromSupplierQuotationModal(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [sqLabel, setSqLabel] = createSignal("");
  const [sqId, setSqId] = createSignal<number | null>(null);
  const [creating, setCreating] = createSignal(false);

  const reset = () => {
    setSqLabel("");
    setSqId(null);
  };

  const create = async () => {
    const id = sqId();
    if (!id) {
      toast.warning("Select a supplier quotation.");
      return;
    }
    setCreating(true);
    const res = await createPurchaseOrderFromSupplierQuotation(id);
    setCreating(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create purchase order.");
      return;
    }
    toast.success(`Purchase order ${res.data?.purchase_order_no ?? "created"}.`);
    reset();
    props.onCreated();
    props.onClose();
  };

  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center">
        <div class="w-full max-w-lg rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-text-primary">Create from Supplier Quotation</h2>
            <button
              type="button"
              class={modalDismissClass}
              onClick={() => {
                reset();
                props.onClose();
              }}
            >
              Close
            </button>
          </div>
          <LookupCombo
            label="Supplier Quotation"
            required
            value={sqLabel}
            selectedId={sqId}
            onInput={setSqLabel}
            onSelect={(o) => {
              setSqId(o.id);
              setSqLabel(o.label);
            }}
            onClear={() => {
              setSqId(null);
              setSqLabel("");
            }}
            fetchOptions={fetchSupplierQuotations}
          />
          <div class="mt-6 flex justify-end gap-2">
            <button
              type="button"
              class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
              onClick={() => {
                reset();
                props.onClose();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              disabled={creating()}
              onClick={() => void create()}
            >
              {creating() ? "Creating…" : "Create purchase order"}
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

export default function PurchaseOrderListPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const auth = useAuth();
  const invalidate = useInvalidatePurchaseOrders();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );
  const [operationalFilter, setOperationalFilter] = createSignal("");

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [fromPrOpen, setFromPrOpen] = createSignal(false);
  const [fromSqOpen, setFromSqOpen] = createSignal(false);
  const [poModalOpen, setPoModalOpen] = createSignal(false);
  const [editingPoId, setEditingPoId] = createSignal<number | null>(null);
  const [viewingDeleted, setViewingDeleted] = createSignal(false);

  // Copilot approve-to-seed handoff: a staged PO seed auto-opens the create modal.
  onMount(() => {
    if (hasDocSeed("purchase_order")) {
      setEditingPoId(null);
      setViewingDeleted(false);
      setPoModalOpen(true);
    }
  });

  const lifecycle = useDocumentLifecycle({
    apiBase: "/api/v1/purchase-order/purchase-orders",
    documentLabel: "purchase order",
    canManage: () => hasPermission(auth.me, "purchase_order.purchase_orders", "write"),
    onChanged: invalidate,
  });

  const selectedIds = createMemo(() => {
    const id = selectedId();
    return id != null ? [id] : [];
  });

  const list = usePurchaseOrderList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: operationalFilter() || undefined,
    progressStatus: statusFilter() || undefined,
    lifecycle: lifecycle.filter(),
  }));

  const onConfirm = async (row: PurchaseOrderRow) => {
    const res = await confirmPurchaseOrder(row.id);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to confirm purchase order.");
      return;
    }
    toast.success("Purchase order confirmed.");
    invalidate();
  };

  const openPo = async (row: PurchaseOrderRow) => {
    const deleted = await lifecycle.resolveDeleted(row.id);
    setViewingDeleted(deleted);
    setEditingPoId(row.id);
    setPoModalOpen(true);
  };

  return (
    <PurchaseRequestLayout>
      <div class="mb-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
        After goods are received and posted, select a PO and use{" "}
        <span class="font-medium">Generate slip → Purchase</span> to create the AP invoice (or post a GR — Purchase is
        created automatically).
      </div>
      <div class="mb-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          onClick={() => setFromPrOpen(true)}
        >
          From purchase request
        </button>
        <button
          type="button"
          class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          onClick={() => setFromSqOpen(true)}
        >
          From supplier quotation
        </button>
        <A
          href="/app/purchase-order/goods-receipt"
          class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
        >
          Goods receipts
        </A>
        <A
          href="/app/inventory/serial-lot/receive"
          class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
        >
          Receive goods
        </A>
      </div>

      <SpreadsheetGrid
        columns={[
          { key: "date_no_display", header: "Date-No", clickable: true },
          { key: "purchase_order_no", header: "PO No.", clickable: true },
          { key: "partner_name", header: "Vendor" },
          { key: "pic_name", header: "PIC" },
          { key: "item_name_summary", header: "Item" },
          {
            key: "pct_received",
            header: "% Received",
            sortable: false,
            render: (r) => <span>{r.pct_received ?? 0}%</span>,
          },
          {
            key: "pct_billed",
            header: "% Billed",
            sortable: false,
            render: (r) => <span>{r.pct_billed ?? 0}%</span>,
          },
          {
            key: "grand_total",
            header: "Total Amount",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
          {
            key: "progress_status",
            header: "Progress",
            sortable: false,
            render: (r) => <span>{docProgressStatusLabel(r.progress_status)}</span>,
          },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => <span class="capitalize">{statusLabel(r.status)}</span>,
          },
          {
            key: "confirm",
            header: "Confirm",
            sortable: false,
            render: (r) => (
              <Show when={r.status === "draft"} fallback={<span class="text-text-secondary">—</span>}>
                <button
                  type="button"
                  class="text-brand-600 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onConfirm(r);
                  }}
                >
                  Confirm
                </button>
              </Show>
            ),
          },
          {
            key: "history",
            header: "History",
            sortable: false,
            render: (r) => (
              <ActivityHistoryLink
                module="purchase_order"
                targetType="po_purchase_order"
                targetId={r.id}
                title={`History — ${r.purchase_order_no}`}
              />
            ),
          },
          {
            key: "lifecycle",
            header: "Manage",
            sortable: false,
            render: (r) => <lifecycle.RowAction id={r.id} label={r.purchase_order_no || r.date_no_display} />,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        selectable
        selectedIds={lifecycle.selectedIds()}
        onSelectionChange={lifecycle.onSelectionChange}
        onEdit={(row) => void openPo(row)}
        onNew={() => {
          setEditingPoId(null);
          setViewingDeleted(false);
          setPoModalOpen(true);
        }}
        newLabel="New Purchase Order"
        codeKey="purchase_order_no"
        nameKey="date_no_display"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        search={q()}
        onSearchChange={setQ}
        searchPlaceholder="Search PO no., vendor, item…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Progress"
        statusOptions={[...DOC_PROGRESS_STATUS_TABS]}
        toolbarExtra={
          <div class="flex flex-wrap items-end gap-2">
            <GenerateOtherSlipsMenu
              sourceEntity="purchase_order"
              targets={[{ label: "Purchase (from posted GRs)", targetEntity: "supplier_invoice" }]}
              selectedIds={selectedIds}
              onSuccess={(result) => {
                invalidate();
                const id = result.target_ids[0];
                if (id) navigate(`/app/purchases/purchases?openId=${id}`);
              }}
            />
            <label class="shrink-0">
              <span class="mb-1 block text-xs font-medium text-text-primary">Fulfillment</span>
              <select
                class="rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm"
                value={operationalFilter()}
                onChange={(e) => {
                  setOperationalFilter(e.currentTarget.value);
                  setPage(1);
                }}
              >
                <For each={OPERATIONAL_STATUS_TABS}>
                  {(opt) => <option value={opt.value}>{opt.label}</option>}
                </For>
              </select>
            </label>
            <lifecycle.BulkToolbar />
            <lifecycle.FilterControl />
          </div>
        }
        onRefresh={invalidate}
      />

      <CreateFromPrModal
        open={fromPrOpen()}
        onClose={() => setFromPrOpen(false)}
        onCreated={invalidate}
      />
      <CreateFromSupplierQuotationModal
        open={fromSqOpen()}
        onClose={() => setFromSqOpen(false)}
        onCreated={invalidate}
      />

      <PurchaseOrderModal
        open={poModalOpen()}
        purchaseOrderId={editingPoId()}
        readOnly={viewingDeleted()}
        lifecycle={lifecycle.filter()}
        onClose={() => {
          setPoModalOpen(false);
          setEditingPoId(null);
          setViewingDeleted(false);
        }}
        onSaved={invalidate}
      />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
    </PurchaseRequestLayout>
  );
}
