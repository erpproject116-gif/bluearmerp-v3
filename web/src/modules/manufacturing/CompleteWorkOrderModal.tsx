import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import { handleSaveResult } from "../../shared/handleSaveResult";
import type { FormErrors } from "../../shared/formValidation";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { useToast } from "../../shared/toast";
import type { MfgMode } from "../production/mfgProductionMode";
import { MFG_COPY } from "../production/mfgProductionMode";

type MaterialNeedLine = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  bom_qty: number;
  bom_unit_code: string;
  scrap_qty: number;
  stock_to_issue: number;
  stock_unit_code: string;
  qty_on_hand: number;
  shortage: number;
  staged_qty?: number;
  track_lot?: boolean;
};

type MaterialNeeds = {
  bom_type?: string;
  qty_to_produce: number;
  finished_base_unit_code: string;
  output_qty: number;
  yield_pct: number;
  receive_qty: number;
  input_line?: MaterialNeedLine;
  lines: MaterialNeedLine[];
};

type WorkOrder = {
  id: number;
  work_order_no: string;
  qty_to_produce: number;
  finished_base_unit_code?: string;
  bom_type?: string;
};

export function CompleteWorkOrderModal(props: {
  open: boolean;
  workOrder: WorkOrder | null;
  mode: MfgMode;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const toast = useToast();
  const copy = () => MFG_COPY[props.mode];
  const [actualQty, setActualQty] = createSignal("");
  const [needs, setNeeds] = createSignal<MaterialNeeds | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});

  createEffect(() => {
    if (!props.open || !props.workOrder) {
      setNeeds(null);
      setActualQty("");
      setFieldErrors({});
      return;
    }
    setActualQty(String(props.workOrder.qty_to_produce));
    setLoading(true);
    void apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${props.workOrder.id}/material-needs`).then((res) => {
      setLoading(false);
      if (res.success && res.data) setNeeds(res.data);
    });
  });

  const confirm = async () => {
    const wo = props.workOrder;
    if (!wo) return;
    const trimmed = actualQty().trim();
    let actualInputQty: number | undefined;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        setFieldErrors({ actual_input_qty: "Actual qty must be a positive number." });
        return;
      }
      actualInputQty = n;
    }
    setFieldErrors({});
    setSaving(true);
    const body: { actual_input_qty?: number } = {};
    if (actualInputQty != null) body.actual_input_qty = actualInputQty;
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${wo.id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }, { silent: true });
    setSaving(false);
    const ok = handleSaveResult(res, toast, "Job completed.", { onFieldErrors: setFieldErrors });
    if (!ok) return;
    props.onCompleted();
    props.onClose();
  };

  const unit = () =>
    props.workOrder?.finished_base_unit_code ||
    needs()?.finished_base_unit_code ||
    "";

  const stagedCutTotal = () =>
    (needs()?.lines ?? []).reduce((sum, ln) => sum + (ln.staged_qty ?? 0), 0);

  return (
    <EntityModal
      open={props.open}
      title={`Complete ${props.workOrder?.work_order_no ?? "job"}`}
      onClose={props.onClose}
      onSave={() => void confirm()}
      saving={saving()}
      saveLabel="Complete job"
      singleColumn
    >
      <FormErrorSummary errors={fieldErrors} />
      <Show when={props.workOrder}>
        {(wo) => (
          <>
            <p class="text-sm text-text-secondary">
              Planned {copy().jobQtyLabel.toLowerCase()}: <strong>{wo().qty_to_produce} {unit()}</strong>
            </p>
            <Show when={props.mode === "disassembly" && stagedCutTotal() > 0}>
              <p class="text-sm text-text-secondary">
                Staged cut total: <strong>{stagedCutTotal().toFixed(4)}</strong> (posted as produced qty on complete)
              </p>
            </Show>
            <Field
              label={
                props.mode === "disassembly"
                  ? `Actual whole weight (${unit()}) *`
                  : `Actual input qty (${unit()}) — leave blank to use planned`
              }
            >
              <input
                class={inputClass}
                type="text"
                inputMode="decimal"
                value={actualQty()}
                onInput={(e) => setActualQty(e.currentTarget.value)}
              />
            </Field>
            <Show when={loading()}>
              <p class="text-sm text-text-secondary">Loading stock preview…</p>
            </Show>
            <Show when={needs()}>
              {(m) => (
                <div class="space-y-2">
                  <Show when={m().input_line}>
                    {(input) => (
                      <div class="rounded border border-stroke p-2 text-xs">
                        <p class="font-medium text-text-primary">{copy().materialsInputLabel}</p>
                        <p>
                          {input().component_code} — {input().component_name}: {input().stock_to_issue.toFixed(4)}{" "}
                          {input().stock_unit_code} (on hand {input().qty_on_hand.toFixed(4)})
                        </p>
                      </div>
                    )}
                  </Show>
                  <p class="text-sm font-medium text-text-primary">
                    {props.mode === "disassembly" ? copy().materialsOutputLabel : "Materials needed"}
                  </p>
                  <div class="overflow-x-auto rounded border border-stroke">
                    <table class="min-w-full text-left text-xs">
                      <thead class="bg-slate-50 text-text-secondary">
                        <tr>
                          <th class="px-2 py-1.5">Item</th>
                          <th class="px-2 py-1.5">Recipe qty</th>
                          <th class="px-2 py-1.5">{props.mode === "disassembly" ? "Expected" : "To issue"}</th>
                          <Show when={props.mode === "disassembly"}>
                            <th class="px-2 py-1.5">Staged weigh</th>
                          </Show>
                          <th class="px-2 py-1.5">On hand</th>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={m().lines}>
                          {(ln) => (
                            <tr class={ln.shortage > 0 ? "bg-red-50 text-red-800" : ""}>
                              <td class="px-2 py-1.5">
                                {ln.component_code} — {ln.component_name}
                                <Show when={props.mode === "disassembly" && ln.track_lot === false}>
                                  <span class="ml-1 text-[10px] text-amber-700">(qty, not lot)</span>
                                </Show>
                              </td>
                              <td class="px-2 py-1.5">{ln.bom_qty} {ln.bom_unit_code}</td>
                              <td class="px-2 py-1.5">{ln.stock_to_issue.toFixed(4)} {ln.stock_unit_code}</td>
                              <Show when={props.mode === "disassembly"}>
                                <td class="px-2 py-1.5">{(ln.staged_qty ?? 0).toFixed(4)}</td>
                              </Show>
                              <td class="px-2 py-1.5">
                                {ln.qty_on_hand.toFixed(4)}
                                <Show when={ln.shortage > 0}>
                                  <span class="ml-1 font-medium">(short {ln.shortage.toFixed(4)})</span>
                                </Show>
                              </td>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Show>
          </>
        )}
      </Show>
    </EntityModal>
  );
}
