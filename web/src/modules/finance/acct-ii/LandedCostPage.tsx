import { createSignal } from "solid-js";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { EntityModal, Field, SpreadsheetGrid, inputClass } from "../../../shared/SpreadsheetGrid";
import { useToast } from "../../../shared/toast";
import { apiFetch } from "../../../shared/api";
import { formatMoney } from "../../../shared/money";
import { useGoodsReceiptList } from "../../../shared/useGoodsReceiptList";
import { AcctIILayout } from "./AcctIILayout";

type LandedCost = {
  id: number;
  goods_receipt_id: number;
  reference?: string | null;
  status: string;
  total_amount: number;
};

export default function LandedCostPage() {
  const [selectedId, setSelectedId] = createSignal<number | null>(null);
  const [modalOpen, setModalOpen] = createSignal(false);
  const [goodsReceiptId, setGoodsReceiptId] = createSignal("");
  const [reference, setReference] = createSignal("");
  const [totalAmount, setTotalAmount] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const toast = useToast();
  const client = useQueryClient();

  const list = createQuery(() => ({
    queryKey: ["landed-costs"],
    queryFn: async () => {
      const res = await apiFetch<LandedCost[]>("/api/v1/finance/landed-costs");
      if (!res.success) throw new Error(res.message ?? "Failed to load landed costs");
      return { rows: res.data ?? [], total: res.data?.length ?? 0 };
    },
  }));

  const grList = useGoodsReceiptList(() => ({
    page: 1,
    pageSize: 100,
    sort: "receipt_date",
    order: "desc",
  }));

  const grLabel = (id: number) => {
    const row = grList.data?.rows.find((r) => r.id === id);
    if (!row) return `GR #${id}`;
    return `GR #${row.id} — PO ${row.purchase_order_no ?? row.purchase_order_id} (${row.receipt_date})`;
  };

  const invalidate = () => void client.invalidateQueries({ queryKey: ["landed-costs"] });

  const postAllocation = async (row: LandedCost) => {
    if (row.status === "posted") return;
    const res = await apiFetch(`/api/v1/finance/landed-costs/${row.id}/post`, { method: "POST" });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to post landed cost.");
      return;
    }
    toast.success("Landed cost posted.");
    invalidate();
  };

  const openNew = () => {
    setGoodsReceiptId("");
    setReference("");
    setTotalAmount("");
    setModalOpen(true);
  };

  const save = async () => {
    const grId = Number(goodsReceiptId());
    if (!grId) {
      toast.warning("Goods receipt is required.");
      return;
    }
    setSaving(true);
    const res = await apiFetch<LandedCost>("/api/v1/finance/landed-costs", {
      method: "POST",
      body: JSON.stringify({
        goods_receipt_id: grId,
        reference: reference().trim() || null,
        total_amount: Number(totalAmount()) || 0,
        status: "draft",
      }),
    });
    setSaving(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create landed cost.");
      return;
    }
    toast.success("Landed cost header created.");
    setModalOpen(false);
    invalidate();
  };

  return (
    <AcctIILayout>
      <section class="rounded-xl border border-stroke bg-white p-4 shadow-sm">
        <h2 class="text-lg font-semibold text-text-primary">Import / landed cost</h2>
        <p class="mt-1 text-sm text-text-secondary">
          Acct. II — allocate freight, duties, and other import charges to purchase receipts for true unit cost.
        </p>
      </section>
      <SpreadsheetGrid<LandedCost>
        columns={[
          { key: "id", header: "ID", clickable: true },
          {
            key: "goods_receipt_id",
            header: "Goods receipt",
            render: (r) => grLabel(r.goods_receipt_id),
          },
          { key: "reference", header: "Reference" },
          {
            key: "total_amount",
            header: "Total",
            render: (r) => formatMoney(r.total_amount),
          },
          {
            key: "status",
            header: "Status",
            render: (r) => <span class="capitalize">{r.status}</span>,
          },
          {
            key: "id",
            header: "",
            sortable: false,
            render: (r) =>
              r.status === "draft" ? (
                <button type="button" class="text-sm font-medium text-brand-600 hover:underline" onClick={() => postAllocation(r)}>
                  Post
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
        exportFilename="landed-cost"
        exportTitle="Landed Cost"
        codeKey="id"
        nameKey="reference"
        total={list.data?.total ?? 0}
        search=""
        onSearchChange={() => {}}
        onRefresh={invalidate}
      />
      <EntityModal
        open={modalOpen()}
        title="New landed cost"
        onClose={() => setModalOpen(false)}
        onSave={() => void save()}
        saving={saving()}
        singleColumn
      >
        <Field label="Goods receipt *">
          <select class={inputClass} value={goodsReceiptId()} onChange={(e) => setGoodsReceiptId(e.currentTarget.value)}>
            <option value="">Select receipt…</option>
            {(grList.data?.rows ?? []).map((gr) => (
              <option value={String(gr.id)}>
                GR #{gr.id} — PO {gr.purchase_order_no ?? gr.purchase_order_id} ({gr.receipt_date})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reference">
          <input class={inputClass} value={reference()} onInput={(e) => setReference(e.currentTarget.value)} placeholder="BL / invoice ref" />
        </Field>
        <Field label="Total landed cost">
          <input class={inputClass} type="number" min="0" step="0.01" value={totalAmount()} onInput={(e) => setTotalAmount(e.currentTarget.value)} />
        </Field>
      </EntityModal>
    </AcctIILayout>
  );
}
