import { A, useNavigate, useSearchParams } from "@solidjs/router";
import { For, Show, createMemo, createSignal } from "solid-js";
import { apiFetch } from "../../shared/api";
import { LookupCombo, type LookupOption } from "../../shared/LookupCombo";
import { Field, inputClass } from "../../shared/SpreadsheetGrid";
import { FormErrorSummary } from "../../shared/FormErrorSummary";
import { collectRequiredFieldErrors } from "../../shared/handleSaveResult";
import type { FormErrors } from "../../shared/formValidation";
import { RichTextEditor } from "../comms/RichTextEditor";
import {
  canPostWithShortage,
  normalizeOutputClassification,
  receivesStockForClassification,
  validateWasteLine,
} from "../production/mfgRules";
import { MfgWizardStickyAlerts } from "../production/MfgWizardStickyAlerts";
import { cuttingStepGuidance } from "../production/mfgWizardStepGuidance";
import { mfgStationHandoff, mfgSuccess, mfgWarn } from "../production/mfgToast";
import { jobsHref } from "../production/mfgProductionMode";
import { submitBusyLabel } from "../../shared/submitCopy";
import { formatMoney } from "../../shared/money";
import NewAssemblyOrderWizard from "./NewAssemblyOrderWizard";
import NewRecipeOrderWizard from "./NewRecipeOrderWizard";
import { searchBomsForOrderType } from "./mfgBomLookup";
import { buildManufacturingCostInput, totalManufacturingConversionCost } from "./manufacturingCostInput";

/** Display/seed qty without float garbage (e.g. 0.30000000000000004). */
function formatCuttingQty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "0";
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(parseFloat(rounded.toFixed(6)));
}

type WorkOrder = {
  id: number;
  work_order_no: string;
  status: string;
  finished_track_serial?: boolean;
  finished_track_lot?: boolean;
};

type MaterialNeedLine = {
  component_item_id: number;
  component_code: string;
  component_name: string;
  stock_to_issue: number;
  stock_unit_code: string;
  qty_on_hand: number;
  shortage: number;
  staged_qty?: number;
  track_lot?: boolean;
  output_classification?: string;
};

type MaterialNeeds = {
  work_order_id: number;
  input_line?: MaterialNeedLine;
  lines: MaterialNeedLine[];
  receive_qty?: number;
};

type WasteReason = { id: number; code: string; name: string; is_abnormal: boolean };
type JournalPreview = {
  accounting_enabled: boolean;
  costs: { material_cost: number; total_cost: number };
};

const searchCuttingBoms = (q: string) => searchBomsForOrderType("disassembly", q);

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
  { id: 1, label: "Raw material" },
  { id: 2, label: "Actual outputs" },
  { id: 3, label: "Post production" },
] as const;

function NewCuttingOrderWizard() {
  const navigate = useNavigate();
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
  const [actualByItem, setActualByItem] = createSignal<Record<number, string>>({});
  const [wasteQtyOverride, setWasteQtyOverride] = createSignal<string | null>(null);
  const [wasteReasonId, setWasteReasonId] = createSignal<number | null>(null);
  const [wasteNotes, setWasteNotes] = createSignal("");
  const [reasons, setReasons] = createSignal<WasteReason[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [posting, setPosting] = createSignal(false);
  const [fieldErrors, setFieldErrors] = createSignal<FormErrors>({});
  const [inputTracked, setInputTracked] = createSignal(false);
  const [journalPreview, setJournalPreview] = createSignal<JournalPreview | null>(null);
  const costInput = () => buildManufacturingCostInput(labor(), overhead(), otherCost());
  const additionalCost = () => totalManufacturingConversionCost(costInput());
  const estimatedTotalCost = () => (journalPreview()?.costs.material_cost ?? 0) + additionalCost();

  const hasInputShortage = () => {
    const input = needs()?.input_line;
    if (!input) return false;
    return (input.shortage ?? 0) > 0.0001;
  };

  /** Extra waste = input − sellable actuals − expected waste-class template qty. */
  const computedExtraWaste = createMemo(() => {
    const n = needs();
    if (!n) return 0;
    const inputQty = n.input_line?.stock_to_issue ?? Number(qty()) || 0;
    let sellable = 0;
    let expectedWaste = 0;
    for (const ln of n.lines ?? []) {
      const cls = normalizeOutputClassification(ln.output_classification);
      if (cls === "waste") {
        expectedWaste += ln.stock_to_issue;
        continue;
      }
      const raw = actualByItem()[ln.component_item_id];
      const q = raw !== undefined && raw !== "" ? Number(raw) : ln.stock_to_issue;
      if (q > 0) sellable += q;
    }
    return Math.max(0, Math.round((inputQty - sellable - expectedWaste) * 1e6) / 1e6);
  });

  const wasteQty = createMemo(() => {
    if (wasteQtyOverride() !== null) {
      const n = Number(wasteQtyOverride());
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return computedExtraWaste();
  });

  const wasteQtyDisplay = createMemo(() => {
    if (wasteQtyOverride() !== null) return wasteQtyOverride()!;
    return formatCuttingQty(computedExtraWaste());
  });

  const buildWasteLinesPreview = () => {
    const lines: {
      component_item_id?: number;
      classification: string;
      qty: number;
      expected_qty: number;
      waste_reason_id?: number;
      notes?: string;
    }[] = [];
    for (const ln of needs()?.lines ?? []) {
      if (normalizeOutputClassification(ln.output_classification) !== "waste") continue;
      const q = Number(actualByItem()[ln.component_item_id] ?? ln.stock_to_issue);
      if (!(q > 0)) continue;
      lines.push({
        component_item_id: ln.component_item_id,
        classification: "waste",
        qty: q,
        expected_qty: ln.stock_to_issue,
        waste_reason_id: wasteReasonId() ?? undefined,
        notes: wasteNotes().trim() || undefined,
      });
    }
    const extra = wasteQty();
    if (extra > 0) {
      lines.push({
        classification: "waste",
        qty: extra,
        expected_qty: 0,
        waste_reason_id: wasteReasonId() ?? undefined,
        notes: wasteNotes().trim() || undefined,
      });
    }
    return lines;
  };

  const stepGuidance = createMemo(() =>
    cuttingStepGuidance(step(), {
      hasInputShortage: hasInputShortage(),
      inputTracked: inputTracked(),
      wasteReasonId: wasteReasonId(),
      wasteQty: wasteQty(),
      wasteLines: buildWasteLinesPreview(),
      reasons: reasons(),
    }),
  );

  const loadNeeds = async (id: number) => {
    const res = await apiFetch<MaterialNeeds>(`/api/v1/manufacturing/work-orders/${id}/material-needs`, undefined, {
      silent: true,
    });
    if (res.success && res.data) {
      setNeeds(res.data);
      const next: Record<number, string> = {};
      for (const ln of res.data.lines ?? []) {
        const staged = ln.staged_qty ?? 0;
        const seed = staged > 0 ? staged : ln.stock_to_issue;
        next[ln.component_item_id] = formatCuttingQty(seed);
      }
      setActualByItem(next);
      setWasteQtyOverride(null);
    } else setNeeds(null);
  };

  const loadReasons = async () => {
    const res = await apiFetch<WasteReason[]>("/api/v1/manufacturing/waste-reasons?active=1", undefined, {
      silent: true,
    });
    if (res.success) setReasons(res.data ?? []);
  };

  const persistDraft = async (): Promise<WorkOrder | null> => {
    const errs = collectRequiredFieldErrors(
      { bom_id: bomId(), qty_to_produce: qty() },
      [
        { key: "bom_id", label: "Cutting template" },
        { key: "qty_to_produce", label: "Input quantity" },
      ],
    );
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return null;
    }
    setFieldErrors({});
    setSaving(true);
    const id = woId();
    const noteVal = notes().trim() || null;
    let res;
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
    setInputTracked(Boolean(res.data.finished_track_serial || res.data.finished_track_lot));
    await loadNeeds(res.data.id);
    return res.data;
  };

  const handleSaveDraft = async () => {
    const row = await persistDraft();
    if (!row) return;
    mfgSuccess(`Draft saved (${row.work_order_no}). Stock was not changed.`);
  };

  const buildOutputWeighs = () => {
    const weighs: { component_item_id: number; lot_no: string; qty: number }[] = [];
    for (const ln of needs()?.lines ?? []) {
      if (!receivesStockForClassification(ln.output_classification)) continue;
      const raw = actualByItem()[ln.component_item_id];
      const q = Number(raw);
      if (!(q > 0)) continue;
      weighs.push({
        component_item_id: ln.component_item_id,
        lot_no: `CUT-${woNo() || "DRAFT"}-${ln.component_item_id}`,
        qty: q,
      });
    }
    return weighs;
  };

  const buildWasteLines = () => {
    const notesHtml = wasteNotes().trim();
    const notes = notesHtml && notesHtml !== "<br>" ? notesHtml : undefined;
    const lines: {
      component_item_id?: number;
      classification: string;
      qty: number;
      expected_qty: number;
      waste_reason_id?: number;
      notes?: string;
    }[] = [];
    for (const ln of needs()?.lines ?? []) {
      if (normalizeOutputClassification(ln.output_classification) !== "waste") continue;
      const q = Number(actualByItem()[ln.component_item_id] ?? ln.stock_to_issue);
      if (!(q > 0)) continue;
      lines.push({
        component_item_id: ln.component_item_id,
        classification: "waste",
        qty: q,
        expected_qty: ln.stock_to_issue,
        waste_reason_id: wasteReasonId() ?? undefined,
        notes,
      });
    }
    const extra = wasteQty();
    if (extra > 0) {
      lines.push({
        classification: "waste",
        qty: extra,
        expected_qty: 0,
        waste_reason_id: wasteReasonId() ?? undefined,
        notes,
      });
    }
    return lines;
  };

  const handleReviewAndPost = async () => {
    const row = await persistDraft();
    if (!row) return;
    const preview = await apiFetch<JournalPreview>(
      `/api/v1/manufacturing/work-orders/${row.id}/journal-preview`,
      undefined,
      { silent: true },
    );
    setJournalPreview(preview.success && preview.data ? preview.data : null);
    setStep(3);
  };

  const handlePost = async () => {
    if (!canPostWithShortage(hasInputShortage(), false)) {
      setFieldErrors({ stock: "Not enough raw material on hand. Restock, then Post Production." });
      return;
    }
    const row = await persistDraft();
    if (!row) return;
    const id = row.id;
    const wasteLines = buildWasteLines();
    for (const w of wasteLines) {
      const isAbnormal = reasons().find((r) => r.id === (w.waste_reason_id ?? wasteReasonId()))?.is_abnormal ?? false;
      const msg = validateWasteLine(w.qty, w.expected_qty, w.waste_reason_id ?? wasteReasonId(), isAbnormal);
      if (msg) {
        setFieldErrors({ waste: msg });
        return;
      }
    }

    const costSave = await apiFetch(
      `/api/v1/manufacturing/work-orders/${id}/cost-input`,
      {
        method: "PUT",
        body: JSON.stringify(costInput()),
      },
      { silent: true },
    );
    if (!costSave.success) {
      mfgWarn(costSave.message, "Could not save cutting costs.");
      return;
    }

    setPosting(true);
    if (row.status === "draft") {
      const rel = await apiFetch(`/api/v1/manufacturing/work-orders/${id}/release`, { method: "POST" }, { silent: true });
      if (!rel.success) {
        setPosting(false);
        mfgWarn(rel.message, "Couldn’t start this cutting job.");
        return;
      }
    }
    if (inputTracked()) {
      setPosting(false);
      const next = `/app/production/issue-station?woId=${id}&mode=disassembly`;
      mfgStationHandoff("disassembly_issue", next);
      navigate(next);
      return;
    }
    const complete = await apiFetch(
      `/api/v1/manufacturing/work-orders/${id}/complete`,
      {
        method: "POST",
        body: JSON.stringify({
          actual_input_qty: Number(qty()),
          output_weighs: buildOutputWeighs(),
          waste_lines: wasteLines,
          ...costInput(),
        }),
      },
      { silent: true },
    );
    setPosting(false);
    if (!complete.success) {
      mfgWarn(complete.message, "Could not post production. Check stock / weigh parts, then try again.");
      navigate(jobsHref("disassembly"));
      return;
    }
    mfgSuccess("Cutting posted. Stock updated for sellable outputs.");
    navigate(jobsHref("disassembly"));
  };

  const summary = () => {
    let finished = 0;
    let byproduct = 0;
    let waste = 0;
    for (const ln of needs()?.lines ?? []) {
      const q = Number(actualByItem()[ln.component_item_id] ?? 0);
      const c = normalizeOutputClassification(ln.output_classification);
      if (c === "waste") waste += q;
      else if (c === "byproduct") byproduct += q;
      else finished += q;
    }
    waste += wasteQty();
    return { finished, byproduct, waste };
  };

  return (
    <div class="mx-auto max-w-5xl space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs text-text-secondary">
            <A href="/app/production" class="hover:underline">
              Manufacturing
            </A>
          </p>
          <h1 class="mt-1 text-xl font-semibold">New Cutting order</h1>
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
          <A href={jobsHref("disassembly")} class="rounded-lg border border-stroke px-3 py-1.5 text-sm hover:bg-slate-50" aria-label="Close">
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
                "border-emerald-400 bg-emerald-50 text-emerald-900": step() === s.id,
                "border-stroke bg-white text-text-secondary": step() !== s.id,
              }}
            >
              <span class="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">{s.id}</span>
              {s.label}
            </div>
          )}
        </For>
      </nav>

      <Show when={step() === 1}>
        <FormErrorSummary errors={fieldErrors} />
      </Show>
      <MfgWizardStickyAlerts step={step} validationErrors={fieldErrors} stepGuidance={stepGuidance} />

      <Show when={step() === 1}>
        <section class="grid gap-4 rounded-xl border border-stroke bg-white p-4 md:grid-cols-2">
          <div class="space-y-3">
            <LookupCombo
              label="Cutting template / raw material"
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
              fetchOptions={searchCuttingBoms}
            />
            <Field label="Input quantity" required>
              <input
                class={inputClass}
                type="number"
                min="0.0001"
                step="any"
                value={qty()}
                onInput={(e) => setQty(e.currentTarget.value)}
                aria-label="Input quantity"
              />
            </Field>
            <LookupCombo
              label="Warehouse"
              required
              description="Where the whole is taken from and cut pieces are received."
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
              placeholder="Search warehouse…"
            />
            <Field label="Notes">
              <textarea class={inputClass} rows={3} value={notes()} onInput={(e) => setNotes(e.currentTarget.value)} />
            </Field>
          </div>
          <div class="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-emerald-950">
            <p class="font-medium">Stock does not move yet</p>
            <p class="mt-1 text-xs">Draft only plans the cut. The whole leaves stock and cuts arrive when Post Production succeeds.</p>
          </div>
        </section>
        <div class="flex justify-end">
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            disabled={saving()}
            onClick={async () => {
              const row = await persistDraft();
              if (!row) return;
              await loadReasons();
              setStep(2);
            }}
          >
            Enter actual results →
          </button>
        </div>
      </Show>

      <Show when={step() === 2}>
        <section class="rounded-xl border border-stroke bg-white p-4">
          <Show when={needs()?.input_line}>
            {(input) => (
              <p class="mb-3 text-sm">
                Raw material: <strong>{input().component_name}</strong> — need {formatCuttingQty(input().stock_to_issue)}{" "}
                {input().stock_unit_code}, on hand {formatCuttingQty(input().qty_on_hand)}
                <Show when={hasInputShortage()}>
                  <span class="ml-2 text-red-700">(short)</span>
                </Show>
              </p>
            )}
          </Show>
          <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-semibold">Outputs (expected vs actual)</h2>
            <Show when={woId()}>
              <A
                href={`/app/production/weigh-parts?woId=${woId()}&mode=disassembly`}
                class="text-xs font-medium text-brand-700 hover:underline"
              >
                Open Weigh parts →
              </A>
            </Show>
          </div>
          <table class="min-w-full text-left text-sm">
            <thead class="bg-slate-50 text-xs text-text-secondary">
              <tr>
                <th class="px-3 py-2">Output</th>
                <th class="px-3 py-2">Class</th>
                <th class="px-3 py-2">Expected</th>
                <th class="px-3 py-2">Actual</th>
                <th class="px-3 py-2">Difference</th>
              </tr>
            </thead>
            <tbody>
              <For each={needs()?.lines ?? []}>
                {(ln) => {
                  const actual = () => Number(actualByItem()[ln.component_item_id] ?? 0);
                  const difference = () => actual() - ln.stock_to_issue;
                  return (
                    <tr class="border-t border-stroke/80">
                      <td class="px-3 py-2">
                        <span class="font-medium">{ln.component_name}</span>
                        <span class="block text-xs text-text-secondary">{ln.component_code}</span>
                      </td>
                      <td class="px-3 py-2 text-xs">{normalizeOutputClassification(ln.output_classification)}</td>
                      <td class="px-3 py-2 tabular-nums">
                        {formatCuttingQty(ln.stock_to_issue)} {ln.stock_unit_code}
                      </td>
                      <td class="px-3 py-2">
                        <input
                          class={`${inputClass} w-28`}
                          type="number"
                          min="0"
                          step="any"
                          value={actualByItem()[ln.component_item_id] ?? ""}
                          onInput={(e) =>
                            setActualByItem({ ...actualByItem(), [ln.component_item_id]: e.currentTarget.value })
                          }
                          aria-label={`Actual qty for ${ln.component_name}`}
                        />
                      </td>
                      <td class="px-3 py-2 tabular-nums">{formatCuttingQty(difference())}</td>
                    </tr>
                  );
                }}
              </For>
            </tbody>
          </table>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Extra waste qty">
              <input
                class={inputClass}
                type="number"
                min="0"
                step="any"
                value={wasteQtyDisplay()}
                onInput={(e) => setWasteQtyOverride(e.currentTarget.value)}
                aria-label="Extra waste quantity"
              />
              <p class="mt-1 text-[11px] text-text-secondary">
                Auto: max(0, input − sellable actuals − expected waste-class). Override if needed
                <Show when={wasteQtyOverride() !== null}>
                  {" · "}
                  <button
                    type="button"
                    class="font-medium text-brand-700 hover:underline"
                    onClick={() => setWasteQtyOverride(null)}
                  >
                    Reset to auto ({formatCuttingQty(computedExtraWaste())})
                  </button>
                </Show>
              </p>
            </Field>
            <Field label="Waste reason (required for extra / excess / abnormal)">
              <select
                class={inputClass}
                value={wasteReasonId() ?? ""}
                onChange={(e) => setWasteReasonId(e.currentTarget.value ? Number(e.currentTarget.value) : null)}
                aria-label="Waste reason"
              >
                <option value="">— Select —</option>
                <For each={reasons()}>
                  {(r) => (
                    <option value={r.id}>
                      {r.code} — {r.name}
                      {r.is_abnormal ? " (abnormal)" : ""}
                    </option>
                  )}
                </For>
              </select>
            </Field>
          </div>
          <div class="mt-4">
            <Field label="Waste notes">
              <RichTextEditor
                value={wasteNotes()}
                onChange={setWasteNotes}
                placeholder="Describe waste / scrap (paste image embeds inline for now)…"
                minHeightClass="min-h-[6rem]"
                onPasteImage={async (file) => {
                  // TODO: persist via dedicated waste-line attachment API when available.
                  // Until then, embed as data URL inside notes HTML (stored on waste_lines.notes).
                  const dataUrl = await new Promise<string | null>((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
                    reader.onerror = () => resolve(null);
                    reader.readAsDataURL(file);
                  });
                  if (!dataUrl) return null;
                  return { src: dataUrl, alt: file.name || "waste photo" };
                }}
              />
            </Field>
          </div>
        </section>
        <div class="flex justify-between">
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => setStep(1)}>
            ← Back
          </button>
          <button type="button" class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => void handleReviewAndPost()}>
            Review &amp; post →
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
            <p class="text-sm font-medium">Total additional: {formatMoney(additionalCost())}</p>
            <p class="text-[11px] text-text-secondary">
              With Inventory GL enabled, these costs increase cut-output inventory value and credit Production cost absorption.
            </p>
          </div>

          <div class="space-y-2 rounded-xl border border-stroke bg-white p-4 text-sm">
            <h2 class="font-semibold">Production summary</h2>
            <p>Input to consume: {formatCuttingQty(Number(qty()) || 0)}</p>
            <p>Finished / primary outputs: {formatCuttingQty(summary().finished)}</p>
            <p>By-products: {formatCuttingQty(summary().byproduct)}</p>
            <p>Waste: {formatCuttingQty(summary().waste)}</p>
            <p class="text-xs text-text-secondary">Waste-classified lines do not increase sellable stock.</p>
            <div class="mt-3 border-t border-stroke pt-3">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-text-secondary">Journal preview</h3>
              <Show when={journalPreview()} fallback={<p class="mt-1 text-xs text-text-secondary">Cost preview unavailable.</p>}>
                <div class="mt-1 flex justify-between gap-3 text-xs">
                  <span>Dr Cut outputs inventory</span>
                  <span>{formatMoney(estimatedTotalCost())}</span>
                </div>
                <div class="flex justify-between gap-3 text-xs">
                  <span>Cr Raw material inventory</span>
                  <span>{formatMoney(journalPreview()?.costs.material_cost ?? 0)}</span>
                </div>
                <Show when={additionalCost() > 0}>
                  <div class="flex justify-between gap-3 text-xs">
                    <span>Cr Production cost absorption</span>
                    <span>{formatMoney(additionalCost())}</span>
                  </div>
                </Show>
                <Show when={!journalPreview()?.accounting_enabled}>
                  <p class="mt-1 text-[11px] text-amber-700">Preview only: Inventory GL is disabled.</p>
                </Show>
              </Show>
            </div>
          </div>
        </section>
        <aside class="rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-950">
          <p class="font-semibold">Where results and costs go</p>
          <p class="mt-1">
            Finished quantities appear in <A href="/app/inventory/find-stock" class="font-medium underline">Find Stock</A>.
            Manufacturing labor, overhead, and other costs appear in journals and inventory value when Inventory GL is on.
            Use <A href="/app/finance/acct-ii/landed-costs" class="font-medium underline">Landed Cost</A> for inbound purchase freight,
            <A href="/app/purchases/expenses" class="font-medium underline"> Expenses</A> for miscellaneous operating costs,
            Sales Order → Shipping for outbound freight, and
            <A href="/app/sales/commission-rules" class="font-medium underline"> Sales Commissions</A> for commission accruals.
          </p>
        </aside>
        <div class="flex justify-between">
          <button type="button" class="rounded-lg border border-stroke px-3 py-2 text-sm" onClick={() => setStep(2)}>
            ← Back
          </button>
          <button
            type="button"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={posting() || saving()}
            onClick={() => void handlePost()}
          >
            {submitBusyLabel("post", posting(), "Post Production")}
          </button>
        </div>
      </Show>
    </div>
  );
}

/** Router: ?type=cutting → Cutting; ?type=recipe → Recipe; default Assembly. */
export default function ProductionOrderNewPage() {
  const [params] = useSearchParams();
  const type = () => String(params.type ?? "assembly").toLowerCase();
  return (
    <Show
      when={type() === "cutting" || type() === "disassembly"}
      fallback={
        <Show when={type() === "recipe" || type() === "processing"} fallback={<NewAssemblyOrderWizard />}>
          <NewRecipeOrderWizard />
        </Show>
      }
    >
      <NewCuttingOrderWizard />
    </Show>
  );
}
