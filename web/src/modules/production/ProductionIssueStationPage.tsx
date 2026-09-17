import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { parseAndDedupeSerialBulkInput } from "../../shared/serialBulkParse";
import { parseAndDedupeLotBulkInput } from "../../shared/lotBulkParse";
import { resolveSerialBulk } from "../../shared/resolveSerialBulk";
import { LotLineCell } from "../../shared/LotLineCell";
import type { LotBatchRow } from "../../shared/useSerialLotList";
import { ProductionLayout } from "./ProductionLayout";
import { jobsHref, parseMfgMode } from "./mfgProductionMode";
import { mfgSuccess, mfgWarn } from "./mfgToast";

type WorkOrderOption = {
  id: number;
  work_order_no: string;
  finished_item_name?: string;
  bom_code?: string;
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
  work_order_no: string;
  status: string;
  location_id: number;
  location_name: string;
  components: ScanComponent[];
};

type MaterialNeeds = {
  lines: {
    component_item_id: number;
    component_code: string;
    component_name: string;
    stock_to_issue: number;
    stock_unit_code: string;
    qty_on_hand: number;
    shortage: number;
  }[];
};

async function fetchReleasedWorkOrders(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "released", sort: "order_date", order: "desc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<WorkOrderOption[]>(`/api/v1/manufacturing/work-orders?${qs}`);
  return (res.data ?? []).map((wo) => ({
    id: wo.id,
    label: `${wo.work_order_no} — ${wo.finished_item_name ?? wo.bom_code ?? ""}`.trim(),
  }));
}

async function resolveLotBatchIds(
  rows: { lot_no: string; qty: number }[],
  itemId: number,
  locationId: number,
): Promise<{ lot_batch_id: number; qty: number }[]> {
  const out: { lot_batch_id: number; qty: number }[] = [];
  for (const row of rows) {
    const qs = new URLSearchParams({
      page: "1",
      pageSize: "5",
      item_id: String(itemId),
      location_id: String(locationId),
      free_only: "true",
      q: row.lot_no,
    });
    const res = await apiFetch<LotBatchRow[]>(`/api/v1/inventory/lot-batches?${qs}`);
    const match = (res.data ?? []).find((b) => b.lot_no.toLowerCase() === row.lot_no.toLowerCase());
    if (!match) throw new Error(`Lot ${row.lot_no} not found with free qty at this location.`);
    const free =
      match.qty_available != null && Number.isFinite(match.qty_available)
        ? Number(match.qty_available)
        : Number(match.qty_on_hand);
    if (row.qty > free + 0.0001) {
      throw new Error(`Lot ${row.lot_no} only has ${free.toFixed(4)} free.`);
    }
    out.push({ lot_batch_id: match.id, qty: row.qty });
  }
  return out;
}

export default function ProductionIssueStationPage() {
  const [searchParams] = useSearchParams();
  const mode = () => parseMfgMode(String(searchParams.mode ?? "")) ?? "assembly";
  const jobsBackHref = () => `${jobsHref(mode())}?status=open`;
  const stationTitle = () => (mode() === "disassembly" ? "Take from stock" : "Take materials");
  const [woLabel, setWoLabel] = createSignal("");
  const [woId, setWoId] = createSignal<number | null>(null);
  const [context, setContext] = createSignal<ScanContext | null>(null);
  const [needs, setNeeds] = createSignal<MaterialNeeds | null>(null);
  const [activeComponentId, setActiveComponentId] = createSignal<number | null>(null);
  const [serialPaste, setSerialPaste] = createSignal("");
  const [lotPaste, setLotPaste] = createSignal("");
  const [lotBatchId, setLotBatchId] = createSignal<number | null>(null);
  const [lotNo, setLotNo] = createSignal("");
  const [lotQty, setLotQty] = createSignal("1");
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [prefilled, setPrefilled] = createSignal(false);

  const activeComponent = () => context()?.components.find((c) => c.component_item_id === activeComponentId());

  const remainingSerialNeed = (comp: ScanComponent) => {
    const need = Math.max(0, Math.round(comp.stock_to_issue) - (comp.issued_serials || 0));
    return need;
  };

  const remainingLotNeed = (comp: ScanComponent) => {
    const need = Math.max(0, Number(comp.stock_to_issue) - Number(comp.issued_lot_qty || 0));
    return need;
  };

  /** Cue on the materials list: which rows still need the operator to enter a serial or lot. */
  const rowActionHint = (comp: ScanComponent | undefined): { label: string; needsAction: boolean } => {
    if (!comp) return { label: "—", needsAction: false };
    if (comp.track_serial) {
      const need = remainingSerialNeed(comp);
      if (need > 0) return { label: `Select — enter ${need} serial${need === 1 ? "" : "s"}`, needsAction: true };
      return { label: "Serials done", needsAction: false };
    }
    if (comp.track_lot) {
      const need = remainingLotNeed(comp);
      if (need > 0.0001) return { label: "Select — enter lot", needsAction: true };
      return { label: "Lot done", needsAction: false };
    }
    return { label: "No serial/lot", needsAction: false };
  };

  const loadWo = async (id: number) => {
    setLoading(true);
    const [ctxRes, needsRes, woRes] = await Promise.all([
      apiFetch<ScanContext>(`/api/v1/manufacturing/work-orders/${id}/scan-context`),
      apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${id}/material-needs`),
      apiFetch<WorkOrderOption>(`/api/v1/manufacturing/work-orders/${id}`),
    ]);
    setLoading(false);
    if (!ctxRes.success || !ctxRes.data) {
      const detail =
        ctxRes.errors?.scan_context ||
        ctxRes.assist?.detail ||
        ctxRes.message;
      mfgWarn(detail, "This job isn’t available. Go back to Jobs and open it again.");
      setContext(null);
      setNeeds(null);
      return;
    }
    if (ctxRes.data.status !== "released") {
      mfgWarn(null, "Start the job first, then try this step again.");
      setContext(null);
      setNeeds(null);
      return;
    }
    setWoId(id);
    if (woRes.success && woRes.data) {
      setWoLabel(
        `${woRes.data.work_order_no} — ${woRes.data.finished_item_name ?? woRes.data.bom_code ?? ""}`.trim(),
      );
    } else {
      setWoLabel(ctxRes.data.work_order_no);
    }
    setContext(ctxRes.data);
    setNeeds(needsRes.success ? needsRes.data ?? null : null);
    const firstNeed =
      ctxRes.data.components.find(
        (c) =>
          (c.track_serial && c.issued_serials < Math.round(c.stock_to_issue)) ||
          (c.track_lot && c.issued_lot_qty + 0.0001 < c.stock_to_issue),
      ) ?? ctxRes.data.components.find((c) => c.track_serial || c.track_lot);
    const firstId = firstNeed?.component_item_id ?? ctxRes.data.components[0]?.component_item_id ?? null;
    setActiveComponentId(firstId);
    setSerialPaste("");
    setLotPaste("");
    setLotBatchId(null);
    setLotNo("");
    setLotQty("1");
    if (!firstNeed) {
      mfgWarn(null, "Nothing left to take — go back and Finish build.");
    }
  };

  createEffect(() => {
    if (prefilled()) return;
    const raw = String(searchParams.woId ?? "").trim();
    const id = Number(raw);
    if (!raw || !Number.isFinite(id) || id <= 0) return;
    setPrefilled(true);
    void loadWo(id);
  });

  const refreshContext = async () => {
    const id = woId();
    if (!id) return;
    await loadWo(id);
  };

  const issueSerials = async () => {
    const wo = context();
    const comp = activeComponent();
    const id = woId();
    if (!wo || !comp || !id || !comp.track_serial) return;
    const serials = parseAndDedupeSerialBulkInput(serialPaste());
    if (serials.length === 0) {
      mfgWarn(null, "Paste at least one serial number.");
      return;
    }
    setBusy(true);
    const resolved = await resolveSerialBulk(serials, {
      locationId: wo.location_id,
      itemId: comp.component_item_id,
      context: "release",
    });
    if (resolved.errors.length > 0) {
      mfgWarn(resolved.errors.slice(0, 3).join(" "), "Could not match those serials. Check them and try again.");
      setBusy(false);
      return;
    }
    const need = remainingSerialNeed(comp);
    let unitIds = resolved.units.map((u) => u.serial_unit_id);
    if (need > 0 && unitIds.length > need) {
      unitIds = unitIds.slice(0, need);
      mfgWarn(null, `Only the first ${need} serial(s) are needed — extra lines were ignored.`);
    }
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-serials`, {
      method: "POST",
      body: JSON.stringify({ serial_unit_ids: unitIds }),
    });
    setBusy(false);
    if (!res.success) {
      mfgWarn(res.message, "Could not take that from stock. Check the serial and try again.");
      return;
    }
    mfgSuccess("Taken from stock. Next: Record finished (or Finish build).");
    setSerialPaste("");
    await refreshContext();
  };

  const issueLotsFromPaste = async () => {
    const wo = context();
    const comp = activeComponent();
    const id = woId();
    if (!wo || !comp || !id || !comp.track_lot) return;
    const rows = parseAndDedupeLotBulkInput(lotPaste());
    if (rows.length === 0) {
      mfgWarn(null, "Paste lot lines (lot number and qty per line).");
      return;
    }
    setBusy(true);
    try {
      const lines = await resolveLotBatchIds(rows, comp.component_item_id, wo.location_id);
      const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-lots`, {
        method: "POST",
        body: JSON.stringify({ lines }),
      });
      if (!res.success) {
        mfgWarn(res.message, "Could not take those lots from stock. Try again.");
      } else {
        mfgSuccess("Taken from stock. Next: Record parts (or Finish).");
        setLotPaste("");
        await refreshContext();
      }
    } catch (e) {
      mfgWarn(e instanceof Error ? e.message : null, "Could not find those lots. Check the lot numbers.");
    }
    setBusy(false);
  };

  const issueSingleLot = async () => {
    const wo = context();
    const comp = activeComponent();
    const id = woId();
    if (!wo || !comp || !id || !comp.track_lot || !lotBatchId()) return;
    const qty = Number(lotQty());
    if (!(qty > 0)) {
      mfgWarn(null, "Enter how many you got (must be more than 0).");
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-lots`, {
      method: "POST",
      body: JSON.stringify({ lines: [{ lot_batch_id: lotBatchId(), qty }] }),
    });
    setBusy(false);
    if (!res.success) {
      mfgWarn(res.message, "Could not take that lot from stock. Try again.");
      return;
    }
    mfgSuccess("Taken from stock. Next: Record parts (or Finish).");
    setLotBatchId(null);
    setLotNo("");
    setLotQty("1");
    await refreshContext();
  };

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <A href={jobsBackHref()} class="text-xs font-medium text-brand-700 hover:underline">
            ← Jobs
          </A>
          <h2 class="mt-2 text-lg font-semibold text-text-primary">{stationTitle()}</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Only needed when this item uses serial or lot numbers. If not, skip to the next step and Finish the job.
          </p>
          <div class="mt-4 max-w-lg">
            <LookupCombo
              label="Job (started)"
              value={woLabel}
              selectedId={woId}
              onInput={setWoLabel}
              onSelect={(o) => {
                setWoId(o.id);
                setWoLabel(o.label);
                void loadWo(o.id);
              }}
              onClear={() => {
                setWoId(null);
                setWoLabel("");
                setContext(null);
                setNeeds(null);
              }}
              fetchOptions={fetchReleasedWorkOrders}
            />
          </div>
        </section>

        <Show when={loading()}>
          <p class="text-sm text-text-secondary">Loading job…</p>
        </Show>

        <Show when={context()}>
          {(ctx) => (
            <>
              <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                <p class="text-sm font-medium text-text-primary">
                  {ctx().work_order_no} · {ctx().location_name}
                </p>
                <Show when={needs()}>
                  {(m) => (
                    <div class="mt-3 space-y-2">
                      <p class="text-xs text-text-secondary">
                        Select each item marked for a serial (or lot), then enter it in the panel below.
                      </p>
                      <div class="overflow-x-auto rounded border border-stroke">
                        <table class="min-w-full text-left text-xs">
                          <thead class="bg-slate-50 text-text-secondary">
                            <tr>
                              <th class="px-2 py-1.5">Component</th>
                              <th class="px-2 py-1.5">To issue</th>
                              <th class="px-2 py-1.5">On hand</th>
                              <th class="px-2 py-1.5">Staged</th>
                              <th class="px-2 py-1.5">Your next step</th>
                            </tr>
                          </thead>
                          <tbody>
                            <For each={m().lines}>
                              {(ln) => {
                                const staged = ctx().components.find((c) => c.component_item_id === ln.component_item_id);
                                const hint = rowActionHint(staged);
                                const selected = activeComponentId() === ln.component_item_id;
                                return (
                                  <tr
                                    class={`cursor-pointer ${selected ? "bg-brand-50" : ""} ${ln.shortage > 0 ? "text-red-800" : ""}`}
                                    onClick={() => {
                                      setActiveComponentId(ln.component_item_id);
                                      setSerialPaste("");
                                      setLotPaste("");
                                      setLotBatchId(null);
                                      setLotNo("");
                                      setLotQty("1");
                                    }}
                                  >
                                    <td class="px-2 py-1.5">
                                      <span class="font-medium">{ln.component_code}</span>
                                      <span class="text-text-secondary"> — {ln.component_name}</span>
                                      <Show when={hint.needsAction && staged?.track_serial}>
                                        <span class="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                          Serial required
                                        </span>
                                      </Show>
                                      <Show when={hint.needsAction && staged?.track_lot && !staged?.track_serial}>
                                        <span class="ml-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                                          Lot required
                                        </span>
                                      </Show>
                                    </td>
                                    <td class="px-2 py-1.5">
                                      {ln.stock_to_issue.toFixed(4)} {ln.stock_unit_code}
                                    </td>
                                    <td class="px-2 py-1.5">{ln.qty_on_hand.toFixed(4)}</td>
                                    <td class="px-2 py-1.5">
                                      {staged?.track_serial
                                        ? `${staged.issued_serials} serial(s)`
                                        : staged?.track_lot
                                          ? `${staged.issued_lot_qty.toFixed(4)} lot qty`
                                          : "—"}
                                    </td>
                                    <td
                                      class={`px-2 py-1.5 ${hint.needsAction ? "font-medium text-amber-900" : "text-text-secondary"}`}
                                    >
                                      {selected && hint.needsAction ? "Selected — enter below" : hint.label}
                                    </td>
                                  </tr>
                                );
                              }}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Show>
              </section>

              <Show when={activeComponent()}>
                {(comp) => (
                  <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
                    <h3 class="font-medium text-text-primary">
                      Issue: {comp().component_code} — {comp().component_name}
                    </h3>
                    <Show when={comp().track_serial}>
                      <p class="mt-1 text-xs text-text-secondary">
                        Need {remainingSerialNeed(comp())} more serial(s). Enter or paste serial numbers for this item
                        (one per line), then Stage.
                      </p>
                      <Field label="Serial numbers">
                        <textarea
                          class={inputClass}
                          rows={4}
                          value={serialPaste()}
                          onInput={(e) => setSerialPaste(e.currentTarget.value)}
                          aria-label="Serial numbers to take"
                          placeholder="One serial per line"
                        />
                      </Field>
                      <button
                        type="button"
                        class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                        disabled={busy() || remainingSerialNeed(comp()) <= 0}
                        onClick={() => void issueSerials()}
                      >
                        Stage serials
                      </button>
                    </Show>
                    <Show when={comp().track_lot && !comp().track_serial}>
                      <p class="mt-1 text-xs text-text-secondary">
                        Need {remainingLotNeed(comp()).toFixed(4)} more. Pick a free lot batch (or paste lot lines), then
                        Stage.
                      </p>
                      <div class="mt-3 space-y-4">
                        <Field label="Pick lot batch (free qty only)">
                          <LotLineCell
                            itemId={comp().component_item_id}
                            locationId={context()?.location_id}
                            lotBatchId={lotBatchId()}
                            lotNo={lotNo()}
                            freeOnly
                            onChange={(id, no, qtyAvailable) => {
                              setLotBatchId(id);
                              setLotNo(no);
                              if (qtyAvailable != null && Number.isFinite(qtyAvailable) && qtyAvailable > 0) {
                                const need = remainingLotNeed(comp());
                                const take = Math.min(qtyAvailable, need > 0 ? need : qtyAvailable);
                                setLotQty(String(take));
                              }
                            }}
                          />
                        </Field>
                        <Field label="Qty">
                          <input
                            class={inputClass}
                            type="text"
                            inputMode="decimal"
                            value={lotQty()}
                            onInput={(e) => setLotQty(e.currentTarget.value)}
                          />
                        </Field>
                        <button
                          type="button"
                          class="rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                          disabled={busy() || !lotBatchId()}
                          onClick={() => void issueSingleLot()}
                        >
                          Stage lot
                        </button>
                        <Field label="Or paste lots (lot no. tab qty per line)">
                          <textarea
                            class={inputClass}
                            rows={4}
                            value={lotPaste()}
                            onInput={(e) => setLotPaste(e.currentTarget.value)}
                          />
                        </Field>
                        <button
                          type="button"
                          class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium disabled:opacity-50"
                          disabled={busy()}
                          onClick={() => void issueLotsFromPaste()}
                        >
                          Stage pasted lots
                        </button>
                      </div>
                    </Show>
                    <Show when={!comp().track_serial && !comp().track_lot}>
                      <p class="mt-2 text-sm text-text-secondary">This component is not serial- or lot-tracked.</p>
                    </Show>
                  </section>
                )}
              </Show>
            </>
          )}
        </Show>
      </div>
    </ProductionLayout>
  );
}
