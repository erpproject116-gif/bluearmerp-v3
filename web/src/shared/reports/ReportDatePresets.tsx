import { For } from "solid-js";

export type ReportDatePresetId =
  | "today"
  | "this_week"
  | "this_month"
  | "this_quarter"
  | "this_year"
  | "year_to_date"
  | "yesterday"
  | "prev_week"
  | "prev_month"
  | "prev_quarter"
  | "prev_year"
  | "custom";

export type ReportDateRange = {
  date_from: string;
  date_to: string;
};

export const REPORT_DATE_PRESETS: { id: ReportDatePresetId; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "this_quarter", label: "This Quarter" },
  { id: "this_year", label: "This Year" },
  { id: "year_to_date", label: "Year To Date" },
  { id: "yesterday", label: "Yesterday" },
  { id: "prev_week", label: "Previous Week" },
  { id: "prev_month", label: "Previous Month" },
  { id: "prev_quarter", label: "Previous Quarter" },
  { id: "prev_year", label: "Previous Year" },
  { id: "custom", label: "Custom" },
];

/** Local calendar date as YYYY-MM-DD (avoids UTC day-shift). */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekSunday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
}

export function resolveReportDatePreset(id: ReportDatePresetId, now = new Date()): ReportDateRange | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const quarterStartMonth = Math.floor(m / 3) * 3;

  switch (id) {
    case "today":
      return { date_from: localISODate(today), date_to: localISODate(today) };
    case "this_week": {
      const from = startOfWeekSunday(today);
      return { date_from: localISODate(from), date_to: localISODate(today) };
    }
    case "this_month":
      return { date_from: localISODate(new Date(y, m, 1)), date_to: localISODate(today) };
    case "this_quarter":
      return { date_from: localISODate(new Date(y, quarterStartMonth, 1)), date_to: localISODate(today) };
    case "this_year":
    case "year_to_date":
      return { date_from: localISODate(new Date(y, 0, 1)), date_to: localISODate(today) };
    case "yesterday": {
      const yest = new Date(y, m, now.getDate() - 1);
      return { date_from: localISODate(yest), date_to: localISODate(yest) };
    }
    case "prev_week": {
      const thisStart = startOfWeekSunday(today);
      const from = new Date(thisStart);
      from.setDate(from.getDate() - 7);
      const to = new Date(thisStart);
      to.setDate(to.getDate() - 1);
      return { date_from: localISODate(from), date_to: localISODate(to) };
    }
    case "prev_month": {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 0);
      return { date_from: localISODate(from), date_to: localISODate(to) };
    }
    case "prev_quarter": {
      const from = new Date(y, quarterStartMonth - 3, 1);
      const to = new Date(y, quarterStartMonth, 0);
      return { date_from: localISODate(from), date_to: localISODate(to) };
    }
    case "prev_year":
      return { date_from: localISODate(new Date(y - 1, 0, 1)), date_to: localISODate(new Date(y - 1, 11, 31)) };
    case "custom":
      return null;
  }
}

export function inferReportDatePreset(from: string, to: string, now = new Date()): ReportDatePresetId {
  for (const preset of REPORT_DATE_PRESETS) {
    if (preset.id === "custom" || preset.id === "year_to_date") continue;
    const range = resolveReportDatePreset(preset.id, now);
    if (range && range.date_from === from && range.date_to === to) return preset.id;
  }
  return "custom";
}

export function reportDatePresetLabel(id: ReportDatePresetId): string {
  return REPORT_DATE_PRESETS.find((p) => p.id === id)?.label ?? "Custom";
}

export function parseReportDatePreset(raw: string | undefined | null): ReportDatePresetId | null {
  if (!raw) return null;
  const n = raw.trim().toLowerCase().replace(/-/g, "_");
  return REPORT_DATE_PRESETS.some((p) => p.id === n) ? (n as ReportDatePresetId) : null;
}

/** Append date_from / date_to to a report href (keeps hash). */
export function withReportDateQuery(href: string, from: string, to: string): string {
  if (!href || !from || !to) return href;
  const hashIdx = href.indexOf("#");
  const pathAndQuery = hashIdx >= 0 ? href.slice(0, hashIdx) : href;
  const hash = hashIdx >= 0 ? href.slice(hashIdx) : "";
  const qIdx = pathAndQuery.indexOf("?");
  const path = qIdx >= 0 ? pathAndQuery.slice(0, qIdx) : pathAndQuery;
  const params = new URLSearchParams(qIdx >= 0 ? pathAndQuery.slice(qIdx + 1) : "");
  params.set("date_from", from);
  params.set("date_to", to);
  const qs = params.toString();
  return `${path}?${qs}${hash}`;
}

export function queryParamFirst(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export function reportsDateRangeFromQuery(params: Record<string, string | string[] | undefined>): {
  preset: ReportDatePresetId;
  from: string;
  to: string;
} {
  const fromParam = queryParamFirst(params.from_date) || queryParamFirst(params.date_from);
  const toParam = queryParamFirst(params.to_date) || queryParamFirst(params.date_to);
  const presetParam = parseReportDatePreset(queryParamFirst(params.filter_by));
  if (fromParam && toParam) {
    return { preset: inferReportDatePreset(fromParam, toParam), from: fromParam, to: toParam };
  }
  const preset: ReportDatePresetId = presetParam && presetParam !== "custom" ? presetParam : "this_month";
  const resolved = resolveReportDatePreset(preset) ?? resolveReportDatePreset("this_month")!;
  return { preset, from: resolved.date_from, to: resolved.date_to };
}

export function ReportDatePresets(props: {
  value: ReportDatePresetId;
  onChange: (preset: ReportDatePresetId, range: ReportDateRange | null) => void;
}) {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={REPORT_DATE_PRESETS.filter((p) => p.id !== "year_to_date")}>
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
