import { createSignal, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { handleSaveResult } from "../../../shared/handleSaveResult";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { formatPeso } from "../../../shared/money";
import { useToast } from "../../../shared/toast";

type Props = {
  open: boolean;
  supplierInvoiceId: number;
  partnerId: number;
  currencyId: number;
  amount: number;
  invoiceNo: string;
  paymentDate: string;
  onClose: () => void;
  onSaved: () => void;
};

export function CashPaymentToVendorModal(props: Props) {
  const toast = useToast();
  const [paymentMethod, setPaymentMethod] = createSignal("cash");
  const [referenceNo, setReferenceNo] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [saving, setSaving] = createSignal(false);

  const save = async () => {
    setSaving(true);
    const res = await apiFetch<{ id: number }>("/api/v1/finance/payment-vouchers", {
      method: "POST",
      body: JSON.stringify({
        payment_date: props.paymentDate,
        partner_id: props.partnerId,
        currency_id: props.currencyId,
        payment_method: paymentMethod(),
        reference_no: referenceNo() || null,
        notes: notes() ? `Cash Payment — ${props.invoiceNo}: ${notes()}` : `Cash Payment — ${props.invoiceNo}`,
        applications: [
          {
            supplier_invoice_id: props.supplierInvoiceId,
            applied_amount: props.amount,
          },
        ],
      }),
    });
    setSaving(false);
    if (!handleSaveResult(res, toast, "Cash payment recorded.")) return;
    props.onSaved();
    props.onClose();
  };

  return (
    <Modal open={props.open} title="Cash Payment — To Vendor" onClose={props.onClose} stacked>
      <p class="mb-4 text-sm text-text-secondary">
        Apply vendor payment to purchase <strong>{props.invoiceNo}</strong> — {formatPeso(props.amount)}.
      </p>
      <div class="grid gap-4">
        <Field label="Payment method">
          <select class={inputClass} value={paymentMethod()} onChange={(e) => setPaymentMethod(e.currentTarget.value)}>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </Field>
        <Field label="Reference no.">
          <input class={inputClass} value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
        </Field>
        <Field label="Notes">
          <input class={inputClass} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
        </Field>
        <Show when={props.amount <= 0}>
          <p class="text-sm text-amber-700">Purchase total is zero — payment will not apply any amount.</p>
        </Show>
      </div>
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
          Skip
        </button>
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={saving()}
          onClick={() => void save()}
        >
          {saving() ? "Saving…" : "Record payment"}
        </button>
      </div>
    </Modal>
  );
}
