import { createMemo, createSignal, onMount } from "solid-js";
import { A, useLocation, useNavigate } from "@solidjs/router";
import { SpreadsheetGrid } from "../../../shared/SpreadsheetGrid";
import { apiFetch } from "../../../shared/api";
import { useListState } from "../../../shared/useListState";
import { useToast } from "../../../shared/toast";
import {
  useDeliveryReceiptList,
  useInvalidateDeliveryReceipts,
  type DeliveryReceiptRow,
} from "../../../shared/useDeliveryReceiptList";
import { SalesOrderLayout } from "../SalesOrderLayout";
import { DeliveryReceiptModal } from "./DeliveryReceiptModal";

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "posted", label: "Posted" },
];

function statusLabel(status: string): string {
  return STATUS_TABS.find((t) => t.value === status)?.label ?? status.replace(/_/g, " ");
}

type PageOptions = { openNewOnMount?: boolean };

export function DeliveryReceiptListPageInner(props: PageOptions = {}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateDeliveryReceipts();
  const { page, setPage, q, setQ, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "delivery_date",
    25,
    { defaultOrder: "desc", defaultStatus: "" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [prefilterSOId, setPrefilterSOId] = createSignal<number | null>(null);
  const [posting, setPosting] = createSignal(false);

  const list = useDeliveryReceiptList(() => ({
    page: page(),
    pageSize,
    sort: sort(),
    order: order(),
    q: q() || undefined,
    status: statusFilter() || undefined,
  }));

  const selectedRow = createMemo(() => list.data?.rows.find((r) => r.id === selectedId()) ?? null);

  const openNew = () => setModalOpen(true);
  const closeModal = () => {
    setModalOpen(false);
    if (loc.pathname.endsWith("/new")) navigate("/app/sales-order/delivery-receipts", { replace: true });
  };

  onMount(() => {
    const params = new URLSearchParams(loc.search);
    const soId = Number(params.get("sales_order_id"));
    if (Number.isFinite(soId) && soId > 0) {
      setPrefilterSOId(soId);
    }
    if (props.openNewOnMount || loc.pathname.endsWith("/new")) openNew();
  });

  const postSelected = async () => {
    const row = selectedRow();
    if (!row) {
      toast.warning("Select a draft delivery receipt to post.");
      return;
    }
    if (row.status !== "draft") {
      toast.warning("Only draft delivery receipts can be posted.");
      return;
    }
    setPosting(true);
    const res = await apiFetch(`/api/v1/sales-order/delivery-receipts/${row.id}/post`, { method: "POST" });
    setPosting(false);
    if (res.success) {
      toast.success("Delivery receipt posted.");
      invalidate();
    } else {
      toast.error(res.message ?? "Failed to post delivery receipt.");
    }
  };

  return (
    <SalesOrderLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-lg font-semibold text-text-primary">Delivery Receipt List</h2>
          <p class="text-sm text-text-secondary">Deliver released sales order quantities to customers.</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={posting() || selectedRow()?.status !== "draft"}
            onClick={() => void postSelected()}
          >
            {posting() ? "Posting…" : "Post selected"}
          </button>
          <A
            href="/app/sales-order/sales-orders/release"
            class="rounded-lg border border-stroke px-4 py-2 text-sm hover:bg-slate-50"
          >
            Release sales order
          </A>
        </div>
      </div>

      <SpreadsheetGrid<DeliveryReceiptRow>
        columns={[
          { key: "date_no_display", header: "Date-no", clickable: true },
          { key: "delivery_no", header: "Delivery no.", clickable: true },
          { key: "partner_name", header: "Customer" },
          { key: "sales_order_no", header: "SO no." },
          {
            key: "status",
            header: "Status",
            sortable: false,
            render: (r) => <span class="capitalize">{statusLabel(r.status)}</span>,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        settingsHref="/app/sales-order/sales-orders/settings"
        codeKey="delivery_no"
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
        searchPlaceholder="Search delivery no., customer…"
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <DeliveryReceiptModal
        open={modalOpen()}
        prefilterSalesOrderId={prefilterSOId()}
        onClose={closeModal}
        onSaved={() => {
          invalidate();
          closeModal();
        }}
      />
    </SalesOrderLayout>
  );
}

export default function DeliveryReceiptListPage() {
  return <DeliveryReceiptListPageInner />;
}
