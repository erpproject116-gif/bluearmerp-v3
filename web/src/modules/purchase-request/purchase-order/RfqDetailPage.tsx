import { A, useParams } from "@solidjs/router";
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { useToast } from "../../../shared/toast";
import { SupplierQuotationModal } from "./SupplierQuotationModal";

type RfqLine = {
  id: number;
  line_no: number;
  item_id?: number | null;
  item_code: string;
  item_name: string;
  qty: number;
};

type RfqDetail = {
  id: number;
  rfq_no: string;
  rfq_date: string;
  status: string;
  purchase_request_id?: number | null;
  notes?: string | null;
  lines: RfqLine[];
};

type SupplierQuotationRow = {
  id: number;
  rfq_id: number;
  partner_id: number;
  quote_date: string;
  quote_no: string;
  status: string;
  grand_total: number;
  line_count: number;
};

function statusBadgeClass(status: string) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  if (status === "received") return "bg-indigo-100 text-indigo-700";
  if (status === "closed") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export default function RfqDetailPage() {
  const params = useParams();
  const toast = useToast();
  const client = useQueryClient();
  const rfqId = () => Number(params.id || "0");
  const [sqModalOpen, setSqModalOpen] = createSignal(false);
  const [editingSqId, setEditingSqId] = createSignal<number | null>(null);
  const [creatingPoSqId, setCreatingPoSqId] = createSignal<number | null>(null);

  const rfq = createQuery(() => ({
    queryKey: ["rfq-detail", rfqId()],
    queryFn: async () => {
      const res = await apiFetch<RfqDetail>(`/api/v1/purchase-order/rfq/${rfqId()}`);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load RFQ");
      return res.data;
    },
  }));

  const supplierQuotations = createQuery(() => ({
    queryKey: ["rfq-supplier-quotations", rfqId()],
    queryFn: async () => {
      const res = await apiFetch<SupplierQuotationRow[]>(
        `/api/v1/purchase-order/supplier-quotations?rfq_id=${rfqId()}`,
      );
      if (!res.success) throw new Error(res.message ?? "Failed to load supplier quotations");
      return res.data ?? [];
    },
  }));

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ["rfq-detail", rfqId()] });
    void client.invalidateQueries({ queryKey: ["rfq-supplier-quotations", rfqId()] });
    void client.invalidateQueries({ queryKey: ["purchase-orders"] });
  };

  const patchRfqStatus = async (status: string) => {
    const res = await apiFetch(`/api/v1/purchase-order/rfq/${rfqId()}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update RFQ status.");
      return;
    }
    toast.success("RFQ status updated.");
    invalidate();
  };

  const patchSupplierQuotationStatus = async (sqId: number, status: string) => {
    const res = await apiFetch(`/api/v1/purchase-order/supplier-quotations/${sqId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    if (!res.success) {
      toast.warning(res.message ?? "Failed to update supplier quotation status.");
      return;
    }
    toast.success("Supplier quotation status updated.");
    invalidate();
  };

  const createPoFromSupplierQuotation = async (sqId: number) => {
    setCreatingPoSqId(sqId);
    const res = await apiFetch(`/api/v1/purchase-order/purchase-orders/from-supplier-quotation/${sqId}`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    setCreatingPoSqId(null);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to create purchase order.");
      return;
    }
    toast.success("Purchase order created from supplier quotation.");
    invalidate();
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <A href="/app/purchase-order/rfq" class="text-sm text-brand-600 hover:underline">
          Back to RFQ list
        </A>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void patchRfqStatus("sent")}
          >
            Mark sent
          </button>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => void patchRfqStatus("closed")}
          >
            Mark closed
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
            onClick={() => {
              setEditingSqId(null);
              setSqModalOpen(true);
            }}
          >
            New supplier quotation
          </button>
        </div>
      </div>

      <Show when={rfq.isLoading} fallback={
        <Show when={rfq.data} keyed>
          {(x) => (
            <div class="rounded-lg border border-stroke bg-white p-4">
              <div class="flex flex-wrap items-center gap-3">
                <h1 class="text-xl font-semibold text-slate-900">{x.rfq_no}</h1>
                <span class={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusBadgeClass(x.status)}`}>
                  {x.status}
                </span>
                <span class="text-sm text-text-secondary">{x.rfq_date}</span>
                <Show when={x.purchase_request_id}>
                  <span class="text-sm text-text-secondary">PR #{x.purchase_request_id}</span>
                </Show>
              </div>
              <Show when={x.notes}>
                <p class="mt-2 text-sm text-text-secondary">{x.notes}</p>
              </Show>

              <div class="mt-4 overflow-x-auto rounded border border-stroke">
                <table class="min-w-full text-sm">
                  <thead class="bg-slate-50 text-left">
                    <tr>
                      <th class="px-2 py-2">#</th>
                      <th class="px-2 py-2">Item</th>
                      <th class="px-2 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={x.lines}>
                      {(ln) => (
                        <tr class="border-t border-stroke">
                          <td class="px-2 py-2">{ln.line_no}</td>
                          <td class="px-2 py-2">
                            {ln.item_code} — {ln.item_name}
                          </td>
                          <td class="px-2 py-2 text-right">{ln.qty}</td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Show>
      }>
        <p class="text-sm text-slate-500">Loading RFQ…</p>
      </Show>

      <div class="rounded-lg border border-stroke bg-white p-4">
        <h2 class="text-base font-semibold">Supplier quotations</h2>
        <Show when={!supplierQuotations.isLoading} fallback={<p class="mt-2 text-sm text-slate-500">Loading quotations…</p>}>
          <Show when={(supplierQuotations.data ?? []).length > 0} fallback={<p class="mt-2 text-sm text-slate-500">No supplier quotations yet.</p>}>
            <div class="mt-3 overflow-x-auto rounded border border-stroke">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left">
                  <tr>
                    <th class="px-2 py-2">Quote no</th>
                    <th class="px-2 py-2">Date</th>
                    <th class="px-2 py-2">Status</th>
                    <th class="px-2 py-2 text-right">Lines</th>
                    <th class="px-2 py-2 text-right">Total</th>
                    <th class="px-2 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={supplierQuotations.data ?? []}>
                    {(sq) => (
                      <tr class="border-t border-stroke">
                        <td class="px-2 py-2">{sq.quote_no}</td>
                        <td class="px-2 py-2">{sq.quote_date}</td>
                        <td class="px-2 py-2">
                          <span class={`rounded-full px-2 py-1 text-xs font-medium capitalize ${statusBadgeClass(sq.status)}`}>
                            {sq.status}
                          </span>
                        </td>
                        <td class="px-2 py-2 text-right">{sq.line_count}</td>
                        <td class="px-2 py-2 text-right">
                          {sq.grand_total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td class="px-2 py-2">
                          <div class="flex justify-end gap-2">
                            <button
                              type="button"
                              class="text-brand-600 hover:underline"
                              onClick={() => {
                                setEditingSqId(sq.id);
                                setSqModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              class="text-brand-600 hover:underline"
                              onClick={() => void patchSupplierQuotationStatus(sq.id, "accepted")}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              class="text-brand-600 hover:underline"
                              onClick={() => void patchSupplierQuotationStatus(sq.id, "rejected")}
                            >
                              Reject
                            </button>
                            <button
                              type="button"
                              class="text-brand-600 hover:underline disabled:opacity-50"
                              disabled={creatingPoSqId() === sq.id}
                              onClick={() => void createPoFromSupplierQuotation(sq.id)}
                            >
                              {creatingPoSqId() === sq.id ? "Creating…" : "Create PO"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </div>

      <SupplierQuotationModal
        open={sqModalOpen()}
        rfqId={rfqId()}
        rfqLines={rfq.data?.lines ?? []}
        quotationId={editingSqId()}
        onClose={() => {
          setSqModalOpen(false);
          setEditingSqId(null);
        }}
        onSaved={invalidate}
      />
    </div>
  );
}
