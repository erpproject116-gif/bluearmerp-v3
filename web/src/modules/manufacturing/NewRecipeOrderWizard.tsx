import { A, useNavigate } from "@solidjs/router";
import { For, Show, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { collectRequiredFieldErrors } from "../../shared/handleSaveResult";
import type { FormErrors } from "../../shared/formValidation";
import { useToast } from "../../shared/toast";
import {
  canPostWithShortage,
  componentStockStatus,
  materialNeedsHasShortage,
  stockChipLabel,
} from "../production/mfgRules";
import { mfgSuccess, mfgWarn } from "../production/mfgToast";
import { jobsHref } from "../production/mfgProductionMode";

type BomOption = { id: number; bom_code: string; bom_name: string; finished_item_name?: string };
type WorkOrder = {
  id: number;
  work_order_no: string;
  bom_id?: number;
  location_id?: number;
  qty_to_produce: number;
  status: string;
  finished_track_serial?: boolean;
  finished_track_lot?: boolean;
  components_tracked?: boolean;
  inspection_status?: string;
};

type MaterialNeedLine = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  stock_to_issue: number;
  stock_unit_code: string;
  qty_on_hand: number;
  shortage: number;
};

type MaterialNeeds = {
  work_order_id: number;
  lines: MaterialNeedLine[];
};

const searchBoms = async (q: string): Promise<LookupOption[]> => {
  const qs = new URLSearchParams({ page: "1", pageSize: "20", status: "active", bom_type: "recipe" });
  if (q.trim()) qs.set("q", q.trim());
  const res = await apiFetch<BomOption[]>(`/api/v1/manufacturing/boms?${qs}`, undefined, { silent: true });
  return (res.data ?? []).map((b) => ({
    id: b.id,
    label: [b.bom_code, b.bom_name, b.finished_item_name].filter(Boolean).join(" — "),
  }));
};

const searchLocations = async (q: string): Promise<LookupOption[]> => {
  const qs = new URLSearchParams({ page: "1", pageSize: "20" });
  if (q.trim()) qs.set("q", q.trim());
  const res = await apiFetch<{ id: number; location_name: string }[]>(
    `/api/v1/inventory/locations?${qs}`,
    undefined,
    { silent: true },
  );
  return (res.data ?? []).map((l) => ({ id: l.id, label: l.location_name }));
};

const STEPS = [
  { id: 1, label: "Select product" },
  { id: 2, label: "Review components" },
  { id: 3, label: "Confirm & post" },
] as const;

export default function NewRecipeOrderWizard() {
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = createSignal(1);
  const [woId, setWoId] = createSignal<number | null>(null);
  const [woNo, setWoNo] = createSignal("");
  const [bomId, setBomId] = createSignal<number | null>(null);
  const [bomLabel, setBomLabel] = createSignal("");
  const [locationId, setLocationId] = createSignal<number | null>(null);
  const [locationLabel, setLocationLabel] = createSignal("");
  const [qty, setQty] = createSignal("1");
  const [notes, setNotes] = createSignal("");
  const [labor, setLabor] = createSignal("");
  const [overhead, setOverhead] = createSignal("");
  const [otherCost, setOtherCost] = createSignal("");
  const [needs, setNeeds] = createSignal<MaterialNeeds | null>(null);
  const [saving, setSaving] = createSignal(false);
  const [posting, setPosting] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const [trackHint, setTrackHint] = createSignal<{ components: boolean; finished: boolean }>({
    components: false,
    finished: false,
  });

  const additionalCost = () =>
    (Number(labor()) || 0) + (Number(overhead()) || 0) + (Number(otherCost()) || 0);

  const hasShortage = () => materialNeedsHasShortage(needs()?.lines ?? []);

  const loadNeeds = async (id: number) => {
    const res = await apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${id}/material-needs`, undefined, {
      silent: true,
    });
    if (res.success && res.data) setNeeds(res.data);
    else setNeeds(null);
  };

  const persistDraft = async (): Promise<WorkOrder | null> => {
    const errs = collectRequiredFieldErrors(
      { bom_id: bomId(), qty_to_produce: qty() },
      [
        { key: "bom_id", label: "Recipe / finished product" },
        { key: "qty_to_produce", label: "Quantity to produce" },
      ],
    );
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return null;
    }
    setFieldErrors({});
    setSaving(true);
    const id = woId();
    let res;
    const noteVal = notes().trim() || null;
    if (id) {
      res = await apiFetch<WorkOrder>(
        `/api/v1/manufacturing/work-orders/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            location_id: locationId() ?? undefined,
            qty_to_produce: Number(qty()),
            notes: noteVal,
          }),
        },
        { silent: true },
      );
    } else {
      res = await apiFetch<WorkOrder>(
        "/api/v1/manufacturing/work-orders",
        {
          method: "POST",
          body: JSON.stringify({
            bom_id: bomId(),
            location_id: locationId() ?? undefined,
            qty_to_produce: Number(qty()),
            notes: noteVal,
          }),
        },
        { silent: true },
      );
    }
    setSaving(false);
    if (!res.success || !res.data) {
      mfgWarn(res.message, "Could not save draft.");
      if (res.errors) setFieldErrors(res.errors as FormErrors);
      return null;
    }
    setWoId(res.data.id);
    setWoNo(res.data.work_order_no);
    setTrackHint({
      components: Boolean(res.data.components_tracked),
      finished: Boolean(res.data.finished_track_serial || res.data.finished_track_lot),
    });
    await loadNeeds(res.data.id);
    return res.data;
  };

  const handleSaveDraft = async () => {
    const row = await persistDraft();
    if (!row) return;
    mfgSuccess(`Draft saved (${row.work_order_no}). Stock was not changed.`);
  };

  const handleContinueFrom1 = async () => {
    const row = await persistDraft();
    if (!row) return;
    setStep(2);
  };

  const handleContinueFrom2 = async () => {
    const row = await persistDraft();
    if (!row) return;
    setStep(3);
  };

  const handleProcessAndPost = async () => {
    if (!canPostWithShortage(hasShortage(), false)) {
      setFieldErrors({
        stock: "Not enough parts on hand. Save draft, restock, then Process & Post.",
      });
      return;
    }
    const row = await persistDraft();
    if (!row) return;
    const id = row.id;

    if (trackHint().components || trackHint().finished) {
      setPosting(true);
      if (row.status === "draft") {
        const rel = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/release`, { method: "POST" }, { silent: true });
        if (!rel.success) {
          setPosting(false);
          mfgWarn(rel.message, "Couldn’t start this job.");
          return;
        }
      }
      setPosting(false);
      mfgWarn(
        null,
        trackHint().components
          ? "Job started. Take materials next (serials/lots), then Finish process."
          : "Job started. Record finished serials/lots next, then Finish process.",
      );
      const next = trackHint().components
        ? `/app/production/issue-station?woId=${id}&mode=recipe`
        : `/app/production/receive-station?woId=${id}&mode=recipe`;
      navigate(next);
      return;
    }

    setPosting(true);
    if (row.status === "draft") {
      const rel = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/release`, { method: "POST" }, { silent: true });
      if (!rel.success) {
        setPosting(false);
        mfgWarn(rel.message, "Couldn’t start this job.");
        return;
      }
    }
    const complete = await apiFetch(
      `/api/v1/manufacturing/work-orders/${id}/complete`,
      {
        method: "POST",
        body: JSON.stringify({ qty_produced: Number(qty()), actual_input_qty: Number(qty()) }),
      },
      { silent: true },
    );
    setPosting(false);
    if (!complete.success) {
      mfgWarn(complete.message, "Could not finish. Check stock, then try again from Jobs.");
      navigate(jobsHref("recipe"));
      return;
    }
    mfgSuccess("Processed & posted. Stock updated.");
    toast.success(additionalCost() > 0 ? `Note: extra cost ₱${additionalCost().toLocaleString()} recorded in notes only for now.` : "Done.");
    navigate(jobsHref("recipe"));
  };

  return (
    <div class="mx-auto max-w-5xl space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-text-secondary">
            <A href="/app/production" class="hover:underline">
              Manufacturing
            </A>{" "}
            / New Recipe / Processing order
          </p>
          <h1 class="mt-1 text-xl font-semibold">New Recipe / Processing order</h1>
          <Show when={woNo()}>
            <p class="text-xs text-text-secondary">Draft {woNo()}</p>
          </Show>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={saving() || posting()}
            onClick={() => void handleSaveDraft()}
          >
            Save as draft
          </button>
          <A href={jobsHref("recipe")} class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" aria-label="Close">
            ✕
          </A>
        </div>
      </div>

      <nav class="flex flex-wrap gap-2" aria-label="Wizard steps">
        <For each={[...STEPS]}>
          {(s) => (
            <div
              class="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
              classList={{
                "border-brand-400 bg-brand-50 text-brand-900": step() === s.id,
                "border-stroke bg-white text-text-secondary": step() !== s.id,
              }}
            >
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] text-white">{s.id}</span>
              {s.label}
            </div>
          )}
        </For>
      </nav>

      <FormErrorSummary errors={fieldErrors()} />

      <Show when={step() === 1}>
        <section class="grid gap-4 rounded-xl border border-stroke bg-white p-4 md:grid-cols-2">
          <div class="space-y-3">
            <Field label="Finished product / recipe" required>
              <LookupCombo
                label="Recipe"
                required
                value={bomLabel}
                selectedId={bomId}
                onInput={setBomLabel}
                onSelect={(o) => {
                  setBomId(o.id);
                  setBomLabel(o.label);
                }}
                onClear={() => {
                  setBomId(null);
                  setBomLabel("");
                }}
                fetchOptions={searchBoms}
                placeholder="Search processing recipes…"
              />
            </Field>
            <Field label="Quantity to produce" required>
              <input
                class={inputClass}
                type="number"
                min="0.0001"
                step="any"
                value={qty()}
                onInput={(e) => setQty(e.currentTarget.value)}
                aria-label="Quantity to produce"
              />
            </Field>
            <Field label="Warehouse">
              <LookupCombo
                label="Warehouse"
                value={locationLabel}
                selectedId={locationId}
                onInput={setLocationLabel}
                onSelect={(o) => {
                  setLocationId(o.id);
                  setLocationLabel(o.label);
                }}
                onClear={() => {
                  setLocationId(null);
                  setLocationLabel("");
                }}
                fetchOptions={searchLocations}
                placeholder="Optional — defaults from recipe"
              />
            </Field>
            <Field label="Reference / notes">
              <textarea
                class={inputClass}
                rows={3}
                value={notes()}
                onInput={(e) => setNotes(e.currentTarget.value)}
                aria-label="Notes"
              />
            </Field>
          </div>
          <div class="rounded-lg border border-blue-100 bg-blue-50/60 p-3 text-sm text-blue-950">
            <p class="font-medium">Stock does not move yet</p>
            <p class="mt-1 text-xs">
              Saving a draft only plans the job. Parts leave stock and finished goods arrive only when you Process &amp; Post
              on step 3.
            </p>
          </div>
        </section>
        <div class="flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={saving()}
            onClick={() => void handleContinueFrom1()}
          >
            Review and continue →
          </button>
        </div>
      </Show>

      <Show when={step() === 2}>
        <section class="rounded-xl border border-stroke bg-white p-4">
          <div class="mb-3 flex items-center justify-between">
            <h2 class="text-sm font-semibold">Components required</h2>
            <button
              type="button"
              class="text-xs font-medium text-brand-700 hover:underline"
              onClick={() => woId() && void loadNeeds(woId()!)}
            >
              Refresh availability
            </button>
          </div>
          <Show when={hasShortage()}>
            <p class="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Some components are short. You can still save the draft. Process &amp; Post stays blocked until stock is enough.
            </p>
          </Show>
          <div class="overflow-x-auto">
            <table class="min-w-full text-left text-sm">
              <thead class="bg-slate-50 text-xs text-text-secondary">
                <tr>
                  <th class="px-3 py-2">Component</th>
                  <th class="px-3 py-2">Required</th>
                  <th class="px-3 py-2">Available</th>
                  <th class="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                <For each={needs()?.lines ?? []}>
                  {(ln) => {
                    const chip = () => componentStockStatus(ln.stock_to_issue, ln.qty_on_hand, ln.shortage);
                    return (
                      <tr class="border-t border-stroke/80">
                        <td class="px-3 py-2">
                          <span class="font-medium">{ln.component_name}</span>
                          <span class="block text-xs text-text-secondary">{ln.component_code}</span>
                        </td>
                        <td class="px-3 py-2 tabular-nums">
                          {ln.stock_to_issue} {ln.stock_unit_code}
                        </td>
                        <td class="px-3 py-2 tabular-nums">{ln.qty_on_hand}</td>
                        <td class="px-3 py-2">
                          <span
                            class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            classList={{
                              "bg-emerald-100 text-emerald-800": chip() === "in_stock",
                              "bg-amber-100 text-amber-900": chip() === "low_stock",
                              "bg-red-100 text-red-800": chip() === "insufficient",
                            }}
                          >
                            {stockChipLabel(chip())}
                          </span>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </section>
        <div class="flex justify-between">
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => setStep(1)}>
            ← Back
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            onClick={() => void handleContinueFrom2()}
          >
            Continue to confirm →
          </button>
        </div>
      </Show>

      <Show when={step() === 3}>
        <section class="grid gap-4 md:grid-cols-2">
          <div class="space-y-3 rounded-xl border border-stroke bg-white p-4">
            <h2 class="text-sm font-semibold">Production cost (optional)</h2>
            <Field label="Labor cost">
              <input class={inputClass} type="number" min="0" step="any" value={labor()} onInput={(e) => setLabor(e.currentTarget.value)} />
            </Field>
            <Field label="Overhead">
              <input class={inputClass} type="number" min="0" step="any" value={overhead()} onInput={(e) => setOverhead(e.currentTarget.value)} />
            </Field>
            <Field label="Other cost">
              <input class={inputClass} type="number" min="0" step="any" value={otherCost()} onInput={(e) => setOtherCost(e.currentTarget.value)} />
            </Field>
            <p class="text-sm font-medium">Total additional: ₱{additionalCost().toLocaleString()}</p>
            <p class="text-[11px] text-text-secondary">
              Phase 1 keeps these as reference on the job notes when you post; full cost allocation comes later.
            </p>
          </div>
          <div class="rounded-xl border border-stroke bg-white p-4">
            <h2 class="text-sm font-semibold">Expected output</h2>
            <p class="mt-2 text-lg font-semibold">{bomLabel() || "—"}</p>
            <p class="text-sm text-text-secondary">Qty {qty()}</p>
            <p class="mt-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-950">
              After posting, component items are deducted and finished products are added — only if Process &amp; Post succeeds.
            </p>
            <Show when={trackHint().components || trackHint().finished}>
              <p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                This job needs serial/lot steps on the floor. Process &amp; Post will start the job and open Take materials /
                Record finished first.
              </p>
            </Show>
          </div>
        </section>
        <div class="flex justify-between">
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => setStep(2)}>
            ← Back
          </button>
          <button
            type="button"
            class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            disabled={posting() || saving()}
            onClick={() => void handleProcessAndPost()}
          >
            {posting() ? "Posting…" : "Process & Post"}
          </button>
        </div>
      </Show>
    </div>
  );
}
