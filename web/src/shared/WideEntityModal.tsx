import type { JSX } from "solid-js";
import { For, Show } from "solid-js";
import { Portal } from "solid-js/web";

export type ModalTab = { id: string; label: string };

export function WideEntityModal(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  onSave?: () => void;
  saving?: boolean;
  readOnly?: boolean;
  /** Optional leading icon beside the title. */
  icon?: JSX.Element;
  /** Optional tab strip shown under the title. Parent controls tab content. */
  tabs?: ModalTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** Optional controls rendered at the right of the header (e.g. a History button). */
  headerActions?: JSX.Element;
  children: JSX.Element;
}) {
  return (
    <Show when={props.open}>
      <Portal>
        <div class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-6">
          <div class="my-4 w-full max-w-6xl rounded-2xl border border-stroke bg-surface p-6 shadow-xl">
            <div class="flex items-center justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <Show when={props.icon}>
                  <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    {props.icon}
                  </span>
                </Show>
                <h2 class="truncate text-lg font-semibold text-text-primary">{props.title}</h2>
              </div>
              <Show when={props.headerActions}>
                <div class="flex items-center gap-2">{props.headerActions}</div>
              </Show>
            </div>
            <Show when={props.tabs && props.tabs.length > 0}>
              <div class="mt-4 flex gap-1 border-b border-stroke">
                <For each={props.tabs}>
                  {(tab) => (
                    <button
                      type="button"
                      class={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                        props.activeTab === tab.id
                          ? "border-brand-600 text-brand-700"
                          : "border-transparent text-text-secondary hover:text-text-primary"
                      }`}
                      onClick={() => props.onTabChange?.(tab.id)}
                    >
                      {tab.label}
                    </button>
                  )}
                </For>
              </div>
            </Show>
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
      </Portal>
    </Show>
  );
}
