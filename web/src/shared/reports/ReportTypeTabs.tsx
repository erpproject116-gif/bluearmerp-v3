import type { JSX } from "solid-js";

export type ReportType = "details" | "summary" | "by_line";

type Props = {
  value: () => ReportType;
  onChange: (value: ReportType) => void;
  labels?: Partial<Record<ReportType, string>>;
};

const DEFAULT_LABELS: Record<ReportType, string> = {
  details: "Details",
  summary: "Summary",
  by_line: "by Line",
};

export function ReportTypeTabs(props: Props) {
  const label = (t: ReportType) => props.labels?.[t] ?? DEFAULT_LABELS[t];
  const tab = (t: ReportType): JSX.Element => (
    <button
      type="button"
      class={`rounded-lg px-3 py-1.5 text-sm ${props.value() === t ? "bg-brand-600 text-white" : "border border-stroke text-text-secondary"}`}
      onClick={() => props.onChange(t)}
    >
      {label(t)}
    </button>
  );
  return (
    <div class="mb-4 flex flex-wrap gap-2">
      {tab("details")}
      {tab("summary")}
      {tab("by_line")}
    </div>
  );
}
