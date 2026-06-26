import type { JSX } from "solid-js";
import { Show } from "solid-js";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
  wide?: boolean;
};

export function Modal(props: Props) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6">
        <div class={`my-4 w-full rounded-2xl border border-stroke bg-white p-6 shadow-xl ${props.wide ? "max-w-5xl" : "max-w-lg"}`}>
          <div class="mb-4 flex items-center justify-between">
            <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
            <button type="button" class="text-text-secondary hover:text-text-primary" onClick={props.onClose} aria-label="Close">
              ×
            </button>
          </div>
          {props.children}
        </div>
      </div>
    </Show>
  );
}
