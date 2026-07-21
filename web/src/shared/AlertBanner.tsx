import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { StatusIcon, type StatusIconKind } from "./icons/StatusIcon";

const styles: Record<StatusIconKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-sky-200 bg-sky-50 text-sky-950",
};

export function AlertBanner(props: {
  kind: StatusIconKind;
  title?: string;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <div
      class={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles[props.kind]} ${props.class ?? ""}`}
      role="status"
    >
      <StatusIcon kind={props.kind} size="md" class="mt-0.5" />
      <div class="min-w-0 flex-1">
        <Show when={props.title}>
          <p class="font-semibold leading-snug">{props.title}</p>
        </Show>
        <div class="leading-snug">{props.children}</div>
      </div>
    </div>
  );
}
