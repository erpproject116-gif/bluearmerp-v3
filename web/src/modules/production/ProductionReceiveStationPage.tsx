import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { useToast } from "../../shared/toast";
import { parseAndDedupeSerialBulkInput } from "../../shared/serialBulkParse";
import { parseAndDedupeLotBulkInput } from "../../shared/lotBulkParse";
import { ProductionLayout } from "./ProductionLayout";
import { jobsHref, parseMfgMode } from "./mfgProductionMode";

type WorkOrderOption = {
  id: number;
  work_order_no: string;
  finished_item_name?: string;
  bom_code?: string;
};

type ScanContext = {
  work_order_id: number;
  work_order_no: string;
  status: string;
  location_id: number;
  location_name: string;
  finished_item_code: string;
  finished_item_name: string;
  qty_to_produce: number;
  track_serial: boolean;
  track_lot: boolean;
  output_serials: number;
  output_lot_qty: number;
};

type BatchSerialResult = {
  serial_no: string;
  status: string;
  message?: string;
};

type BatchLotResult = {
  lot_no: string;
  qty?: number;
  status: string;
  message?: string;
};

function newClientScanId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function fetchReleasedWorkOrders(q: string): Promise<LookupOption[]> {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "released", sort: "order_date", order: "desc" });
  if (q) qs.set("q", q);
  const res = await apiFetch<WorkOrderOption[]>(`/api/v1/manufacturing/work-orders?${qs}`);
  return (res.data ?? []).map((wo) => ({
    id: wo.id,
    label: `${wo.work_order_no} — ${wo.finished_item_name ?? wo.bom_code ?? ""}`.trim(),
  }));
}

export default function ProductionReceiveStationPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const jobsBackHref = () => {
    const mode = parseMfgMode(String(searchParams.mode ?? "")) ?? "assembly";
    return `${jobsHref(mode)}?status=released`;
  };
  const [woLabel, setWoLabel] = createSignal("");
  const [woId, setWoId] = createSignal<number | null>(null);
  const [context, setContext] = createSignal<ScanContext | null>(null);
  const [serialPaste, setSerialPaste] = createSignal("");
  const [lotPaste, setLotPaste] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [lastResults, setLastResults] = createSignal<(BatchSerialResult | BatchLotResult)[]>([]);
  const [prefilled, setPrefilled] = createSignal(false);

  const loadWo = async (id: number) => {
    setLoading(true);
    const [res, woRes] = await Promise.all([
      apiFetch<ScanContext>(`/api/v1/manufacturing/work-orders/${id}/scan-context`),
      apiFetch<WorkOrderOption>(`/api/v1/manufacturing/work-orders/${id}`),
    ]);
    setLoading(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to load work order.");
      setContext(null);
      return;
    }
    if (res.data.status !== "released") {
      toast.warning("Select a released work order.");
      setContext(null);
      return;
    }
    setWoId(id);
    if (woRes.success && woRes.data) {
      setWoLabel(
        `${woRes.data.work_order_no} — ${woRes.data.finished_item_name ?? woRes.data.bom_code ?? ""}`.trim(),
      );
    } else {
      setWoLabel(res.data.work_order_no);
    }
    setContext(res.data);
    setSerialPaste("");
    setLotPaste("");
    setLastResults([]);
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
    if (id) await loadWo(id);
  };

  const submitSerials = async () => {
    const id = woId();
    const ctx = context();
    if (!id || !ctx?.track_serial) return;
    const serials = parseAndDedupeSerialBulkInput(serialPaste());
    if (serials.length === 0) {
      toast.warning("Paste at least one finished-good serial.");
      return;
    }
    setBusy(true);
    const scans = serials.map((serial_no) => ({ client_scan_id: newClientScanId(), serial_no }));
    const res = await apiFetch<{ results: BatchSerialResult[] }>(
      `/api/v1/manufacturing/work-orders/${id}/output-serials/batch`,
      { method: "POST", body: JSON.stringify({ scans }) },
    );
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to stage output serials.");
      return;
    }
    setLastResults(res.data.results ?? []);
    const accepted = (res.data.results ?? []).filter((r) => r.status === "accepted").length;
    toast.success(`Staged ${accepted} of ${serials.length} serial(s).`);
    setSerialPaste("");
    await refreshContext();
  };

  const submitLots = async () => {
    const id = woId();
    const ctx = context();
    if (!id || !ctx?.track_lot) return;
    const rows = parseAndDedupeLotBulkInput(lotPaste());
    if (rows.length === 0) {
      toast.warning("Paste lot lines (lot no. tab qty; optional tab expiry YYYY-MM-DD).");
      return;
    }
    setBusy(true);
    const scans = rows.map((row) => ({
      client_scan_id: newClientScanId(),
      lot_no: row.lot_no,
      qty: row.catch_weight && row.catch_weight > 0 ? row.catch_weight : row.qty,
      expiry_date: row.expiry_date ?? undefined,
      catch_weight: row.catch_weight && row.catch_weight > 0 ? row.catch_weight : undefined,
    }));
    const res = await apiFetch<{ results: BatchLotResult[] }>(
      `/api/v1/manufacturing/work-orders/${id}/output-lots/batch`,
      { method: "POST", body: JSON.stringify({ scans }) },
    );
    setBusy(false);
    if (!res.success || !res.data) {
      toast.warning(res.message ?? "Failed to stage output lots.");
      return;
    }
    setLastResults(res.data.results ?? []);
    const accepted = (res.data.results ?? []).filter((r) => r.status === "accepted").length;
    toast.success(`Staged ${accepted} of ${rows.length} lot row(s).`);
    setLotPaste("");
    await refreshContext();
  };

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <A href={jobsBackHref()} class="text-xs font-medium text-brand-700 hover:underline">
            ← Work orders
          </A>
          <h2 class="mt-2 text-lg font-semibold text-text-primary">Receive / weigh station</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Stage finished-good serials or lots on a released job before completion posts them to stock.
            For catch-weight, paste <span class="font-medium">lot · qty · expiry · catch-weight kg</span> (4th column optional; when set it becomes stock qty).
            Multi-cut disassembly lot posting on complete is available after weighing cut SKUs (see Weigh parts on the job).
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
            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <p class="text-sm font-medium text-text-primary">
                {ctx().work_order_no} · {ctx().finished_item_code} — {ctx().finished_item_name}
              </p>
              <p class="mt-1 text-xs text-text-secondary">
                Qty to produce: {ctx().qty_to_produce} · Staged:{" "}
                {ctx().track_serial ? `${ctx().output_serials} serial(s)` : `${ctx().output_lot_qty.toFixed(4)} lot qty`}
              </p>

              <Show when={ctx().track_serial}>
                <Field label="Paste finished-good serial numbers">
                  <textarea
                    class={`${inputClass} mt-2`}
                    rows={5}
                    value={serialPaste()}
                    onInput={(e) => setSerialPaste(e.currentTarget.value)}
                  />
                </Field>
                <button
                  type="button"
                  class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void submitSerials()}
                >
                  Stage output serials
                </button>
              </Show>

              <Show when={ctx().track_lot && !ctx().track_serial}>
                <Field label="Paste lots (lot no. tab qty [tab expiry] [tab catch-weight kg])">
                  <textarea
                    class={`${inputClass} mt-2`}
                    rows={5}
                    placeholder={"LOT-001\t10\t2025-07-01\t9.85\nLOT-002\t5"}
                    value={lotPaste()}
                    onInput={(e) => setLotPaste(e.currentTarget.value)}
                  />
                </Field>
                <button
                  type="button"
                  class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void submitLots()}
                >
                  Stage output lots
                </button>
              </Show>

              <Show when={!ctx().track_serial && !ctx().track_lot}>
                <p class="mt-3 text-sm text-text-secondary">
                  Finished item is not serial- or lot-tracked. Complete the work order from Work Orders to receive stock.
                </p>
              </Show>
            </section>
          )}
        </Show>

        <Show when={lastResults().length > 0}>
          <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
            <h3 class="text-sm font-semibold text-text-primary">Last batch results</h3>
            <ul class="mt-2 max-h-48 overflow-auto text-xs">
              <For each={lastResults()}>
                {(r) => (
                  <li class={r.status === "accepted" ? "text-green-800" : "text-red-700"}>
                    {"serial_no" in r ? r.serial_no : r.lot_no} — {r.status}
                    {r.message ? `: ${r.message}` : ""}
                  </li>
                )}
              </For>
            </ul>
          </section>
        </Show>
      </div>
    </ProductionLayout>
  );
}
