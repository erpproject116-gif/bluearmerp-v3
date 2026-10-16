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
