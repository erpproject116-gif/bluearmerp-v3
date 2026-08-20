import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  REPORT_DATE_PRESETS,
  inferReportDatePreset,
  reportDatePresetLabel,
  resolveReportDatePreset,
  type ReportDatePresetId,
  type ReportDateRange,
} from "./ReportDatePresets";

type Props = {
  from: string;
  to: string;
  preset: ReportDatePresetId;
  onApply: (preset: ReportDatePresetId, range: ReportDateRange) => void;
};

export function ReportDateRangePicker(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [draftPreset, setDraftPreset] = createSignal<ReportDatePresetId>(props.preset);
  const [draftFrom, setDraftFrom] = createSignal(props.from);
  const [draftTo, setDraftTo] = createSignal(props.to);
  let rootEl: HTMLDivElement | undefined;

  const syncDraft = () => {
    setDraftPreset(props.preset);
    setDraftFrom(props.from);
    setDraftTo(props.to);
  };

  const pickPreset = (id: ReportDatePresetId) => {
    setDraftPreset(id);
    if (id === "custom") return;
    const range = resolveReportDatePreset(id);
    if (!range) return;
    props.onApply(id, range);
    setOpen(false);
  };

  const applyCustom = () => {
    const from = draftFrom();
    const to = draftTo();
    if (!from || !to) return;
    const range = from <= to ? { date_from: from, date_to: to } : { date_from: to, date_to: from };
    const preset = inferReportDatePreset(range.date_from, range.date_to);
    props.onApply(preset, range);
    setOpen(false);
  };

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (rootEl && t && !rootEl.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    });
  });

  return (
    <div class="relative" ref={rootEl}>
      <button
        type="button"
        class="inline-flex items-center gap-2 rounded-full border border-stroke bg-white px-3 py-1.5 text-sm font-medium text-text-primary shadow-sm hover:bg-slate-50"
        aria-expanded={open()}
        aria-haspopup="dialog"
        onClick={() => {
          if (!open()) syncDraft();
          setOpen((v) => !v);
        }}
      >
        <span class="text-text-secondary">Date Range :</span>
        <span>{reportDatePresetLabel(props.preset)}</span>
        <svg class="h-3.5 w-3.5 text-text-secondary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
      </button>

      <Show when={open()}>
        <div
          class="absolute left-0 z-50 mt-2 flex w-[min(100vw-2rem,36rem)] overflow-hidden rounded-xl border border-stroke bg-white shadow-2xl"
          role="dialog"
          aria-label="Date range"
        >
          <ul class="w-48 shrink-0 border-r border-stroke py-2">
            <For each={REPORT_DATE_PRESETS}>
              {(p) => (
                <li>
                  <button
                    type="button"
                    class="w-full px-4 py-2 text-left text-sm"
                    classList={{
                      "bg-brand-600 font-medium text-white":
                        draftPreset() === p.id || (p.id === "custom" && draftPreset() === "custom" && props.preset === "custom"),
                      "text-text-primary hover:bg-slate-50": draftPreset() !== p.id,
                    }}
                    onClick={() => pickPreset(p.id)}
                  >
                    {p.label}
                  </button>
                </li>
              )}
            </For>
          </ul>
          <Show when={draftPreset() === "custom"}>
            <div class="flex min-w-0 flex-1 flex-col p-4">
              <div class="grid gap-3 sm:grid-cols-2">
                <label class="block text-sm">
                  <span class="mb-1 block text-text-secondary">From</span>
                  <input
                    type="date"
                    class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                    value={draftFrom()}
                    onInput={(e) => setDraftFrom(e.currentTarget.value)}
                  />
                </label>
                <label class="block text-sm">
                  <span class="mb-1 block text-text-secondary">To</span>
                  <input
                    type="date"
                    class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                    value={draftTo()}
                    onInput={(e) => setDraftTo(e.currentTarget.value)}
                  />
                </label>
              </div>
              <div class="mt-auto flex justify-end gap-2 pt-6">
                <button
                  type="button"
                  class="rounded-lg px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-lg bg-brand-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  onClick={applyCustom}
                >
                  Done
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
