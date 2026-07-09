import { createEffect, createSignal, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { getAccessToken } from "../../../shared/api";
import { Modal } from "../../../shared/Modal";
import { LoadingText } from "../../../shared/LoadingText";
import {
  collectiveTransactionsExportUrl,
  fetchCollectiveInvoiceTransactions,
  type CollectiveTransactionRow,
} from "../../../shared/useCollectiveInvoices";

type Props = {
  invoiceId: number | null;
  onClose: () => void;
};



export function CollectiveInvoiceTransactionsModal(props: Props) {
  const [rows, setRows] = createSignal<CollectiveTransactionRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  createEffect(() => {
    const id = props.invoiceId;
    if (!id) {
      setRows([]);
      return;
    }
    void (async () => {
      setLoading(true);
      setError("");
      const res = await fetchCollectiveInvoiceTransactions(id);
      setLoading(false);
      if (!res.success || !res.data) {
        setError(res.message ?? "Failed to load transactions.");
        setRows([]);
        return;
      }
      setRows(res.data.rows ?? []);
    })();
  });

  const downloadCsv = async () => {
    const id = props.invoiceId;
    if (!id) return;
    const token = await getAccessToken();
    const res = await fetch(collectiveTransactionsExportUrl(id), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `collective-invoice-${id}-transactions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={props.invoiceId != null} title="View Transactions" wide onClose={props.onClose}>
      <div class="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50"
          onClick={() => void downloadCsv()}
        >
          Export CSV
        </button>
      </div>
      <Show when={loading()}><LoadingText class="text-sm text-text-secondary" as="p" /></Show>
      <Show when={error()}><p class="text-sm text-red-600">{error()}</p></Show>
      <Show when={!loading() && !error()}>
        <div class="max-h-[60vh] overflow-auto">
          <table class="min-w-full text-sm">
            <thead class="sticky top-0 border-b border-stroke bg-slate-50 text-left text-text-secondary">
              <tr>
                <th class="px-2 py-2">Inv. Date-No.</th>
                <th class="px-2 py-2">Date-No.</th>
                <th class="px-2 py-2">Item Name [Spec]</th>
                <th class="px-2 py-2 text-right">Qty</th>
                <th class="px-2 py-2 text-right">Price</th>
                <th class="px-2 py-2 text-right">Pretax</th>
                <th class="px-2 py-2 text-right">Tax</th>
                <th class="px-2 py-2 text-right">Total</th>
                <th class="px-2 py-2">Customer</th>
              </tr>
            </thead>
            <tbody>
              {rows().map((r) => (
                <tr class="border-b border-stroke/60">
                  <td class="px-2 py-1.5">{r.invoicing_date_no_display}</td>
                  <td class="px-2 py-1.5">{r.transaction_date_no_display}</td>
                  <td class="px-2 py-1.5">{r.item_name_spec}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{r.qty}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{formatPeso(r.price)}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{formatPeso(r.pretax_amount)}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{formatPeso(r.tax)}</td>
                  <td class="px-2 py-1.5 text-right tabular-nums">{formatPeso(r.total)}</td>
                  <td class="px-2 py-1.5">{r.customer_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Show>
    </Modal>
  );
}
