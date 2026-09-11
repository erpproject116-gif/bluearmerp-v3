import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { parseAndDedupeSerialBulkInput } from "../../shared/serialBulkParse";
import { parseAndDedupeLotBulkInput } from "../../shared/lotBulkParse";
import { ProductionLayout } from "./ProductionLayout";
import { jobsHref, parseMfgMode } from "./mfgProductionMode";
import { mfgSuccess, mfgWarn } from "./mfgToast";
import { DEFAULT_SERIAL_PREFIX } from "../../shared/printCode128Labels";

type WorkOrderOption = {
  id: number;
  work_order_no: string;
  finished_item_name?: string;
  bom_code?: string;
  bom_name?: string;
  qty_to_produce?: number;
  source_sales_order_no?: string | null;
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
  bom_code?: string;
  bom_name?: string;
  source_sales_order_no?: string | null;
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
  const [searchParams] = useSearchParams();
  const jobsBackHref = () => {
    const mode = parseMfgMode(String(searchParams.mode ?? "")) ?? "assembly";
    return `${jobsHref(mode)}?status=open`;
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
  const [allocBusy, setAllocBusy] = createSignal(false);

  const remainingOutputSerials = (ctx: ScanContext) =>
    Math.max(0, Math.round(ctx.qty_to_produce) - (ctx.output_serials || 0));

  const remainingOutputLotQty = (ctx: ScanContext) =>
    Math.max(0, Number(ctx.qty_to_produce) - (ctx.output_lot_qty || 0));

  /** Suggest one lot line for the remaining finished qty (operator can edit before Record). */
  const suggestLotPaste = (ctx: ScanContext) => {
    const need = remainingOutputLotQty(ctx);
    if (need <= 0) {
      setLotPaste("");
      return;
    }
    const code = (ctx.finished_item_code || "ITEM").trim() || "ITEM";
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const qtyStr = Number.isInteger(need) ? String(need) : need.toFixed(4);
    setLotPaste(`${day}-${code}-001\t${qtyStr}`);
  };

  const autoAllocateSerials = async (ctx: ScanContext, fillPaste: boolean) => {
    if (!ctx.track_serial) return;
    const need = remainingOutputSerials(ctx);
    if (need <= 0) {
      if (fillPaste) setSerialPaste("");
      return;
    }
    setAllocBusy(true);
    const res = await apiFetch<{ serials: string[]; count: number }>(
      "/api/v1/inventory/serial-units/allocate-numbers",
      {
        method: "POST",
        body: JSON.stringify({
          qty: need,
          prefix: DEFAULT_SERIAL_PREFIX,
          register_date: new Date().toISOString().slice(0, 10),
        }),
      },
      { silent: true },
    );
    setAllocBusy(false);
    if (!res.success || !(res.data?.serials?.length)) {
      mfgWarn(res.message, "Could not auto-create serial numbers. Paste them manually.");
      return;
    }
    if (fillPaste) {
      setSerialPaste((res.data.serials ?? []).join("\n"));
    }
  };

  const loadWo = async (id: number) => {
    setLoading(true);
    const [res, woRes] = await Promise.all([
      apiFetch<ScanContext>(`/api/v1/manufacturing/work-orders/${id}/scan-context`),
      apiFetch<WorkOrderOption>(`/api/v1/manufacturing/work-orders/${id}`),
    ]);
    setLoading(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "This job is not available. Go back to Jobs and open it again.");
      setContext(null);
      return;
    }
    if (res.data.status !== "released") {
      mfgWarn(null, "Start the job first, then try this step again.");
      setContext(null);
      return;
    }
    setWoId(id);
    let nextCtx: ScanContext = res.data;
    if (woRes.success && woRes.data) {
      setWoLabel(
        `${woRes.data.work_order_no} — ${woRes.data.finished_item_name ?? woRes.data.bom_code ?? ""}`.trim(),
      );
      nextCtx = {
        ...res.data,
        bom_code: woRes.data.bom_code,
        bom_name: woRes.data.bom_name,
        source_sales_order_no: woRes.data.source_sales_order_no,
      };
    } else {
      setWoLabel(res.data.work_order_no);
    }
    setContext(nextCtx);
    setLastResults([]);
    if (nextCtx.track_serial && remainingOutputSerials(nextCtx) > 0) {
      setLotPaste("");
      await autoAllocateSerials(nextCtx, true);
    } else if (nextCtx.track_lot && remainingOutputLotQty(nextCtx) > 0) {
      setSerialPaste("");
      suggestLotPaste(nextCtx);
    } else {
      setSerialPaste("");
      setLotPaste("");
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
    if (id) await loadWo(id);
  };

  const submitSerials = async () => {
    const id = woId();
    const ctx = context();
    if (!id || !ctx?.track_serial) return;
    const serials = parseAndDedupeSerialBulkInput(serialPaste());
    if (serials.length === 0) {
      mfgWarn(null, "Paste at least one serial number.");
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
      mfgWarn(res.message, "Could not record those serials. Try again.");
      return;
    }
    setLastResults(res.data.results ?? []);
    const accepted = (res.data.results ?? []).filter((r) => r.status === "accepted").length;
    mfgSuccess(`Recorded ${accepted} of ${serials.length} serial(s). Next: Finish the job.`);
    setSerialPaste("");
    await refreshContext();
  };

  const submitLots = async () => {
    const id = woId();
    const ctx = context();
    if (!id || !ctx?.track_lot) return;
    const rows = parseAndDedupeLotBulkInput(lotPaste());
    if (rows.length === 0) {
      mfgWarn(null, "Paste lot lines (lot, qty, and optional expiry).");
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
      mfgWarn(res.message, "Could not record those lots. Try again.");
      return;
    }
    setLastResults(res.data.results ?? []);
    const accepted = (res.data.results ?? []).filter((r) => r.status === "accepted").length;
    mfgSuccess(`Recorded ${accepted} of ${rows.length} lot row(s). Next: Finish the job.`);
    setLotPaste("");
    await refreshContext();
  };

  /** One-click: stage remaining finished qty; API invents lot no. if blank. */
  const recordRemainingLot = async () => {
    const id = woId();
    const ctx = context();
    if (!id || !ctx?.track_lot) return;
    const need = remainingOutputLotQty(ctx);
    if (need <= 0) {
      mfgWarn(null, "Nothing left to record — go back and Finish build.");
      return;
    }
    setBusy(true);
    const res = await apiFetch<{ results: BatchLotResult[] }>(
      `/api/v1/manufacturing/work-orders/${id}/output-lots/batch`,
      {
        method: "POST",
        body: JSON.stringify({
          scans: [{ client_scan_id: newClientScanId(), lot_no: "", qty: need }],
        }),
      },
    );
    setBusy(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "Could not record the finished lot. Try again.");
      return;
    }
    setLastResults(res.data.results ?? []);
    const accepted = (res.data.results ?? []).filter((r) => r.status === "accepted" || r.status === "idempotent_replay");
    const lotLabel = accepted[0] && "lot_no" in accepted[0] ? accepted[0].lot_no : "";
    mfgSuccess(
      lotLabel
        ? `Recorded lot ${lotLabel} (${need}). Next: Finish the job.`
        : `Recorded finished lot qty ${need}. Next: Finish the job.`,
    );
    setLotPaste("");
    await refreshContext();
  };

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <A href={jobsBackHref()} class="text-xs font-medium text-brand-700 hover:underline">
            ← Jobs
          </A>
          <h2 class="mt-2 text-lg font-semibold text-text-primary">Record finished product</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Only needed when the finished product uses serial or lot numbers. If not, skip this and Finish the job.
            For take-apart jobs, use <span class="font-medium">Record parts</span> on the job row instead.
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
            <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
              <p class="text-sm font-medium text-text-primary">
                Job {ctx().work_order_no}
                <Show when={ctx().bom_code}>
                  {" "}
                  · Recipe {ctx().bom_code}
                  <Show when={ctx().bom_name}> — {ctx().bom_name}</Show>
                </Show>
              </p>
              <p class="mt-1 text-xs text-text-secondary">
                {ctx().finished_item_code} — {ctx().finished_item_name}
              </p>
              <p class="mt-1 text-xs text-text-secondary">
                Planned: {ctx().qty_to_produce} · Staged:{" "}
                {ctx().track_serial ? `${ctx().output_serials} serial(s)` : `${ctx().output_lot_qty.toFixed(4)} lot qty`}
                <Show when={ctx().source_sales_order_no}>
                  {" "}
                  · Customer order {ctx().source_sales_order_no}
                </Show>
              </p>
              <p class="mt-2 text-xs text-amber-800">
                Staging does not update stock until you Finish build on the Jobs list.
              </p>

              <Show when={ctx().track_serial}>
                <p class="mt-3 text-xs text-text-secondary">
                  Need {remainingOutputSerials(ctx())} more finished serial(s). Numbers are auto-allocated when available —
                  review then Record.
                </p>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="rounded border border-stroke px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                    disabled={allocBusy() || remainingOutputSerials(ctx()) <= 0}
                    onClick={() => void autoAllocateSerials(ctx(), true)}
                  >
                    {allocBusy() ? "Allocating…" : "Generate serial numbers"}
                  </button>
                </div>
                <Field label="Finished-good serial numbers">
                  <textarea
                    class={`${inputClass} mt-2`}
                    rows={5}
                    value={serialPaste()}
                    onInput={(e) => setSerialPaste(e.currentTarget.value)}
                    aria-label="Finished-good serial numbers"
                  />
                </Field>
                <button
                  type="button"
                  class="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={busy()}
                  onClick={() => void submitSerials()}
                >
                  Record serials
                </button>
              </Show>

              <Show when={ctx().track_lot && !ctx().track_serial}>
                <Show
                  when={remainingOutputLotQty(ctx()) > 0}
                  fallback={
                    <div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
                      <p class="font-medium">Finished lot qty is already staged.</p>
                      <p class="mt-1 text-xs text-emerald-900">
                        Planned {ctx().qty_to_produce}, staged {ctx().output_lot_qty.toFixed(4)}.
                        {ctx().output_lot_qty > ctx().qty_to_produce + 0.0001
                          ? " Extra staged qty is OK — Finish build uses the Actual produced amount."
                          : " No more recording needed here."}
                      </p>
                      <A
                        href={jobsBackHref()}
                        class="mt-3 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
                      >
                        Back to Jobs → Finish build
                      </A>
                    </div>
                  }
                >
                  <p class="mt-3 text-xs text-text-secondary">
                    Need {remainingOutputLotQty(ctx()).toFixed(4)} more lot qty. A lot line is filled in for you — confirm,
                    or use one-click Record remaining.
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => void recordRemainingLot()}
                    >
                      Record remaining lot
                    </button>
                    <button
                      type="button"
                      class="rounded border border-stroke px-2 py-1 text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      disabled={busy()}
                      onClick={() => suggestLotPaste(ctx())}
                    >
                      Refill suggested lot
                    </button>
                  </div>
                  <Field label="Optional: edit lot (lot no. tab qty [tab expiry] [tab catch-weight kg])">
                    <textarea
                      class={`${inputClass} mt-2`}
                      rows={3}
                      placeholder={"LOT-001\t1"}
                      value={lotPaste()}
                      onInput={(e) => setLotPaste(e.currentTarget.value)}
                    />
                  </Field>
                  <button
                    type="button"
                    class="mt-3 rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-medium text-brand-800 hover:bg-brand-50 disabled:opacity-50"
                    disabled={busy() || !lotPaste().trim()}
                    onClick={() => void submitLots()}
                  >
                    Record edited lots
                  </button>
                </Show>
              </Show>

              <Show when={!ctx().track_serial && !ctx().track_lot}>
                <p class="mt-3 text-sm text-text-secondary">
                  Finished item is not serial- or lot-tracked. Use Finish build on Jobs to receive stock.
                </p>
              </Show>

              <Show when={!(ctx().track_lot && !ctx().track_serial && remainingOutputLotQty(ctx()) <= 0)}>
                <A
                  href={jobsBackHref()}
                  class="mt-4 inline-flex rounded-lg border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
                >
                  Done — back to Finish build
                </A>
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
