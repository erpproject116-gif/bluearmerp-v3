import { For } from "solid-js";

export type ReportDatePresetId =
  | "today"
  | "this_month"
  | "this_year"
  | "prev_month"
  | "prev_year"
  | "custom";

export type ReportDateRange = {
  date_from: string;
  date_to: string;
};

export const REPORT_DATE_PRESETS: { id: ReportDatePresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_month", label: "This month" },
  { id: "this_year", label: "This year" },
  { id: "prev_month", label: "Previous month" },
  { id: "prev_year", label: "Previous year" },
  { id: "custom", label: "Custom" },
];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function resolveReportDatePreset(id: ReportDatePresetId): ReportDateRange | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (id) {
    case "today":
      return { date_from: iso(now), date_to: iso(now) };
    case "this_month":
      return { date_from: iso(new Date(y, m, 1)), date_to: iso(now) };
    case "this_year":
      return { date_from: iso(new Date(y, 0, 1)), date_to: iso(now) };
    case "prev_month": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      return { date_from: iso(from), date_to: iso(to) };
    }
    case "prev_year":
      return { date_from: iso(new Date(y - 1, 0, 1)), date_to: iso(new Date(y - 1, 11, 31)) };
    case "custom":
      return null;
  }
}

export function inferReportDatePreset(from: string, to: string): ReportDatePresetId {
  for (const preset of REPORT_DATE_PRESETS) {
    if (preset.id === "custom") continue;
    const range = resolveReportDatePreset(preset.id);
    if (range && range.date_from === from && range.date_to === to) return preset.id;
  }
  return "custom";
}

export function ReportDatePresets(props: {
  value: ReportDatePresetId;
  onChange: (preset: ReportDatePresetId, range: ReportDateRange | null) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={REPORT_DATE_PRESETS}>
        {(preset) => (
          <button
            type="button"
            class="rounded-lg border px-3 py-1.5 text-sm transition-colors"
            classList={{
              "border-brand-400 bg-brand-50 text-brand-700": props.value === preset.id,
              "border-stroke text-text-secondary hover:bg-slate-50": props.value !== preset.id,
            }}
            onClick={() => props.onChange(preset.id, resolveReportDatePreset(preset.id))}
          >
            {preset.label}
          </button>
        )}
      </For>
    </div>
  );
}
