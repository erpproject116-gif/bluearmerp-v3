import type { JSX } from "solid-js";
import { Show } from "solid-js";

export function WideEntityModal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
  readOnly?: boolean;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6">
        <div class="my-4 w-full max-w-6xl rounded-2xl border border-stroke bg-white p-6 shadow-xl">
          <h2 class="text-lg font-semibold text-text-primary">{props.title}</h2>
          <div class="mt-5 w-full min-w-0 space-y-4">{props.children}</div>
          <div class="mt-6 flex justify-end gap-3 border-t border-stroke pt-4">
            <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm font-medium text-text-secondary hover:bg-slate-50" onClick={() => props.onClose()}>
              {props.readOnly ? "Close" : "Cancel"}
            </button>
            <Show when={!props.readOnly && props.onSave}>
              <button type="button" class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50" disabled={props.saving} onClick={() => props.onSave!()}>
                Save changes
              </button>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  );
}
