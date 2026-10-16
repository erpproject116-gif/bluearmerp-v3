import { For } from "solid-js";

type Line = {
  id: number;
  label: string;
  qty: string;
};

type Props = {
  lines: Line[];
  unchecked: Set<number>;
  onToggle: (lineId: number) => void;
};

export function toggleSlipLineSet(open: Set<number>, id: number): Set<number> {
  const next = new Set(open);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export function SlipLinesToggle(props: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs text-text-secondary hover:bg-slate-100"
      aria-expanded={props.open}
      aria-label={props.open ? "Hide items" : "Show items"}
      onClick={() => props.onToggle()}
    >
      {props.open ? "▾" : "▸"}
    </button>
  );
}

export function SlipNestedLines(props: Props) {
  return (
    <ul class="space-y-1">
      <For each={props.lines}>
        {(line) => (
          <li class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!props.unchecked.has(line.id)}
              onChange={() => props.onToggle(line.id)}
              aria-label={line.label}
            />
            <span class="min-w-0 flex-1 truncate">{line.label}</span>
            <span class="text-text-secondary">{line.qty}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
