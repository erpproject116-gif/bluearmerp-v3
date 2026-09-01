import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { parseAndDedupeSerialBulkInput } from "../../shared/serialBulkParse";
import { parseAndDedupeLotBulkInput } from "../../shared/lotBulkParse";
import { resolveSerialBulk } from "../../shared/resolveSerialBulk";
import { LotLineCell } from "../../shared/LotLineCell";
import type { LotBatchRow } from "../../shared/useSerialLotList";
import { ProductionLayout } from "./ProductionLayout";
import { jobsHref } from "./mfgProductionMode";

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
  const toast = useToast();
  const [searchParams] = useSearchParams();
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

  const loadWo = async (id: number) => {
    setLoading(true);
    const [ctxRes, needsRes, woRes] = await Promise.all([
      apiFetch<ScanContext>(`/api/v1/manufacturing/work-orders/${id}/scan-context`),
      apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${id}/material-needs`),
      apiFetch<WorkOrderOption>(`/api/v1/manufacturing/work-orders/${id}`),
    ]);
    setLoading(false);
    if (!ctxRes.success || !ctxRes.data) {
      toast.warning(ctxRes.message ?? "Failed to load work order.");
      setContext(null);
      setNeeds(null);
      return;
    }
    if (ctxRes.data.status !== "released") {
      toast.warning("Select a released work order.");
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
    const firstTracked = ctxRes.data.components.find((c) => c.track_serial || c.track_lot);
    setActiveComponentId(firstTracked?.component_item_id ?? ctxRes.data.components[0]?.component_item_id ?? null);
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
      toast.warning("Paste at least one serial number.");
      return;
    }
    setBusy(true);
    const resolved = await resolveSerialBulk(serials, {
      locationId: wo.location_id,
      itemId: comp.component_item_id,
      context: "release",
    });
    if (resolved.errors.length > 0) {
      toast.warning(resolved.errors.slice(0, 3).join(" "));
      setBusy(false);
      return;
    }
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-serials`, {
      method: "POST",
      body: JSON.stringify({ serial_unit_ids: resolved.units.map((u) => u.serial_unit_id) }),
    });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to issue serials.");
      return;
    }
    toast.success("Serials staged for issue.");
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
      toast.warning("Paste lot lines (lot no., qty per line).");
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
        toast.warning(res.message ?? "Failed to issue lots.");
      } else {
        toast.success("Lots staged for issue.");
        setLotPaste("");
        await refreshContext();
      }
    } catch (e) {
      toast.warning(e instanceof Error ? e.message : "Failed to resolve lots.");
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
      toast.warning("Enter a positive quantity.");
      return;
    }
    setBusy(true);
    const res = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/issue-lots`, {
      method: "POST",
      body: JSON.stringify({ lines: [{ lot_batch_id: lotBatchId(), qty }] }),
    });
    setBusy(false);
    if (!res.success) {
      toast.warning(res.message ?? "Failed to issue lot.");
      return;
    }
    toast.success("Lot staged for issue.");
    setLotBatchId(null);
    setLotNo("");
    setLotQty("1");
    await refreshContext();
  };

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <A href={`${jobsHref("assembly")}?status=released`} class="text-xs font-medium text-brand-700 hover:underline">
            ← Work orders
          </A>
          <h2 class="mt-2 text-lg font-semibold text-text-primary">Issue station</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Select a released work order, then stage component serials or lots before completion.
          </p>
          <div class="mt-4 max-w-lg">
            <LookupCombo
              label="Work order (released)"
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
          <p class="text-sm text-text-secondary">Loading work order…</p>
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
                                  onClick={() => setActiveComponentId(ln.component_item_id)}
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
                      <Field label="Paste serial numbers (comma or newline separated)">
                        <textarea
                          class={inputClass}
                          rows={4}
                          value={serialPaste()}
                          onInput={(e) => setSerialPaste(e.currentTarget.value)}
                        />
                      </Field>
                      <button
                        type="button"
                        class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
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
                            type="number"
                            min="0"
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
