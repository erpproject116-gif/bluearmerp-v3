import { For } from "solid-js";

export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

export function snapPageSize(n: number): number {
  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n;
  return 20;
}

export function PageSizeSelect(props: { value: number; onChange: (size: number) => void; disabled?: boolean }) {
  return (
    <label class="inline-flex items-center gap-1.5 text-sm text-text-secondary">
      <span>Rows</span>
      <select
        class="h-8 rounded-lg border border-stroke bg-white px-2 text-sm text-text-primary"
        value={snapPageSize(props.value)}
        aria-label="Rows per page"
        disabled={props.disabled}
        onChange={(e) => props.onChange(snapPageSize(Number(e.currentTarget.value)))}
      >
        <For each={PAGE_SIZE_OPTIONS}>{(n) => <option value={n}>{n}</option>}</For>
      </select>
    </label>
  );
}
