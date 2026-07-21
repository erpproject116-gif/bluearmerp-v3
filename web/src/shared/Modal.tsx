import type { JSX } from "solid-js";
import { Show } from "solid-js";
import { Portal } from "solid-js/web";

/** Text dismiss control for modal headers (not full-width form inputs). */
export const modalDismissClass = "text-sm text-text-secondary hover:text-text-primary";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: JSX.Element;
  wide?: boolean;
  /** Use above other modals (e.g. History / RFQ import over a transaction window). */
  stacked?: boolean;
  /** Optional leading icon beside the title. */
  icon?: JSX.Element;
};

export function Modal(props: Props) {
  return (
    <Show when={props.open}>
      <Portal>
        <div
          class={`fixed inset-0 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6 ${props.stacked ? "z-[70]" : "z-50"}`}
          role="dialog"
          aria-modal="true"
          aria-label={props.title}
        >
          <div class={`my-4 w-full rounded-2xl border border-stroke bg-white p-6 shadow-xl ${props.wide ? "max-w-5xl" : "max-w-lg"}`}>
            <div class="mb-4 flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <Show when={props.icon}>
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    {props.icon}
                  </span>
                </Show>
                <h2 class="truncate text-lg font-semibold text-text-primary">{props.title}</h2>
              </div>
              <button type="button" class={modalDismissClass} onClick={props.onClose} aria-label="Close">
                ×
              </button>
            </div>
            {props.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
}
