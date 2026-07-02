import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { useListState } from "../../shared/useListState";
import { apiFetch } from "../../shared/api";
import { WmsLayout } from "./WmsLayout";

type ScheduledReceipt = {
  id: number;
  purchase_order_line_id: number;
  expected_date: string;
  qty: number;
  status: string;
  goods_receipt_id?: number | null;
  processed_at?: string | null;
};

const STATUS_TABS = [
  { value: "", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "processed", label: "Processed" },
];

export default function ScheduledReceiptsPage() {
  const { page, setPage, statusFilter, setStatusFilter, sort, order, toggleSort, pageSize } = useListState(
    "expected_date",
    25,
    { defaultOrder: "asc", defaultStatus: "" },
  );
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [poLineId, setPoLineId] = createSignal("");
  const [expectedDate, setExpectedDate] = createSignal("");
  const [qty, setQty] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [processingId, setProcessingId] = createSignal<number | null>(null);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => {
    const qs = new URLSearchParams({
      page: String(page()),
      pageSize: String(pageSize),
      sort: sort(),
      order: order(),
    });
    if (statusFilter()) qs.set("status", statusFilter());
    return {
      queryKey: ["wms-scheduled-receipts", page(), pageSize, sort(), order(), statusFilter()],
      queryFn: async () => {
        const res = await apiFetch<ScheduledReceipt[]>(`/api/v1/wms/scheduled-receipts?${qs}`);
        if (!res.success) throw new Error(res.message ?? "Failed to load");
        return { rows: res.data ?? [], total: res.meta?.total ?? 0 };
      },
    };
  });

  const invalidate = () => void client.invalidateQueries({ queryKey: ["wms-scheduled-receipts"] });

  const openNew = () => {
    setPoLineId("");
    setExpectedDate("");
    setQty("");
    setModalOpen(true);
  };

  const save = async () => {
    const lineId = Number(poLineId());
    const quantity = Number(qty());
    if (!lineId || !quantity) {
      toast.warning("PO line ID and quantity are required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch("/api/v1/wms/scheduled-receipts", {
      method: "POST",
      body: JSON.stringify({
        purchase_order_line_id: lineId,
        expected_date: expectedDate() || undefined,
        qty: quantity,
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create scheduled receipt.");
      return;
    }
    toast.success("Scheduled receipt created.");
    setModalOpen(false);
    invalidate();
  };

  const process = async (row: ScheduledReceipt) => {
    setProcessingId(row.id);
    const res = await apiFetch(`/api/v1/wms/scheduled-receipts/${row.id}/process`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setProcessingId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to process receipt.");
      return;
    }
    toast.success("Scheduled receipt processed.");
    invalidate();
  };

  return (
    <WmsLayout>
      <SpreadsheetGrid<ScheduledReceipt>
        columns={[
          { key: "id", header: "ID" },
          { key: "purchase_order_line_id", header: "PO line" },
          { key: "expected_date", header: "Expected date" },
          { key: "qty", header: "Qty" },
          { key: "status", header: "Status" },
          { key: "goods_receipt_id", header: "GR ID" },
          {
            key: "actions",
            header: "",
            sortable: false,
            render: (r) =>
              r.status === "in_progress" ? (
                <button
                  type="button"
                  class="rounded border border-stroke px-2 py-0.5 text-xs font-medium text-brand-600 disabled:opacity-50"
                  disabled={processingId() === r.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    void process(r);
                  }}
                >
                  Process
                </button>
              ) : null,
          },
        ]}
        rows={list.data?.rows ?? []}
        loading={list.isFetching}
        selectedId={selectedId()}
        onSelect={setSelectedId}
        onNew={openNew}
        onEdit={() => {}}
        settingsHref="/app/inventory/wms/scheduled-receipts"
        codeKey="id"
        nameKey="purchase_order_line_id"
        sortKey={sort()}
        sortOrder={order()}
        onSort={toggleSort}
        page={page()}
        pageSize={pageSize}
        total={list.data?.total ?? 0}
        onPageChange={setPage}
        status={statusFilter()}
        onStatusChange={setStatusFilter}
        statusLabel="Status"
        statusOptions={STATUS_TABS}
        onRefresh={invalidate}
      />

      <EntityModal
        open={modalOpen()}
        title="New scheduled receipt"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Purchase order line ID *">
          <input
            type="number"
            class={inputClass}
            value={poLineId()}
            onInput={(e) => setPoLineId(e.currentTarget.value)}
          />
        </Field>
        <Field label="Expected date">
          <input
            type="date"
            class={inputClass}
            value={expectedDate()}
            onInput={(e) => setExpectedDate(e.currentTarget.value)}
          />
        </Field>
        <Field label="Quantity *">
          <input type="number" step="0.01" class={inputClass} value={qty()} onInput={(e) => setQty(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </WmsLayout>
  );
}
