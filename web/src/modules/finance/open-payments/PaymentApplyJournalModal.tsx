import { createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { createQuery } from "@tanstack/solid-query";

export type ApplyAppLine = {
  doc_id: number;
  applied_amount: number;
  discount_amount?: number;
  label: string;
};

type Props = {
  open: boolean;
  side: "ar" | "ap";
  lines: ApplyAppLine[];
  partnerLabel: string;
  allowMultiPartner: boolean;
  onClose: () => void;
  onApplied: () => void;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentApplyJournalModal(props: Props) {
  const toast = useToast();
  const [saving, setSaving] = createSignal(false);
  const [paymentDate, setPaymentDate] = createSignal(todayISO());
  const [receivedType, setReceivedType] = createSignal("cash");
  const [bankAccountId, setBankAccountId] = createSignal<number | null>(null);
  const [remarkMode, setRemarkMode] = createSignal<"same" | "doc" | "manual">("same");
  const [manualRemark, setManualRemark] = createSignal("");
  const [referenceNo, setReferenceNo] = createSignal("");

  const banks = createQuery(() => ({
    queryKey: ["bank-accounts-open-pay"],
    queryFn: async () => {
      const res = await apiFetch<{ id: number; bank_account_name: string }[]>(
        "/api/v1/finance/bank-accounts?page=1&pageSize=200&sort=bank_account_name&order=asc",
      );
      return res.data ?? [];
    },
    enabled: props.open,
  }));

  const mapMethod = () => {
    switch (receivedType()) {
      case "cash":
        return "cash";
      case "check":
        return "check";
      case "note":
        return "note";
      case "other":
        return "other";
      case "card":
        return "card";
      default:
        return "bank_transfer";
    }
  };

  const buildNotes = () => {
    if (remarkMode() === "manual") return manualRemark().trim() || null;
    if (remarkMode() === "doc") return props.lines.map((l) => l.label).join(", ");
    return props.partnerLabel ? `Payment — ${props.partnerLabel}` : null;
  };

  const apply = async () => {
    if (props.lines.length === 0) {
      toast.warning("Select at least one row with a decrease amount.");
      return;
    }
    setSaving(true);
    const method = mapMethod();
    const notes = buildNotes();
    const ref =
      receivedType() === "note" || receivedType() === "other"
        ? referenceNo().trim() || `${receivedType()} payment`
        : referenceNo().trim() || null;

    if (props.side === "ar") {
      const res = await apiFetch(
        "/api/v1/finance/receivables/apply",
        {
          method: "POST",
          body: JSON.stringify({
            payment_date: paymentDate(),
            payment_method: method,
            bank_account_id: bankAccountId() || null,
            reference_no: ref,
            notes,
            allow_multi_partner: props.allowMultiPartner,
            applications: props.lines.map((l) => ({
              sales_id: l.doc_id,
              applied_amount: l.applied_amount,
              discount_amount: l.discount_amount ?? 0,
            })),
          }),
        },
        { silent: true },
      );
      setSaving(false);
      if (!res.success) {
        toast.error(res.message ?? "Failed to apply receivable payment.");
        return;
      }
      toast.success(res.message ?? "Receivable payment applied.");
    } else {
      const res = await apiFetch(
        "/api/v1/finance/payables/apply",
        {
          method: "POST",
          body: JSON.stringify({
            payment_date: paymentDate(),
            payment_method: method,
            bank_account_id: bankAccountId() || null,
            reference_no: ref,
            notes,
            allow_multi_partner: props.allowMultiPartner,
            applications: props.lines.map((l) => ({
              supplier_invoice_id: l.doc_id,
              applied_amount: l.applied_amount,
              discount_amount: l.discount_amount ?? 0,
            })),
          }),
        },
        { silent: true },
      );
      setSaving(false);
      if (!res.success) {
        toast.error(res.message ?? "Failed to apply payable payment.");
        return;
      }
      toast.success(res.message ?? "Payable payment applied.");
    }
    props.onApplied();
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      title={props.side === "ar" ? "Receipts Journal" : "Payments Journal"}
      onClose={props.onClose}
      wide
      stacked
    >
      <div class="grid gap-4">
        <Field label="Payment date">
          <input class={inputClass} type="date" value={paymentDate()} onInput={(e) => setPaymentDate(e.currentTarget.value)} />
        </Field>
        <Field label={props.side === "ar" ? "Received Type" : "Payment Type"}>
          <div class="flex flex-wrap gap-3 text-sm">
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "cash"} onChange={() => setReceivedType("cash")} />
              Cash / Deposit
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "bank_transfer"} onChange={() => setReceivedType("bank_transfer")} />
              Bank transfer
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "note"} onChange={() => setReceivedType("note")} />
              Note
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "check"} onChange={() => setReceivedType("check")} />
              Check
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "card"} onChange={() => setReceivedType("card")} />
              Card
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={receivedType() === "other"} onChange={() => setReceivedType("other")} />
              Other Account
            </label>
          </div>
        </Field>
        <Field label={props.side === "ar" ? "Deposit Account" : "Withdrawal Account"}>
          <select
            class={inputClass}
            value={bankAccountId() ?? ""}
            onChange={(e) => setBankAccountId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
          >
            <option value="">— Select —</option>
            <For each={banks.data ?? []}>{(b) => <option value={b.id}>{b.bank_account_name}</option>}</For>
          </select>
        </Field>
        <Field label="Remark">
          <div class="mb-2 flex flex-wrap gap-3 text-sm">
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={remarkMode() === "same"} onChange={() => setRemarkMode("same")} />
              Same as Remark
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={remarkMode() === "doc"} onChange={() => setRemarkMode("doc")} />
              {props.side === "ar" ? "Receivable No." : "Payable No."}
            </label>
            <label class="inline-flex items-center gap-1.5">
              <input type="radio" checked={remarkMode() === "manual"} onChange={() => setRemarkMode("manual")} />
              Set Manually
            </label>
          </div>
          <Show when={remarkMode() === "manual"}>
            <input class={inputClass} value={manualRemark()} onInput={(e) => setManualRemark(e.currentTarget.value)} />
          </Show>
        </Field>
        <Field label="Reference no.">
          <input class={inputClass} value={referenceNo()} onInput={(e) => setReferenceNo(e.currentTarget.value)} />
        </Field>
        <p class="text-sm text-text-secondary">
          Applying {props.lines.length} line(s) for <strong>{props.partnerLabel || "selected partners"}</strong>
          {props.allowMultiPartner ? " (multi-partner bundling on)." : "."}
        </p>
        <div class="flex justify-end gap-2">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Close
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={saving()}
            onClick={() => void apply()}
          >
            {saving() ? "Applying…" : "Apply (F8)"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
