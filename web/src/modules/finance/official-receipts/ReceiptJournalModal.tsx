import { createEffect, createSignal, For, Show } from "solid-js";
import { formatPeso } from "../../../shared/money";
import { apiFetch } from "../../../shared/api";
import { Field, inputClass } from "../../../shared/SpreadsheetGrid";
import { Modal } from "../../../shared/Modal";
import { useToast } from "../../../shared/toast";
import { BankAccountSearchModal } from "./BankAccountSearchModal";
import { BankAccountRegisterModal } from "./BankAccountRegisterModal";
import { ReceivableApplicationModal } from "./ReceivableApplicationModal";

type JournalLine = {
  line_no: number;
  bank_account_id?: number | null;
  deposit_account_code: string;
  deposit_account_name: string;
  gl_account_code: string;
  gl_account_name: string;
  partner_code: string;
  partner_name: string;
  amount: string;
  fees: string;
  remark: string;
};

type ApplicationRow = {
  sales_id: number;
  sales_no: string;
  date_no_display: string;
  applied_amount: string;
  remark: string;
};

type ReceiptJournalDetail = {
  id: number;
  date_no_display: string;
  accounting_slip_no: string;
  receipt_no: string;
  customer_name: string;
  partner_id: number;
  amount_total: number;
  comment_details?: string | null;
  notes?: string | null;
  remark?: string | null;
  journal_lines?: JournalLine[];
  applications?: { sales_id: number; sales_no?: string; date_no_display?: string; applied_amount: number; remark?: string }[];
};

type Props = {
  open: boolean;
  receiptId: number | null;
  onClose: () => void;
  onSaved: () => void;
};

function emptyLine(no: number): JournalLine {
  return {
    line_no: no,
    deposit_account_code: "",
    deposit_account_name: "",
    gl_account_code: "",
    gl_account_name: "",
    partner_code: "",
    partner_name: "",
    amount: "",
    fees: "0",
    remark: "",
  };
}



export function ReceiptJournalModal(props: Props) {
  const toast = useToast();
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [detail, setDetail] = createSignal<ReceiptJournalDetail | null>(null);
  const [commentDetails, setCommentDetails] = createSignal("");
  const [notes, setNotes] = createSignal("");
  const [remark, setRemark] = createSignal("");
  const [lines, setLines] = createSignal<JournalLine[]>([emptyLine(1)]);
  const [applications, setApplications] = createSignal<ApplicationRow[]>([]);
  const [bankSearchLine, setBankSearchLine] = createSignal<number | null>(null);
  const [registerBankOpen, setRegisterBankOpen] = createSignal(false);
  const [receivableOpen, setReceivableOpen] = createSignal(false);

  const lineTotal = () => lines().reduce((s, ln) => s + (Number(ln.amount) || 0), 0);
  const appTotal = () => applications().reduce((s, a) => s + (Number(a.applied_amount) || 0), 0);

  const load = async (id: number) => {
    setLoading(true);
    try {
      const res = await apiFetch<ReceiptJournalDetail>(`/api/v1/finance/official-receipts/${id}`);
      if (!res.success || !res.data) throw new Error(res.message ?? "Failed to load receipt");
      const d = res.data;
      setDetail(d);
      setCommentDetails(d.comment_details ?? "");
      setNotes(d.notes ?? "");
      setRemark(d.remark ?? "");
      const jLines = (d as { journal_lines?: Array<Record<string, unknown>> }).journal_lines;
      if (jLines?.length) {
        setLines(
          jLines.map((ln, i) => ({
            line_no: Number(ln.line_no) || i + 1,
            bank_account_id: (ln.bank_account_id as number | undefined) ?? null,
            deposit_account_code: String(ln.deposit_account_code ?? ""),
            deposit_account_name: String(ln.deposit_account_name ?? ""),
            gl_account_code: String(ln.gl_account_code ?? ""),
            gl_account_name: String(ln.gl_account_name ?? ""),
            partner_code: String(ln.partner_code ?? ""),
            partner_name: String(ln.partner_name ?? ""),
            amount: String(ln.amount ?? ""),
            fees: String(ln.fees ?? 0),
            remark: String(ln.remark ?? ""),
          })),
        );
      } else {
        setLines([emptyLine(1)]);
      }
      setApplications(
        (d.applications ?? []).map((a) => ({
          sales_id: a.sales_id,
          sales_no: a.sales_no ?? "",
          date_no_display: a.date_no_display ?? "",
          applied_amount: String(a.applied_amount),
          remark: a.remark ?? "",
        })),
      );
    } catch (e) {
      toast.error(String(e));
      props.onClose();
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    if (props.open && props.receiptId) void load(props.receiptId);
    if (!props.open) {
      setDetail(null);
    }
  });

  const save = async () => {
    if (!props.receiptId) return;
    setSaving(true);
    try {
      const body = {
        comment_details: commentDetails() || null,
        notes: notes() || null,
        remark: remark() || null,
        journal_lines: lines().map((ln) => ({
          line_no: ln.line_no,
          bank_account_id: ln.bank_account_id ?? null,
          deposit_account_code: ln.deposit_account_code,
          deposit_account_name: ln.deposit_account_name,
          gl_account_code: ln.gl_account_code,
          gl_account_name: ln.gl_account_name,
          partner_code: ln.partner_code,
          partner_name: ln.partner_name,
          amount: Number(ln.amount) || 0,
          fees: Number(ln.fees) || 0,
          remark: ln.remark || null,
        })),
        applications: applications().map((a) => ({
          sales_id: a.sales_id,
          applied_amount: Number(a.applied_amount) || 0,
          remark: a.remark || null,
        })),
      };
      const res = await apiFetch(`/api/v1/finance/official-receipts/${props.receiptId}/journal`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.success) throw new Error(res.message ?? "Failed to save journal");
      toast.success("Receipt journal saved.");
      props.onSaved();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setSaving(false);
    }
  };

  const patchLine = (lineNo: number, patch: Partial<JournalLine>) => {
    setLines((prev) => prev.map((ln) => (ln.line_no === lineNo ? { ...ln, ...patch } : ln)));
  };

  return (
    <>
      <Modal open={props.open} title={`Receipt Journal — ${detail()?.date_no_display ?? ""}`} onClose={props.onClose} wide>
        <Show when={loading()}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>
        <Show when={detail()}>
          {(d) => (
            <div class="space-y-4">
              <div class="grid gap-3 md:grid-cols-3">
                <Field label="Date-No.">
                  <input class={inputClass} value={d().date_no_display} readOnly />
                </Field>
                <Field label="Accounting Slip No.">
                  <input class={inputClass} value={d().accounting_slip_no} readOnly />
                </Field>
                <Field label="Customer">
                  <input class={inputClass} value={d().customer_name} readOnly />
                </Field>
              </div>
              <Field label="Comment Details">
                <textarea class={inputClass} rows={2} value={commentDetails()} onInput={(e) => setCommentDetails(e.currentTarget.value)} />
              </Field>
              <Field label="Remark">
                <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
              </Field>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-text-primary">Journal Lines</h3>
                <button type="button" class="text-sm text-brand-600 hover:underline" onClick={() => setLines((prev) => [...prev, emptyLine(prev.length + 1)])}>
                  Add line
                </button>
              </div>
              <div class="overflow-x-auto rounded border border-stroke">
                <table class="min-w-full text-xs">
                  <thead class="bg-slate-50">
                    <tr>
                      <th class="px-2 py-1">Deposit Code</th>
                      <th class="px-2 py-1">Deposit Name</th>
                      <th class="px-2 py-1">GL Code</th>
                      <th class="px-2 py-1">GL Name</th>
                      <th class="px-2 py-1">Amount</th>
                      <th class="px-2 py-1">Fees</th>
                      <th class="px-2 py-1">Remark</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={lines()}>
                      {(ln) => (
                        <tr>
                          <td class="px-1 py-1">
                            <button type="button" class="w-full rounded border border-stroke px-1 py-0.5 text-left hover:bg-slate-50" onClick={() => setBankSearchLine(ln.line_no)}>
                              {ln.deposit_account_code || "Select…"}
                            </button>
                          </td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.deposit_account_name} onInput={(e) => patchLine(ln.line_no, { deposit_account_name: e.currentTarget.value })} /></td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.gl_account_code} onInput={(e) => patchLine(ln.line_no, { gl_account_code: e.currentTarget.value })} /></td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.gl_account_name} onInput={(e) => patchLine(ln.line_no, { gl_account_name: e.currentTarget.value })} /></td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.amount} onInput={(e) => patchLine(ln.line_no, { amount: e.currentTarget.value })} /></td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.fees} onInput={(e) => patchLine(ln.line_no, { fees: e.currentTarget.value })} /></td>
                          <td class="px-1 py-1"><input class={inputClass} value={ln.remark} onInput={(e) => patchLine(ln.line_no, { remark: e.currentTarget.value })} /></td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
              <p class="text-sm text-text-secondary">Line total: {formatPeso(lineTotal())} · Applied: {formatPeso(appTotal())}</p>
              <div class="flex items-center gap-2">
                <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setReceivableOpen(true)}>
                  Receivable Applications ({applications().length})
                </button>
                <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={() => setRegisterBankOpen(true)}>
                  Register Bank Account
                </button>
              </div>
            </div>
          )}
        </Show>
        <div class="mt-4 flex justify-end gap-2 border-t border-stroke pt-4">
          <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={props.onClose}>
            Close
          </button>
          <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={saving() || loading()} onClick={() => void save()}>
            {saving() ? "Saving…" : "Save"}
          </button>
        </div>
      </Modal>
      <BankAccountSearchModal
        open={bankSearchLine() !== null}
        onClose={() => setBankSearchLine(null)}
        onSelect={(bank) => {
          const lineNo = bankSearchLine();
          if (lineNo == null) return;
          patchLine(lineNo, {
            bank_account_id: bank.id,
            deposit_account_code: bank.bank_account_code,
            deposit_account_name: bank.bank_account_name,
            gl_account_code: bank.gl_account_code,
            gl_account_name: bank.gl_account_name ?? "",
          });
          setBankSearchLine(null);
        }}
        onRegister={() => {
          setBankSearchLine(null);
          setRegisterBankOpen(true);
        }}
      />
      <BankAccountRegisterModal open={registerBankOpen()} onClose={() => setRegisterBankOpen(false)} onCreated={() => setRegisterBankOpen(false)} />
      <ReceivableApplicationModal
        open={receivableOpen()}
        partnerId={detail()?.partner_id ?? null}
        receiptId={props.receiptId}
        initial={applications()}
        onClose={() => setReceivableOpen(false)}
        onApply={(rows) => {
          setApplications(rows);
          setReceivableOpen(false);
        }}
      />
    </>
  );
}
