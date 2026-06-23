import type { ParentComponent } from "solid-js";
import { For, Show } from "solid-js";

export type KanbanDetailRow = {
  label: string;
  value: string;
};

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
  badge?: string;
  details?: KanbanDetailRow[];
  severity?: "info" | "warning" | "critical";
  onClick?: () => void;
};

const severityBorder: Record<NonNullable<Props["severity"]>, string> = {
  info: "border-l-brand-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

export const KanbanCard: ParentComponent<Props> = (props) => {
  const border = () => (props.severity ? severityBorder[props.severity] : "border-l-slate-300");

  return (
    <div
      class="cursor-grab rounded-lg border border-stroke border-l-4 bg-white p-3 shadow-sm active:cursor-grabbing"
      classList={{ [border()]: true, "hover:shadow-md": Boolean(props.onClick) }}
      onClick={() => props.onClick?.()}
      role={props.onClick ? "button" : undefined}
      tabindex={props.onClick ? 0 : undefined}
    >
      <div class="flex items-start justify-between gap-2">
        <p class="min-w-0 flex-1 text-sm font-medium leading-snug text-text-primary">{props.title}</p>
        <Show when={props.badge}>
          <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            {props.badge}
          </span>
        </Show>
      </div>
      <Show when={props.subtitle}>
        <p class="mt-1 text-xs font-medium text-text-secondary">{props.subtitle}</p>
      </Show>
      <Show when={props.details?.length}>
        <dl class="mt-2 space-y-1 border-t border-stroke pt-2">
          <For each={props.details}>
            {(row) => (
              <div class="grid grid-cols-[minmax(0,5.5rem)_1fr] gap-x-2 gap-y-0.5 text-xs">
                <dt class="text-text-secondary">{row.label}</dt>
                <dd class="min-w-0 break-words text-text-primary">{row.value}</dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
      <Show when={props.meta}>
        <p class="mt-2 text-[11px] text-text-secondary/80">{props.meta}</p>
      </Show>
      <Show when={props.children}>
        <div class="mt-2">{props.children}</div>
      </Show>
    </div>
  );
};
