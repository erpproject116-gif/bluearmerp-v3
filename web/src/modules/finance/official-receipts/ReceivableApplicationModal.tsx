import { createEffect, createResource, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { apiFetch } from "../../../shared/api";
import { inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";

type ApplicationRow = {
  sales_id: number;
  sales_no: string;
  date_no_display: string;
  applied_amount: string;
  remark: string;
};

type OpenReceivable = {
  sales_id: number;
  sales_no: string;
  date_no_display: string;
  occurrence_date: string;
  due_date?: string | null;
  balance: number;
  location_name?: string;
  project_name?: string | null;
  department_name?: string | null;
};

type Props = {
  open: boolean;
  partnerId: number | null;
  receiptId: number | null;
  initial: ApplicationRow[];
  onClose: () => void;
  onApply: (rows: ApplicationRow[]) => void;
};



async function fetchOpen(partnerId: number, receiptId: number | null) {
  const qs = new URLSearchParams({ partner_id: String(partnerId) });
  if (receiptId) qs.set("exclude_receipt_id", String(receiptId));
  const res = await apiFetch<OpenReceivable[]>(`/api/v1/finance/receivables/open?${qs}`);
  return res.data ?? [];
}

export function ReceivableApplicationModal(props: Props) {
  const [rows, setRows] = createSignal<ApplicationRow[]>([]);
  const [openRecv] = createResource(
    () => (props.open && props.partnerId ? { partnerId: props.partnerId, receiptId: props.receiptId } : null),
    (p) => fetchOpen(p!.partnerId, p!.receiptId),
  );

  const initRows = () => {
    if (props.initial.length) {
      setRows([...props.initial]);
      return;
    }
    const open = openRecv();
    if (!open?.length) {
      setRows([]);
      return;
    }
    setRows(
      open.map((r) => ({
        sales_id: r.sales_id,
        sales_no: r.sales_no,
        date_no_display: r.date_no_display,
        applied_amount: "",
        remark: "",
      })),
    );
  };

  createEffect(() => {
    if (props.open && openRecv()) initRows();
  });

  const patch = (salesId: number, patch: Partial<ApplicationRow>) => {
    setRows((prev) => prev.map((r) => (r.sales_id === salesId ? { ...r, ...patch } : r)));
  };

  const totalApplied = () => rows().reduce((s, r) => s + (Number(r.applied_amount) || 0), 0);

  return (
    <Modal open={props.open} title="Receivable Application" onClose={props.onClose} wide stacked>
      <Show when={openRecv.loading}>
        <p class="text-sm text-text-secondary">Loading open receivables…</p>
      </Show>
      <div class="max-h-96 overflow-y-auto rounded border border-stroke">
        <table class="min-w-full text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="px-2 py-1">Receivable No.</th>
              <th class="px-2 py-1 text-right">Balance</th>
              <th class="px-2 py-1">Decrease Amount</th>
              <th class="px-2 py-1">Remark</th>
            </tr>
          </thead>
          <tbody>
            <For each={openRecv() ?? []}>
              {(recv) => {
                const row = () => rows().find((r) => r.sales_id === recv.sales_id);
                return (
                  <tr>
                    <td class="px-2 py-1">{recv.date_no_display} — {recv.sales_no}</td>
                    <td class="px-2 py-1 text-right tabular-nums">{formatPeso(recv.balance)}</td>
                    <td class="px-2 py-1">
                      <input
                        class={inputClass}
                        value={row()?.applied_amount ?? ""}
                        onInput={(e) => {
                          const val = e.currentTarget.value;
                          setRows((prev) => {
                            const existing = prev.find((r) => r.sales_id === recv.sales_id);
                            if (existing) return prev.map((r) => (r.sales_id === recv.sales_id ? { ...r, applied_amount: val } : r));
                            return [...prev, { sales_id: recv.sales_id, sales_no: recv.sales_no, date_no_display: recv.date_no_display, applied_amount: val, remark: "" }];
                          });
                        }}
                      />
                    </td>
                    <td class="px-2 py-1">
                      <input
                        class={inputClass}
                        value={row()?.remark ?? ""}
                        onInput={(e) => patch(recv.sales_id, { sales_id: recv.sales_id, sales_no: recv.sales_no, date_no_display: recv.date_no_display, applied_amount: row()?.applied_amount ?? "", remark: e.currentTarget.value })}
                      />
                    </td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
      <p class="mt-2 text-sm text-text-secondary">Total applied: {formatPeso(totalApplied())}</p>
      <div class="mt-4 flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Cancel
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white"
          onClick={() => props.onApply(rows().filter((r) => Number(r.applied_amount) > 0))}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}
