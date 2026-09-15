import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { createQuery } from "@tanstack/solid-query";
import {
  formatFileSize,
  uploadAttachment,
  type AttachmentScope,
} from "../../../shared/attachments";

export type ApplyAppLine = {
  doc_id: number;
  doc_type?: string;
  expense_id?: number;
  supplier_invoice_id?: number;
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

type PendingFile = { key: string; file: File };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function attachmentScope(side: "ar" | "ap"): AttachmentScope {
  return side === "ar" ? "finance/official-receipts" : "finance/payment-vouchers";
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
  const [pendingFiles, setPendingFiles] = createSignal<PendingFile[]>([]);

  createEffect(() => {
    if (!props.open) {
      setPendingFiles([]);
      setSaving(false);
    }
  });

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

  const onPickFiles = (e: Event & { currentTarget: HTMLInputElement }) => {
    const files = Array.from(e.currentTarget.files ?? []);
    e.currentTarget.value = "";
    if (files.length === 0) return;
    const stamp = Date.now();
    setPendingFiles((prev) => [
      ...prev,
      ...files.map((file, i) => ({ key: `${file.name}-${file.size}-${stamp}-${i}`, file })),
    ]);
  };

  const extractCreatedIds = (data: unknown): number[] => {
    if (!data) return [];
    if (Array.isArray(data)) {
      return data
        .map((row) => (row && typeof row === "object" && "id" in row ? Number((row as { id: number }).id) : 0))
        .filter((id) => id > 0);
    }
    if (typeof data === "object" && data !== null && "id" in data) {
      const id = Number((data as { id: number }).id);
      return id > 0 ? [id] : [];
    }
    return [];
  };

  const uploadPendingToDocs = async (docIds: number[]) => {
    const queue = pendingFiles();
    if (!queue.length || !docIds.length) return;
    const scope = attachmentScope(props.side);
    let ok = 0;
    let fail = 0;
    for (const docId of docIds) {
      for (const entry of queue) {
        const res = await uploadAttachment(scope, docId, entry.file);
        if (res.success) ok += 1;
        else fail += 1;
      }
    }
    if (ok > 0) {
      toast.success(ok === 1 ? "Receipt attached." : `${ok} attachment(s) uploaded.`);
    }
    if (fail > 0) {
      toast.warning(`${fail} attachment(s) failed to upload. Open the voucher/receipt to retry.`);
    }
    setPendingFiles([]);
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
      const res = await apiFetch<{ id: number } | { id: number }[]>(
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
      if (!res.success) {
        setSaving(false);
        toast.error(res.message ?? "Failed to apply receivable payment.");
        return;
      }
      toast.success(res.message ?? "Receivable payment applied.");
      await uploadPendingToDocs(extractCreatedIds(res.data));
    } else {
      const res = await apiFetch<{ id: number } | { id: number }[]>(
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
            applications: props.lines.map((l) => {
              const isExpense = l.doc_type === "expense" || (l.expense_id ?? 0) > 0;
              if (isExpense) {
                return {
                  doc_type: "expense",
                  expense_id: l.expense_id ?? l.doc_id,
                  doc_id: l.expense_id ?? l.doc_id,
                  applied_amount: l.applied_amount,
                  discount_amount: l.discount_amount ?? 0,
                };
              }
              return {
                doc_type: "supplier_invoice",
                supplier_invoice_id: l.supplier_invoice_id ?? l.doc_id,
                doc_id: l.supplier_invoice_id ?? l.doc_id,
                applied_amount: l.applied_amount,
                discount_amount: l.discount_amount ?? 0,
              };
            }),
          }),
        },
        { silent: true },
      );
      if (!res.success) {
        setSaving(false);
        toast.error(res.message ?? "Failed to apply payable payment.");
        return;
      }
      toast.success(res.message ?? "Payable payment applied.");
      await uploadPendingToDocs(extractCreatedIds(res.data));
    }
    setSaving(false);
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

        <div class="rounded-lg border border-stroke bg-slate-50/80 px-3 py-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-text-primary">Attachments</p>
              <p class="mt-0.5 text-xs text-text-secondary">
                Add receipt photos or PDFs. Files upload when you Apply.
              </p>
            </div>
            <label class="inline-flex cursor-pointer items-center rounded-lg border border-stroke bg-white px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
              Add files
              <input
                type="file"
                class="sr-only"
                multiple
                accept="image/*,.pdf,.png,.jpg,.jpeg,.webp,.heic,.doc,.docx"
                disabled={saving()}
                onChange={onPickFiles}
              />
            </label>
          </div>
          <Show
            when={pendingFiles().length > 0}
            fallback={<p class="mt-2 text-xs text-text-secondary">No files selected yet.</p>}
          >
            <ul class="mt-2 space-y-1.5">
              <For each={pendingFiles()}>
                {(entry) => (
                  <li class="flex items-center justify-between gap-2 rounded-md border border-stroke bg-white px-2 py-1.5 text-sm">
                    <span class="min-w-0 truncate text-text-primary">
                      {entry.file.name}
                      <span class="ml-2 text-xs text-text-secondary">{formatFileSize(entry.file.size)}</span>
                    </span>
                    <button
                      type="button"
                      class="shrink-0 text-xs font-medium text-rose-600 hover:underline"
                      disabled={saving()}
                      onClick={() => setPendingFiles((prev) => prev.filter((p) => p.key !== entry.key))}
                    >
                      Remove
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>

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
