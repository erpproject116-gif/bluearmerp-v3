import { createSignal, For, Show, createEffect } from "solid-js";
import { A, useSearchParams } from "@solidjs/router";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { DateInput } from "../../shared/DateInput";
import { ProductionLayout } from "./ProductionLayout";
import { jobsHref, parseMfgMode } from "./mfgProductionMode";
import { mfgSuccess, mfgWarn } from "./mfgToast";

type WorkOrderOption = {
  id: number;
  work_order_no: string;
  finished_item_name?: string;
  bom_code?: string;
};

type BomDetail = {
  id: number;
  bom_type?: string;
  finished_item_code?: string;
  lines?: {
    component_item_id: number;
    component_code?: string;
    component_name?: string;
    qty: number;
  }[];
};

type WorkOrderDetail = {
  id: number;
  work_order_no: string;
  bom_id: number;
  qty_to_produce: number;
  status: string;
  finished_item_name?: string;
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

export default function ProductionWeighPartsPage() {
  const [searchParams] = useSearchParams();
  const jobsBackHref = () => `${jobsHref(parseMfgMode(String(searchParams.mode ?? "")) ?? "disassembly")}?status=released`;
  const [woLabel, setWoLabel] = createSignal("");
  const [woId, setWoId] = createSignal<number | null>(null);
  const [wo, setWo] = createSignal<WorkOrderDetail | null>(null);
  const [bom, setBom] = createSignal<BomDetail | null>(null);
  const [cutId, setCutId] = createSignal<number | null>(null);
  const [lotNo, setLotNo] = createSignal("");
  const [weight, setWeight] = createSignal("");
  const [expiry, setExpiry] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [loading, setLoading] = createSignal(false);

  const cutLines = () => (bom()?.lines ?? []).filter((l) => l.component_item_id > 0);

  const loadWo = async (id: number) => {
    setLoading(true);
    const woRes = await apiFetch<WorkOrderDetail>(`/api/v1/manufacturing/work-orders/${id}`);
    if (!woRes.success || !woRes.data) {
      setLoading(false);
      mfgWarn(woRes.message, "Could not load this job. Go back to Jobs and open it again.");
      return;
    }
    setWo(woRes.data);
    const bomRes = await apiFetch<BomDetail>(`/api/v1/manufacturing/boms/${woRes.data.bom_id}`);
    setLoading(false);
    if (!bomRes.success || !bomRes.data) {
      mfgWarn(bomRes.message, "Could not load the recipe for this job.");
      return;
    }
    setBom(bomRes.data);
    if (bomRes.data.bom_type !== "disassembly") {
      mfgWarn(null, "Record parts is only for take-apart jobs. Use Record finished for build jobs.");
    }
    const first = bomRes.data.lines?.[0];
    setCutId(first?.component_item_id ?? null);
  };

  createEffect(() => {
    const raw = searchParams.woId;
    const id = raw ? Number(Array.isArray(raw) ? raw[0] : raw) : NaN;
    if (!Number.isFinite(id) || id <= 0) return;
    setWoId(id);
    void loadWo(id);
  });

  const submitWeigh = async () => {
    const id = woId();
    const cid = cutId();
    if (!id || !cid) return;
    const kg = Number(weight());
    if (!Number.isFinite(kg) || kg <= 0) {
      mfgWarn(null, "Enter how many you got (must be more than 0).");
      return;
    }
    setBusy(true);
    const res = await apiFetch<{ results: { status: string; message?: string; lot_no?: string }[] }>(
      `/api/v1/manufacturing/work-orders/${id}/output-lots/batch`,
      {
        method: "POST",
        body: JSON.stringify({
          scans: [
            {
              client_scan_id: newClientScanId(),
              component_item_id: cid,
              lot_no: lotNo().trim() || undefined,
              qty: kg,
              catch_weight: kg,
              expiry_date: expiry().trim() || undefined,
            },
          ],
        }),
      },
    );
    setBusy(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "Could not record that part. Try again.");
      return;
    }
    const r = res.data.results?.[0];
    if (r && r.status !== "accepted" && r.status !== "idempotent_replay") {
      mfgWarn(r.message, "Could not record that part. Try again.");
      return;
    }
    mfgSuccess("Part recorded. Record the rest, then Finish.");
    setLotNo("");
    setWeight("");
  };

  return (
    <ProductionLayout>
      <div class="space-y-6">
        <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
          <A href={jobsBackHref()} class="text-xs font-medium text-brand-700 hover:underline">
            ← Jobs
          </A>
          <h2 class="mt-2 text-lg font-semibold text-text-primary">Record parts</h2>
          <p class="mt-1 text-sm text-text-secondary">
            Enter how many of each part you got. Finish the job to put them in stock.
          </p>
          <div class="mt-4 max-w-lg">
            <LookupCombo
              label="Job (released)"
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
                setWo(null);
                setBom(null);
              }}
              fetchOptions={fetchReleasedWorkOrders}
            />
          </div>
        </section>

        <Show when={loading()}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>

        <Show when={wo() && bom()?.bom_type === "disassembly"}>
          <section class="rounded-xl border border-stroke bg-white p-5 shadow-sm">
            <p class="text-sm font-medium text-text-primary">
              {wo()!.work_order_no} · {wo()!.finished_item_name} · planned {wo()!.qty_to_produce}
            </p>
            <div class="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Part">
                <select
                  class={inputClass}
                  value={cutId() ?? ""}
                  onChange={(e) => setCutId(Number(e.currentTarget.value) || null)}
                >
                  <For each={cutLines()}>
                    {(l) => (
                      <option value={l.component_item_id}>
                        {l.component_code} — {l.component_name} (recipe {l.qty})
                      </option>
                    )}
                  </For>
                </select>
              </Field>
              <Field label="Lot no. (optional)">
                <input class={inputClass} value={lotNo()} onInput={(e) => setLotNo(e.currentTarget.value)} placeholder="Auto if blank" />
              </Field>
              <Field label="How many you got">
                <input
                  class={inputClass}
                  type="text"
                  inputMode="decimal"
                  value={weight()}
                  onInput={(e) => setWeight(e.currentTarget.value)}
                  placeholder="e.g. 12.5"
                />
              </Field>
              <Field label="Expiry">
                <DateInput value={expiry()} onInput={(e) => setExpiry(e.currentTarget.value)} />
              </Field>
            </div>
            <button
              type="button"
              class="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={busy() || !cutId()}
              onClick={() => void submitWeigh()}
            >
              Record this part
            </button>
          </section>
        </Show>
      </div>
    </ProductionLayout>
  );
}
