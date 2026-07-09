import { createResource, For, Show } from "solid-js";
import { A } from "@solidjs/router";
import { apiFetch } from "./api";
import { SerialReceiveScanner, type SerialReceiveLine } from "./SerialReceiveScanner";
import { SerialLineCell } from "./SerialLineCell";
import { uiLabel } from "./branding/uiLabel";
import { LoadingText } from "./LoadingText";

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
          <h3 class="text-sm font-semibold text-text-primary">{uiLabel("goods_receipt.scan_serials")}</h3>
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
            {uiLabel("goods_receipt.open_in_receive")}
          </A>
          <Show when={props.onClose}>
            <button type="button" class="text-xs text-text-secondary hover:underline" onClick={props.onClose}>
              Close
            </button>
          </Show>
        </div>
      </div>

      <Show when={detail.loading}>
        <LoadingText class="text-sm text-text-secondary" as="p" />
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

        <Show when={(detail()!.lines ?? []).some((l) => l.track_serial)}>
          <div class="mt-4 overflow-x-auto rounded-lg border border-stroke">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-text-secondary">
                <tr>
                  <th class="px-3 py-2">Line</th>
                  <th class="px-3 py-2">Item</th>
                  <th class="px-3 py-2">Expected</th>
                  <th class="px-3 py-2">Serials</th>
                </tr>
              </thead>
              <tbody>
                <For each={(detail()!.lines ?? []).filter((l) => l.track_serial)}>
                  {(line) => (
                    <tr class="border-t border-stroke">
                      <td class="px-3 py-2">{line.line_no}</td>
                      <td class="px-3 py-2">
                        {line.item_code} — {line.item_name}
                      </td>
                      <td class="px-3 py-2">{line.expected_qty}</td>
                      <td class="px-3 py-2">
                        <SerialLineCell
                          mode="receive"
                          grId={props.grId}
                          lineId={line.id}
                          itemCode={line.item_code}
                          itemName={line.item_name}
                          expectedQty={line.expected_qty}
                          receivedQty={line.received_qty}
                          serials={line.serials ?? []}
                          status={detail()!.status}
                          onSerialsChange={(serials, receivedQty) => {
                            mutate((d: GoodsReceiptDetail | undefined) => {
                              if (!d?.lines) return d;
                              return {
                                ...d,
                                lines: d.lines.map((l) =>
                                  l.id === line.id ? { ...l, serials, received_qty: receivedQty } : l,
                                ),
                              };
                            });
                          }}
                          onAfterScan={() => void refetch()}
                        />
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
      <Show when={detail() && detail()!.status !== "draft"}>
        <p class="text-sm text-text-secondary">{uiLabel("goods_receipt.draft_only_scans")}</p>
      </Show>
    </div>
  );
}
