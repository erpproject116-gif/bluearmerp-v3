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
      available_only: "true",
      q: row.lot_no,
    });
    const res = await apiFetch<LotBatchRow[]>(`/api/v1/inventory/lot-batches?${qs}`);
    const match = (res.data ?? []).find((b) => b.lot_no.toLowerCase() === row.lot_no.toLowerCase());
    if (!match) throw new Error(`Lot ${row.lot_no} not found at location.`);
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
  const [suggestedSerials, setSuggestedSerials] = createSignal<{ id: number; serial_no: string }[]>([]);
  const [suggestBusy, setSuggestBusy] = createSignal(false);

  const activeComponent = () => context()?.components.find((c) => c.component_item_id === activeComponentId());

  const remainingSerialNeed = (comp: ScanComponent) => {
    const need = Math.max(0, Math.round(comp.stock_to_issue) - (comp.issued_serials || 0));
    return need;
  };

  const prefetchAvailableSerials = async (comp: ScanComponent, locationId: number, fillPaste: boolean) => {
    if (!comp.track_serial) {
      setSuggestedSerials([]);
      return;
    }
    const need = remainingSerialNeed(comp);
    if (need <= 0) {
      setSuggestedSerials([]);
      if (fillPaste) setSerialPaste("");
      return;
    }
    setSuggestBusy(true);
    const qs = new URLSearchParams({
      item_id: String(comp.component_item_id),
      location_id: String(locationId),
      free_only: "true",
      limit: String(Math.max(need, 20)),
    });
    const wo = woId();
    if (wo) qs.set("exclude_wo_id", String(wo));
    const res = await apiFetch<{ id: number; serial_no: string }[]>(
      `/api/v1/inventory/serial-units/available?${qs}`,
      undefined,
      { silent: true },
    );
    setSuggestBusy(false);
    const rows = (res.data ?? []).slice(0, need);
    setSuggestedSerials(rows);
    if (fillPaste && rows.length > 0) {
      setSerialPaste(rows.map((r) => r.serial_no).join("\n"));
    } else if (fillPaste) {
      setSerialPaste("");
    }
  };

  /** Pick the next free in-stock serials (not on sales / other jobs) and stage them. */
  const autoPickAndStageSerials = async () => {
    const wo = context();
    const comp = activeComponent();
    const id = woId();
    if (!wo || !comp || !id || !comp.track_serial) return;
    const need = remainingSerialNeed(comp);
    if (need <= 0) {
      mfgWarn(null, "This component already has enough serials staged.");
      return;
    }
    setBusy(true);
    const qs = new URLSearchParams({
      item_id: String(comp.component_item_id),
      location_id: String(wo.location_id),
      free_only: "true",
      exclude_wo_id: String(id),
      limit: String(need),
    });
    const avail = await apiFetch<{ id: number; serial_no: string }[]>(
      `/api/v1/inventory/serial-units/available?${qs}`,
      undefined,
      { silent: true },
    );
    const rows = (avail.data ?? []).slice(0, need);
    if (rows.length === 0) {
      setBusy(false);
      mfgWarn(
        null,
        "No free serials in stock at this warehouse (unreserved and not used on another open job). Receive stock first.",
      );
      setSuggestedSerials([]);
      setSerialPaste("");
      return;
    }
    setSuggestedSerials(rows);
    setSerialPaste(rows.map((r) => r.serial_no).join("\n"));
    const unitIds = rows.map((r) => r.id);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-serials`, {
      method: "POST",
      body: JSON.stringify({ serial_unit_ids: unitIds }),
    });
    setBusy(false);
    if (!res.success) {
      mfgWarn(res.message, "Could not auto-stage those serials. Try Refresh, then Stage serials.");
      return;
    }
    if (rows.length < need) {
      mfgWarn(
        null,
        `Staged ${rows.length} of ${need} needed serial(s). Receive more stock, then auto-pick again.`,
      );
    } else {
      mfgSuccess(`Auto-picked and staged ${rows.length} serial(s).`);
    }
    setSerialPaste("");
    await refreshContext();
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
    if (!firstNeed) {
      mfgWarn(null, "Nothing left to take — go back and Finish build.");
      setSuggestedSerials([]);
      setSerialPaste("");
    } else if (firstNeed.track_serial) {
      await prefetchAvailableSerials(firstNeed, ctxRes.data.location_id, true);
    } else {
      setSuggestedSerials([]);
      setSerialPaste("");
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
                    <div class="mt-3 overflow-x-auto rounded border border-stroke">
                      <table class="min-w-full text-left text-xs">
                        <thead class="bg-slate-50 text-text-secondary">
                          <tr>
                            <th class="px-2 py-1.5">Component</th>
                            <th class="px-2 py-1.5">To issue</th>
                            <th class="px-2 py-1.5">On hand</th>
                            <th class="px-2 py-1.5">Staged</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={m().lines}>
                            {(ln) => {
                              const staged = ctx().components.find((c) => c.component_item_id === ln.component_item_id);
                              return (
                                <tr
                                  class={`cursor-pointer ${activeComponentId() === ln.component_item_id ? "bg-brand-50" : ""} ${ln.shortage > 0 ? "text-red-800" : ""}`}
                                  onClick={() => {
                                    setActiveComponentId(ln.component_item_id);
                                    const staged = ctx().components.find((c) => c.component_item_id === ln.component_item_id);
                                    if (staged?.track_serial) {
                                      void prefetchAvailableSerials(staged, ctx().location_id, true);
                                    } else {
                                      setSuggestedSerials([]);
                                      setSerialPaste("");
                                    }
                                  }}
                                >
                                  <td class="px-2 py-1.5">{ln.component_code} — {ln.component_name}</td>
                                  <td class="px-2 py-1.5">{ln.stock_to_issue.toFixed(4)} {ln.stock_unit_code}</td>
                                  <td class="px-2 py-1.5">{ln.qty_on_hand.toFixed(4)}</td>
                                  <td class="px-2 py-1.5">
                                    {staged?.track_serial
                                      ? `${staged.issued_serials} serial(s)`
                                      : staged?.track_lot
                                        ? `${staged.issued_lot_qty.toFixed(4)} lot qty`
                                        : "—"}
                                  </td>
                                </tr>
                              );
                            }}
                          </For>
                        </tbody>
                      </table>
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
                        Need {remainingSerialNeed(comp())} more serial(s). Free in-stock serials (not reserved for a sale
                        and not staged on another open job) are listed oldest-first — Auto-pick stages them, or edit the
                        list and Stage.
                      </p>
                      <Show when={suggestBusy()}>
                        <p class="mt-1 text-xs text-text-secondary">Looking up free serials…</p>
                      </Show>
                      <Show when={!suggestBusy() && suggestedSerials().length === 0 && remainingSerialNeed(comp()) > 0}>
                        <p class="mt-1 text-xs text-amber-800">
                          No free serials at this warehouse for this item. Rows in red with 0 on hand need Receive first.
                          Otherwise paste serials manually if you know them.
                        </p>
                      </Show>
                      <Show when={!suggestBusy() && suggestedSerials().length > 0}>
                        <p class="mt-1 text-xs text-text-secondary">
                          Next free: {suggestedSerials().map((s) => s.serial_no).join(", ")}
                        </p>
                      </Show>
                      <div class="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                          disabled={busy() || suggestBusy() || !context() || remainingSerialNeed(comp()) <= 0}
                          onClick={() => void autoPickAndStageSerials()}
                        >
                          Auto-pick &amp; stage next free
                        </button>
                        <button
                          type="button"
                          class="rounded border border-stroke px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                          disabled={suggestBusy() || !context()}
                          onClick={() => {
                            const c = activeComponent();
                            const wo = context();
                            if (c && wo) void prefetchAvailableSerials(c, wo.location_id, true);
                          }}
                        >
                          Refresh free serials
                        </button>
                      </div>
                      <Field label="Serial numbers (auto-filled from free stock)">
                        <textarea
                          class={inputClass}
                          rows={4}
                          value={serialPaste()}
                          onInput={(e) => setSerialPaste(e.currentTarget.value)}
                          aria-label="Serial numbers to take"
                        />
                      </Field>
                      <button
                        type="button"
                        class="mt-3 rounded-lg border border-brand-600 px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
                        disabled={busy()}
                        onClick={() => void issueSerials()}
                      >
                        Stage serials
                      </button>
                    </Show>
                    <Show when={comp().track_lot && !comp().track_serial}>
                      <div class="mt-3 space-y-4">
                        <Field label="Pick lot batch">
                          <LotLineCell
                            itemId={comp().component_item_id}
                            locationId={ctx().location_id}
                            lotBatchId={lotBatchId()}
                            lotNo={lotNo()}
                            onChange={(id, no) => {
                              setLotBatchId(id);
                              setLotNo(no);
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
                          class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
