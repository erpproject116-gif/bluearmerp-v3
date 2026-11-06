import { Show } from "solid-js";
import { hrDemoFillEnabled } from "./hrDemoFill";

/** Gated control — only when ?demo=1, localStorage.hrDemoFill=1, or Vite DEV.
 *  Pass always to show on public surfaces (e.g. /apply/:code) without the gate. */
export function DemoFillButton(props: {
  onFill: () => void;
  label?: string;
  class?: string;
  always?: boolean;
}) {
  return (
    <Show when={props.always || hrDemoFillEnabled()}>
      <button
        type="button"
        class={
          props.class ??
          "hr-btn hr-btn-sm border border-dashed border-amber-500 bg-amber-50 text-amber-900 hover:bg-amber-100"
        }
        title="Demo only: fill this form with random valid sample data. You still Save or Submit."
        onClick={() => props.onFill()}
      >
        {props.label ?? "Fill demo"}
      </button>
    </Show>
  );
}
