import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { LookupCombo, type LookupOption } from "../../../shared/LookupCombo";
import { modalDismissClass } from "../../../shared/Modal";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { useListState } from "../../../shared/useListState";
import {
  confirmPurchaseOrder,
  createPurchaseOrderFromRequest,
  useInvalidatePurchaseOrders,
  usePurchaseOrderList,
  type PurchaseOrderRow,
} from "../../../shared/usePurchaseOrderList";
import { useToast } from "../../../shared/toast";
import { PurchaseRequestLayout } from "../PurchaseRequestLayout";
import { formatMoney } from "../purchase-request/purchaseRequestPrint";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "confirmed", label: "Confirmed" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status: string): string {
  return STATUS_TABS.find((t) => t.value === status)?.label ?? status;
}

type PurchaseRequestLookupRow = {
  id: number;
  purchase_request_no: string;
  partner_name: string;
  item_name_summary?: string;
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

export default function PurchaseOrderListPage() {
  const toast = useToast();
  const invalidate = useInvalidatePurchaseOrders();

  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "order_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );

  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [fromPrOpen, setFromPrOpen] = createSignal(false);

  const list = usePurchaseOrderList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
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

  return (
    <PurchaseRequestLayout>
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
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onEdit={() => {}}
        onNew={() => setFromPrOpen(true)}
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
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <CreateFromPrModal
        open={fromPrOpen()}
        onClose={() => setFromPrOpen(false)}
        onCreated={invalidate}
      />
    </PurchaseRequestLayout>
  );
}
