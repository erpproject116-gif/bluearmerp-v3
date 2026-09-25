import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { fetchAccountOptions } from "../../shared/accounts";
import type { FormErrors } from "../../shared/formValidation";
import { handleSaveResult } from "../../shared/handleSaveResult";
import { LookupCombo } from "../../shared/LookupCombo";
import { Modal } from "../../shared/Modal";
import { formatMoney } from "../../shared/money";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";

type PreviewLine = { label: string; debit: number; credit: number };

type CostPostingPayload = {
  work_order_id: number;
  work_order_no: string;
  order_date: string;
  costs: {
    material_cost: number;
    labor_cost: number;
    overhead_cost: number;
    other_cost: number;
    total_cost: number;
  };
  lines: PreviewLine[];
  debit_account_id: number | null;
  debit_account_label: string;
  credit_material_account_id: number | null;
  credit_material_account_label: string;
  credit_conversion_account_id: number | null;
  credit_conversion_account_label: string;
  remark: string;
  journal_entry_id: number | null;
  journal_status: string | null;
  books_status: string;
};

type Props = {
  workOrderId: number | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

const LINE_FINISHED_GOODS = "Finished goods inventory";
const LINE_MATERIALS = "Materials inventory";

/**
 * Record a completed job's production cost in the books with chosen accounts:
 * Dr finished goods (total) / Cr materials (material) / Cr absorption (labor,
 * overhead, other). Mirrors the Acct I / Acct II pickers on the invoice tab.
 */
export function RecordCostsModal(props: Props) {
  const toast = useToast();
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [payload, setPayload] = createSignal<CostPostingPayload | null>(null);
  const [loadError, setLoadError] = createSignal("");
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});

  const [debitLabel, setDebitLabel] = createSignal("");
  const [debitId, setDebitId] = createSignal<number | null>(null);
  const [materialLabel, setMaterialLabel] = createSignal("");
  const [materialId, setMaterialId] = createSignal<number | null>(null);
  const [conversionLabel, setConversionLabel] = createSignal("");
  const [conversionId, setConversionId] = createSignal<number | null>(null);
  const [remark, setRemark] = createSignal("");

  const conversionAmount = () => {
    const c = payload()?.costs;
    if (!c) return 0;
    return c.labor_cost + c.overhead_cost + c.other_cost;
  };
  const needsConversion = () => conversionAmount() > 0.0001;
  const isDraft = () => payload()?.journal_status === "draft";

  const accountLabelFor = (line: PreviewLine): string => {
    if (line.label === LINE_FINISHED_GOODS) return debitLabel();
    if (line.label === LINE_MATERIALS) return materialLabel();
    return conversionLabel();
  };

  const load = async (id: number) => {
    setLoading(true);
    setLoadError("");
    setFieldErrors({});
    setPayload(null);
    const res = await apiFetch<CostPostingPayload>(`/api/v1/manufacturing/work-orders/${id}/cost-posting`, {}, { silent: true });
    setLoading(false);
    if (!res.success || !res.data) {
      setLoadError(res.message ?? "Could not load this job's costs.");
      return;
    }
    const p = res.data;
    setPayload(p);
    setDebitId(p.debit_account_id);
    setDebitLabel(p.debit_account_label);
    setMaterialId(p.credit_material_account_id);
    setMaterialLabel(p.credit_material_account_label);
    setConversionId(p.credit_conversion_account_id);
    setConversionLabel(p.credit_conversion_account_label);
    setRemark(p.remark ?? "");
  };

  createEffect(() => {
    if (!props.open || !props.workOrderId) return;
    void load(props.workOrderId);
  });

  const canSave = () =>
    Boolean(payload()) && !saving() && Boolean(debitId()) && Boolean(materialId()) && (!needsConversion() || Boolean(conversionId()));

  const handleSave = async () => {
    const id = props.workOrderId;
    if (!id || !canSave()) return;
    setSaving(true);
    setFieldErrors({});
    let res;
    try {
      res = await apiFetch<CostPostingPayload>(
        `/api/v1/manufacturing/work-orders/${id}/cost-posting`,
        {
          method: "PUT",
          body: JSON.stringify({
            debit_account_id: debitId(),
            credit_material_account_id: materialId(),
            credit_conversion_account_id: needsConversion() ? conversionId() : null,
            remark: remark().trim(),
          }),
        },
        { silent: true },
      );
    } catch {
      setSaving(false);
      toast.error("Could not reach the server. Check your connection and try again.");
      return;
    }
    setSaving(false);
    const ok = handleSaveResult(res, toast, res.message ?? "Recorded in the books.", { onFieldErrors: setFieldErrors });
    if (!ok) return;
    props.onSaved();
    props.onClose();
  };

  return (
    <Modal open={props.open} title={isDraft() ? "Edit accounts" : "Record in books"} onClose={props.onClose} wide>
      <Show when={loading()}>
        <p class="text-sm text-text-secondary">Loading…</p>
      </Show>
      <Show when={loadError()}>
        <p class="text-sm text-red-600">{loadError()}</p>
      </Show>
      <Show when={payload()}>
        {(p) => (
          <div class="space-y-4">
            <div class="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <div>
                <span class="font-semibold text-text-primary">{p().work_order_no}</span>
                <span class="ml-2 text-text-secondary">{p().order_date.slice(0, 10)}</span>
              </div>
              <div class="text-text-secondary">
                Total <span class="font-semibold text-text-primary">{formatMoney(p().costs.total_cost)}</span>
              </div>
            </div>

            <p class="text-sm text-text-secondary">
              Choose where this job's cost goes. The finished goods account is debited for the total; materials and
              labor / overhead are credited. Only the accounts change — stock and the job stay as they are.
            </p>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <LookupCombo
                label="Finished goods inventory (debit)"
                value={debitLabel}
                selectedId={debitId}
                onInput={setDebitLabel}
                onSelect={(o) => {
                  setDebitId(o.id);
                  setDebitLabel(o.label);
                }}
                onClear={() => {
                  setDebitId(null);
                  setDebitLabel("");
                }}
                fetchOptions={(q) => fetchAccountOptions(q, "asset")}
                placeholder="Search asset account…"
                error={fieldErrors().debit_account_id}
                required
              />
              <LookupCombo
                label="Materials inventory (credit)"
                value={materialLabel}
                selectedId={materialId}
                onInput={setMaterialLabel}
                onSelect={(o) => {
                  setMaterialId(o.id);
                  setMaterialLabel(o.label);
                }}
                onClear={() => {
                  setMaterialId(null);
                  setMaterialLabel("");
                }}
                fetchOptions={(q) => fetchAccountOptions(q, "asset")}
                placeholder="Search asset account…"
                error={fieldErrors().credit_material_account_id}
                required
              />
              <Show when={needsConversion()}>
                <LookupCombo
                  label="Labor / overhead absorption (credit)"
                  value={conversionLabel}
                  selectedId={conversionId}
                  onInput={setConversionLabel}
                  onSelect={(o) => {
                    setConversionId(o.id);
                    setConversionLabel(o.label);
                  }}
                  onClear={() => {
                    setConversionId(null);
                    setConversionLabel("");
                  }}
                  fetchOptions={(q) => fetchAccountOptions(q, "expense")}
                  placeholder="Search expense account…"
                  error={fieldErrors().credit_conversion_account_id}
                  required
                />
              </Show>
              <Field label="Remark">
                <input class={inputClass} value={remark()} onInput={(e) => setRemark(e.currentTarget.value)} />
              </Field>
            </div>

            <table class="erp-grid min-w-full text-left text-sm">
              <thead class="bg-brand-50 text-xs font-semibold uppercase text-brand-700">
                <tr>
                  <th class="px-3 py-2">Line</th>
                  <th class="px-3 py-2">Account</th>
                  <th class="px-3 py-2 text-right">Debit</th>
                  <th class="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                <For each={p().lines}>
                  {(line) => (
                    <tr class="border-t border-stroke/60">
                      <td class="px-3 py-2">{line.label}</td>
                      <td class="px-3 py-2 text-text-secondary">{accountLabelFor(line) || "—"}</td>
                      <td class="px-3 py-2 text-right">{line.debit > 0 ? formatMoney(line.debit) : ""}</td>
                      <td class="px-3 py-2 text-right">{line.credit > 0 ? formatMoney(line.credit) : ""}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>

            <Show when={fieldErrors().journal || fieldErrors().cost}>
              <p class="text-sm text-red-600">{fieldErrors().journal ?? fieldErrors().cost}</p>
            </Show>
            <Show when={isDraft()}>
              <p class="text-xs text-text-secondary">This updates the existing draft journal entry.</p>
            </Show>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="rounded-lg border border-stroke px-3 py-2 text-sm hover:bg-slate-50"
                onClick={props.onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={!canSave()}
                onClick={() => void handleSave()}
              >
                {saving() ? "Saving…" : isDraft() ? "Save accounts" : "Record in books"}
              </button>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
}
