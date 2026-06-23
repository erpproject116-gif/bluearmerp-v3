import type { ParentComponent } from "solid-js";
import { Show } from "solid-js";

type Props = {
  title: string;
  subtitle?: string;
  meta?: string;
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
      <p class="text-sm font-medium text-text-primary">{props.title}</p>
      <Show when={props.subtitle}>
        <p class="mt-0.5 text-xs text-text-secondary">{props.subtitle}</p>
      </Show>
      <Show when={props.meta}>
        <p class="mt-1 text-xs text-text-secondary/80">{props.meta}</p>
      </Show>
      <Show when={props.children}>
        <div class="mt-2">{props.children}</div>
      </Show>
    </div>
  );
};
