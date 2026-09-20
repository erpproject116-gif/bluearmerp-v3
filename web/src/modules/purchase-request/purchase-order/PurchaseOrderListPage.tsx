import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { hasDocSeed } from "../../../shared/docSeed";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { GenerateOtherSlipsMenu } from "../../../shared/GenerateOtherSlipsMenu";
import { useTransactionListState } from "../../../shared/useListState";
import {
  confirmPurchaseOrder,
  createPurchaseOrderFromRequest,
  createPurchaseOrderFromSupplierQuotation,
  unconfirmPurchaseOrder,
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
import { PURCHASE_REQUEST_SETTINGS_HREF } from "../../../shared/entityTypes";
import { showBlockerResult, handleSaveResult } from "../../../shared/handleSaveResult";
import { toastAttachmentRequired } from "../../../shared/useProcessPolicy";
import { InlineTip } from "../../../shared/inlineGuides";
import { keepProgressRowVisible } from "../../../shared/keepProgressRowVisible";

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
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't create the purchase order. Try again." });
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
      showBlockerResult(res, toast, { fallbackTitle: "Couldn't create the purchase order. Try again." });
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
  const [searchParams, setSearchParams] = useSearchParams();
  const auth = useAuth();
  const invalidate = useInvalidatePurchaseOrders();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useTransactionListState(
    "updated_at",
    25,
  );
  const [operationalFilter, setOperationalFilter] = createSignal("");

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [fromPrOpen, setFromPrOpen] = createSignal(false);
  const [fromSqOpen, setFromSqOpen] = createSignal(false);
  const [poModalOpen, setPoModalOpen] = createSignal(false);
  const [editingPoId, setEditingPoId] = createSignal<number | null>(null);
  const [viewingDeleted, setViewingDeleted] = createSignal(false);

  // Baiko approve-to-seed handoff: a staged PO seed auto-opens the create modal.
  onMount(() => {
    if (hasDocSeed("purchase_order")) {
      setEditingPoId(null);
      setViewingDeleted(false);
      setPoModalOpen(true);
    }
    const openId = Number(searchParams.openId ?? "");
    if (openId > 0) {
      setEditingPoId(openId);
      setViewingDeleted(false);
      setPoModalOpen(true);
      setSearchParams({ openId: undefined }, { replace: true });
    }
    if (searchParams.new === "1" || searchParams.new === "true") {
      setEditingPoId(null);
      setViewingDeleted(false);
      setPoModalOpen(true);
      setSearchParams({ new: undefined }, { replace: true });
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

  /** New POs are draft + unconfirmed. Leave filters on Completed / Confirmed / Open POs
   * and the row looks like it never saved. Always return to the full list after a write. */
  const afterWrite = () => {
    setStatusFilter("");
    setOperationalFilter("");
    setPage(1);
    invalidate();
  };

  const onConfirm = async (row: PurchaseOrderRow) => {
    const res = await confirmPurchaseOrder(row.id);
    if (!res.success) {
      const attachMsg = res.errors?.attachments;
      if (attachMsg) {
        toastAttachmentRequired(toast, "purchase_order", attachMsg);
        return;
      }
      handleSaveResult(res, toast);
      return;
    }
    toast.success("Purchase order confirmed. Progress is now Completed — you can bill it from Purchases Load Slip.");
    keepProgressRowVisible(statusFilter(), setStatusFilter, "completed");
    afterWrite();
  };

  const onUnconfirm = async (row: PurchaseOrderRow) => {
    const res = await unconfirmPurchaseOrder(row.id);
    if (!res.success) {
      handleSaveResult(res, toast);
      return;
    }
    toast.success("Purchase order unconfirmed. Open it to edit and Save changes.");
    keepProgressRowVisible(statusFilter(), setStatusFilter, "unconfirmed");
    afterWrite();
  };

  const openPo = async (row: PurchaseOrderRow) => {
    const deleted = await lifecycle.resolveDeleted(row.id);
    setViewingDeleted(deleted);
    setEditingPoId(row.id);
    setPoModalOpen(true);
  };

  return (
    <PurchaseRequestLayout>
      <InlineTip tipId="po-list-receive-tip" class="mb-3 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-xs text-slate-700">
        <p class="font-medium text-slate-800">Buy path: Purchase Order → Purchase Receive → Payment Made</p>
        <p class="mt-1">
          After the PO, open <span class="font-medium">Purchase Receive</span> (Load Slip → Purchase Order), set qty, scan
          serials, attach DR / vendor SI, and confirm — stock and AP post together. Pay from Disbursements / Payment
          Voucher. Separate Receive history is legacy only.
        </p>
      </InlineTip>
      <Show when={(statusFilter() !== "" || operationalFilter() !== "") && (list.data?.total ?? 0) === 0 && !list.isFetching}>
        <div class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          Nothing matches these filters. New purchase orders start as{" "}
          <span class="font-medium">Unconfirmed</span> drafts — set Progress and Fulfillment to All to see them.
          The <span class="font-medium">Open POs</span> tab only lists confirmed orders.
          <button
            type="button"
            class="ml-2 font-medium text-brand-700 underline"
            onClick={() => {
              setStatusFilter("");
              setOperationalFilter("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
      </Show>
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
          href="/app/purchases/purchase-receive/new"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Purchase Receive
        </A>
        <A
          href="/app/purchases/purchase-receive?view=history"
          class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
          title="Legacy receive history — prefer Purchase Receive for stock + serials"
        >
          Receive history
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
            key: "grand_total",
            header: "Total Amount",
            render: (r) => formatMoney(r.grand_total, r.currency_code),
          },
          {
            key: "progress_status",
            header: "Progress",
            sortable: false,
            render: (r) => (
              <Show
                when={r.status === "draft"}
                fallback={
                  <Show
                    when={r.status === "confirmed" && (r.pct_received ?? 0) <= 0 && (r.pct_billed ?? 0) <= 0}
                    fallback={<span>{docProgressStatusLabel(r.progress_status)}</span>}
                  >
                    <button
                      type="button"
                      class="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                      title="Return to draft so you can edit and Save"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onUnconfirm(r);
                      }}
                    >
                      Confirmed → Unconfirm
                    </button>
                  </Show>
                }
              >
                <button
                  type="button"
                  class="rounded border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-100"
                  title="Confirm this PO (requires attachment if Process / Form settings say so)"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onConfirm(r);
                  }}
                >
                  Unconfirmed → Confirm
                </button>
              </Show>
            ),
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
              <Show
                when={r.status === "draft"}
                fallback={
                  <Show
                    when={r.status === "confirmed" && (r.pct_received ?? 0) <= 0 && (r.pct_billed ?? 0) <= 0}
                    fallback={<span class="text-text-secondary">—</span>}
                  >
                    <button
                      type="button"
                      class="text-amber-800 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void onUnconfirm(r);
                      }}
                    >
                      Unconfirm
                    </button>
                  </Show>
                }
              >
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
        settingsHref={PURCHASE_REQUEST_SETTINGS_HREF.purchaseOrder}
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
                if (id) navigate(`/app/purchases/purchase-receive?openId=${id}`);
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
        onCreated={afterWrite}
      />
      <CreateFromSupplierQuotationModal
        open={fromSqOpen()}
        onClose={() => setFromSqOpen(false)}
        onCreated={afterWrite}
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
        onSaved={afterWrite}
      />
      <lifecycle.Dialog />
      <lifecycle.BulkDialog />
    </PurchaseRequestLayout>
  );
}
