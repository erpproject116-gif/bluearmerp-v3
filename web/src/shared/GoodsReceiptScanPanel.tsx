import { createResource, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "./api";
import { SerialReceiveScanner, type SerialReceiveLine } from "./SerialReceiveScanner";

type GoodsReceiptDetail = {
  id: number;
  status: string;
  purchase_order_no?: string;
  lines?: SerialReceiveLine[];
};

export function GoodsReceiptScanPanel(props: { grId: number; onClose?: () => void }) {
  const [detail, { mutate, refetch }] = createResource(
    () => props.grId,
    async (id) => {
      const res = await apiFetch<GoodsReceiptDetail>(`/api/v1/goods-receipt/goods-receipts/${id}`);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load goods receipt");
      return res.data;
    },
  );

  return (
    <div class="mt-4 rounded-xl border border-stroke bg-white p-4 shadow-sm">
      <div class="mb-3 flex items-center justify-between gap-2">
        <div>
          <h3 class="text-sm font-semibold text-text-primary">Scan serials</h3>
          <Show when={detail()}>
            <p class="text-xs text-text-secondary">
              GR #{detail()!.id}
              {detail()!.purchase_order_no ? ` · PO ${detail()!.purchase_order_no}` : ""}
              {" · "}
              <span class="capitalize">{detail()!.status}</span>
            </p>
          </Show>
        </div>
        <div class="flex gap-2">
          <A
            href={`/app/inventory/serial-lot/receive?gr_id=${props.grId}`}
            class="text-xs text-brand-600 hover:underline"
          >
            Open in Receive
          </A>
          <Show when={props.onClose}>
            <button type="button" class="text-xs text-text-secondary hover:underline" onClick={props.onClose}>
              Close
            </button>
          </Show>
        </div>
      </div>

      <Show when={detail.loading}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={detail.error}>
        <p class="text-sm text-red-600">{String(detail.error)}</p>
      </Show>
      <Show when={detail() && detail()!.status === "draft"}>
        <SerialReceiveScanner
          grId={props.grId}
          lines={detail()!.lines ?? []}
          status={detail()!.status}
          onLinesUpdate={(lines) => {
            mutate((d: GoodsReceiptDetail | undefined) => (d ? { ...d, lines } : d));
          }}
          onAfterScan={() => void refetch()}
        />
      </Show>
      <Show when={detail() && detail()!.status !== "draft"}>
        <p class="text-sm text-text-secondary">Only draft receipts accept serial scans.</p>
      </Show>
    </div>
  );
}
