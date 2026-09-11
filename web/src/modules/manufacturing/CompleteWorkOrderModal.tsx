import { A } from "@solidjs/router";
import { createEffect, createSignal, For, Show } from "solid-js";
import { apiFetch } from "../../shared/api";
import { EntityModal, Field, inputClass } from "../../shared/SpreadsheetGrid";
import type { FormErrors } from "../../shared/formValidation";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import type { MfgMode } from "../production/mfgProductionMode";
import { jobsHref, MFG_COPY } from "../production/mfgProductionMode";
import { friendlyMfgMessage, mfgSuccess, mfgWarn } from "../production/mfgToast";

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

type ScanComponent = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  stock_to_issue: number;
  track_serial: boolean;
  track_lot: boolean;
  issued_serials: number;
  issued_lot_qty: number;
};

type ScanContext = {
  work_order_id: number;
  status: string;
  qty_to_produce?: number;
  track_serial?: boolean;
  track_lot?: boolean;
  output_serials?: number;
  output_lot_qty?: number;
  components: ScanComponent[];
};

type WorkOrder = {
  id: number;
  work_order_no: string;
  qty_to_produce: number;
  qty_produced?: number;
  status?: string;
  finished_base_unit_code?: string;
  bom_type?: string;
  components_tracked?: boolean;
  finished_track_serial?: boolean;
  finished_track_lot?: boolean;
};

export function CompleteWorkOrderModal(props: {
  open: boolean;
  workOrder: WorkOrder | null;
  mode: MfgMode;
  onClose: () => void;
  onCompleted: () => void;
  /** When true and WO is draft, release then complete (assembly Finish build). */
  releaseFirst?: boolean;
}) {
  const copy = () => MFG_COPY[effectiveMode()];
  const effectiveMode = (): Exclude<MfgMode, "all"> => {
    const bt = props.workOrder?.bom_type;
    if (bt === "disassembly") return "disassembly";
    if (bt === "recipe") return "recipe";
    if (props.mode === "disassembly") return "disassembly";
    if (props.mode === "recipe") return "recipe";
    return "assembly";
  };
  /** Assembly + Recipe: multi-in → one FG (take materials / record finished gates). */
  const isAssembly = () => {
    const m = effectiveMode();
    return m === "assembly" || m === "recipe";
  };
  const [actualQty, setActualQty] = createSignal("");
  const [needs, setNeeds] = createSignal<MaterialNeeds | null>(null);
  const [scan, setScan] = createSignal<ScanContext | null>(null);
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const [didRelease, setDidRelease] = createSignal(false);

  createEffect(() => {
    if (!props.open || !props.workOrder) {
      setNeeds(null);
      setScan(null);
      setActualQty("");
      setFieldErrors({});
      setDidRelease(false);
      return;
    }
    setActualQty(String(props.workOrder.qty_to_produce));
    setLoading(true);
    setDidRelease(false);
    void Promise.all([
      apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${props.workOrder.id}/material-needs`),
      apiFetch<ScanContext>(`/api/v1/manufacturing/work-orders/${props.workOrder.id}/scan-context`),
    ]).then(([needsRes, scanRes]) => {
      setLoading(false);
      if (needsRes.success && needsRes.data) setNeeds(needsRes.data);
      if (scanRes.success && scanRes.data) setScan(scanRes.data);
    });
  });

  const takeMaterialsGap = (): string | null => {
    const comps = scan()?.components ?? [];
    for (const c of comps) {
      if (c.track_serial) {
        const need = Math.round(c.stock_to_issue);
        if (c.issued_serials < need) {
          return `${c.component_code || c.component_name}: need ${need} serial(s), taken ${c.issued_serials}`;
        }
      } else if (c.track_lot) {
        if (c.issued_lot_qty + 0.0001 < c.stock_to_issue) {
          return `${c.component_code || c.component_name}: need ${c.stock_to_issue}, taken ${c.issued_lot_qty}`;
        }
      }
    }
    return null;
  };

  const recordFinishedGap = (): string | null => {
    const wo = props.workOrder;
    const s = scan();
    if (!wo || !isAssembly()) return null;
    // Wait for scan-context — treating missing scan as 0 falsely blocks Finish after Record finished.
    if (!s) return null;
    const trackSerial = Boolean(s.track_serial ?? wo.finished_track_serial);
    const trackLot = Boolean(s.track_lot ?? wo.finished_track_lot);
    const planned = Number(actualQty()) > 0 ? Number(actualQty()) : wo.qty_to_produce;
    if (trackSerial) {
      const need = Math.round(planned);
      const have = s.output_serials ?? 0;
      if (have < need) {
        return `Finished product: need ${need} serial(s), recorded ${have}`;
      }
    } else if (trackLot) {
      const have = s.output_lot_qty ?? 0;
      if (have + 0.0001 < planned) {
        return `Finished product: need ${planned} lot qty, recorded ${have}`;
      }
    }
    return null;
  };

  const continueHref = (kind: "issue" | "receive" | "auto" = "auto") => {
    const wo = props.workOrder;
    const m = effectiveMode();
    if (!wo) return jobsHref(m);
    if (kind === "issue" || (kind === "auto" && takeMaterialsGap())) {
      return `/app/production/issue-station?woId=${wo.id}&mode=${m}`;
    }
    if (kind === "receive" || (kind === "auto" && recordFinishedGap())) {
      return `/app/production/receive-station?woId=${wo.id}&mode=${m}`;
    }
    if (wo.components_tracked) {
      return `/app/production/issue-station?woId=${wo.id}&mode=${m}`;
    }
    if (wo.finished_track_serial || wo.finished_track_lot) {
      return `/app/production/receive-station?woId=${wo.id}&mode=${m}`;
    }
    return jobsHref(m);
  };

  const redirectAfterRelease = (message: string, kind: "issue" | "receive") => {
    mfgWarn(null, message);
    props.onCompleted();
    props.onClose();
    window.location.assign(continueHref(kind));
  };

  const tryRevertIfWeReleased = async (woId: number) => {
    if (!didRelease()) return;
    const rev = await apiFetch(`/api/v1/manufacturing/work-orders/${woId}/revert-draft`, { method: "POST" }, { silent: true });
    if (rev.success) {
      mfgWarn(null, "Finish failed — job put back to draft so you can edit or try again.");
      props.onCompleted();
    }
  };

  const confirm = async () => {
    const wo = props.workOrder;
    if (!wo) return;
    const trimmed = actualQty().trim();
    let actualInputQty: number | undefined;
    if (trimmed !== "") {
      const n = Number(trimmed);
      if (!Number.isFinite(n) || n <= 0) {
        setFieldErrors({
          actual_input_qty: isAssembly()
            ? "Enter how many you produced (must be more than 0)."
            : "Enter how many you used (must be more than 0).",
        });
        return;
      }
      actualInputQty = n;
    } else if (isAssembly()) {
      actualInputQty = wo.qty_to_produce;
    }
    setFieldErrors({});

    const materialsGap = isAssembly() ? takeMaterialsGap() : null;
    if (materialsGap) {
      const status = (wo.status ?? "").toLowerCase();
      if (props.releaseFirst && status === "draft") {
        setSaving(true);
        const rel = await apiFetch(
          `/api/v1/manufacturing/work-orders/${wo.id}/release`,
          { method: "POST" },
          { silent: true },
        );
        setSaving(false);
        if (!rel.success) {
          mfgWarn(rel.message, "Couldn’t start this job. Try Start job, then Continue.");
          return;
        }
        redirectAfterRelease("Job started. Take materials next, then Finish build.", "issue");
        return;
      }
      setFieldErrors({ stock: `Take materials first: ${materialsGap}` });
      return;
    }

    const finishedGap = isAssembly() ? recordFinishedGap() : null;
    if (finishedGap) {
      const status = (wo.status ?? "").toLowerCase();
      if (props.releaseFirst && status === "draft") {
        setSaving(true);
        const rel = await apiFetch(
          `/api/v1/manufacturing/work-orders/${wo.id}/release`,
          { method: "POST" },
          { silent: true },
        );
        setSaving(false);
        if (!rel.success) {
          mfgWarn(rel.message, "Couldn’t start this job. Try Start job, then Continue.");
          return;
        }
        redirectAfterRelease("Job started. Record finished serials/lots next, then Finish build.", "receive");
        return;
      }
      setFieldErrors({ stock: `Record finished product first: ${finishedGap}` });
      return;
    }

    setSaving(true);

    if (props.releaseFirst && (wo.status ?? "").toLowerCase() === "draft") {
      const rel = await apiFetch(
        `/api/v1/manufacturing/work-orders/${wo.id}/release`,
        { method: "POST" },
        { silent: true },
      );
      if (!rel.success) {
        setSaving(false);
        mfgWarn(rel.message, "Couldn’t start this job before finishing. Try Start job, then Finish build.");
        return;
      }
      setDidRelease(true);
    }

    const body: { actual_input_qty?: number; qty_produced?: number } = {};
    if (actualInputQty != null) {
      body.actual_input_qty = actualInputQty;
      if (isAssembly()) body.qty_produced = actualInputQty;
    }
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${wo.id}/complete`, {
      method: "POST",
      body: JSON.stringify(body),
    }, { silent: true });
    setSaving(false);
    if (!res.success) {
      const mapped: FormErrors = {};
      if (res.errors) {
        for (const [k, v] of Object.entries(res.errors)) {
          mapped[k] = friendlyMfgMessage(v, String(v));
        }
      }
      if (Object.keys(mapped).length > 0) setFieldErrors(mapped);
      await tryRevertIfWeReleased(wo.id);
      mfgWarn(
        res.message,
        props.releaseFirst
          ? "Could not finish this job. Take materials / record finished if needed, then try Finish build again."
          : "Could not finish this job. Check stock, then try again.",
      );
      return;
    }
    mfgSuccess(isAssembly() ? "Build finished. Stock is updated." : "Job finished. Stock is updated.");
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
      title={`${isAssembly() ? "Finish build" : "Finish"} ${props.workOrder?.work_order_no ?? "job"}`}
      onClose={props.onClose}
      onSave={() => void confirm()}
      saving={saving()}
      saveLabel={isAssembly() ? "Finish build" : "Finish job"}
      singleColumn
    >
      <FormErrorSummary errors={fieldErrors} />
      <Show when={props.workOrder}>
        {(wo) => (
          <>
            <p class="text-sm text-text-secondary">
              Planned {copy().jobQtyLabel.toLowerCase()}: <strong>{wo().qty_to_produce} {unit()}</strong>
            </p>
            <Show when={isAssembly() && takeMaterialsGap()}>
              {(gap) => (
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p class="font-medium">Take materials before Finish build</p>
                  <p class="mt-1 text-xs">{gap()}</p>
                  <A href={continueHref("issue")} class="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                    Open Take materials →
                  </A>
                </div>
              )}
            </Show>
            <Show when={isAssembly() && !takeMaterialsGap() && recordFinishedGap()}>
              {(gap) => (
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  <p class="font-medium">Record finished serials/lots before Finish build</p>
                  <p class="mt-1 text-xs">{gap()}</p>
                  <A href={continueHref("receive")} class="mt-2 inline-block text-xs font-semibold text-brand-700 hover:underline">
                    Open Record finished →
                  </A>
                </div>
              )}
            </Show>
            <Show when={effectiveMode() === "disassembly" && stagedCutTotal() > 0}>
              <p class="text-sm text-text-secondary">
                Parts recorded: <strong>{stagedCutTotal().toFixed(4)}</strong> (posted to stock when you Finish)
              </p>
            </Show>
            <Field
              label={
                effectiveMode() === "disassembly"
                  ? `How many wholes you actually used (${unit()}) *`
                  : `Actual produced (${unit()})`
              }
            >
              <input
                class={inputClass}
                type="text"
                inputMode="decimal"
                value={actualQty()}
                onInput={(e) => setActualQty(e.currentTarget.value)}
                aria-label="Actual produced"
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
                    {effectiveMode() === "disassembly" ? copy().materialsOutputLabel : "Materials needed"}
                  </p>
                  <div class="overflow-x-auto rounded border border-stroke">
                    <table class="min-w-full text-left text-xs">
                      <thead class="bg-slate-50 text-text-secondary">
                        <tr>
                          <th class="px-2 py-1.5">Item</th>
                          <th class="px-2 py-1.5">Recipe qty</th>
                          <th class="px-2 py-1.5">{effectiveMode() === "disassembly" ? "Expected" : "To issue"}</th>
                          <Show when={effectiveMode() === "disassembly"}>
                            <th class="px-2 py-1.5">Parts recorded</th>
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
                                <Show when={effectiveMode() === "disassembly" && ln.track_lot === false}>
                                  <span class="ml-1 text-[10px] text-amber-700">(qty, not lot)</span>
                                </Show>
                              </td>
                              <td class="px-2 py-1.5">{ln.bom_qty} {ln.bom_unit_code}</td>
                              <td class="px-2 py-1.5">{ln.stock_to_issue.toFixed(4)} {ln.stock_unit_code}</td>
                              <Show when={effectiveMode() === "disassembly"}>
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
