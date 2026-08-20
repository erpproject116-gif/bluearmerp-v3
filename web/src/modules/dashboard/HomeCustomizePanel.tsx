import { For, Show } from "solid-js";
import { HOME_WIDGET_CATALOG, type HomeWidgetId } from "./homeWidgets";

export function HomeCustomizePanel(props: {
  open: boolean;
  selected: HomeWidgetId[];
  saving: boolean;
  onClose: () => void;
  onToggle: (id: HomeWidgetId) => void;
  onMove: (id: HomeWidgetId, dir: -1 | 1) => void;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <Show when={props.open}>
      <div class="fixed inset-0 z-[70] flex justify-end bg-slate-900/40" onClick={props.onClose}>
        <aside
          class="flex h-full w-full max-w-md flex-col border-l border-stroke bg-white shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="border-b border-stroke px-5 py-4">
            <h2 class="text-base font-semibold text-text-primary">Customize Home</h2>
            <p class="mt-1 text-sm text-text-secondary">
              Keep this screen small. Add only the numbers you check every morning. Charts and lists stay in Reports if
              you leave them off.
            </p>
          </div>
          <div class="flex-1 overflow-y-auto px-5 py-4">
            <ul class="space-y-3">
              <For each={HOME_WIDGET_CATALOG}>
                {(w) => {
                  const on = () => props.selected.includes(w.id);
                  const idx = () => props.selected.indexOf(w.id);
                  return (
                    <li class="rounded-lg border border-stroke p-3">
                      <label class="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          class="mt-1"
                          checked={on()}
                          disabled={w.pinned}
                          onChange={() => props.onToggle(w.id)}
                        />
                        <span class="min-w-0 flex-1">
                          <span class="block text-sm font-medium text-text-primary">
                            {w.label}
                            <Show when={w.pinned}>
                              <span class="ml-2 text-xs font-normal text-text-secondary">Always on</span>
                            </Show>
                          </span>
                          <span class="mt-0.5 block text-xs text-text-secondary">{w.blurb}</span>
                        </span>
                      </label>
                      <Show when={on() && !w.pinned}>
                        <div class="mt-2 flex gap-2 pl-7">
                          <button
                            type="button"
                            class="rounded border border-stroke px-2 py-0.5 text-xs text-text-secondary disabled:opacity-40"
                            disabled={idx() <= 1}
                            onClick={() => props.onMove(w.id, -1)}
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            class="rounded border border-stroke px-2 py-0.5 text-xs text-text-secondary disabled:opacity-40"
                            disabled={idx() < 0 || idx() >= props.selected.length - 1}
                            onClick={() => props.onMove(w.id, 1)}
                          >
                            Down
                          </button>
                        </div>
                      </Show>
                    </li>
                  );
                }}
              </For>
            </ul>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-stroke px-5 py-3">
            <button type="button" class="text-sm text-text-secondary hover:text-brand-700" onClick={props.onReset}>
              Reset to default
            </button>
            <div class="flex gap-2">
              <button type="button" class="rounded-lg border border-stroke px-3 py-1.5 text-sm" onClick={props.onClose}>
                Cancel
              </button>
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                disabled={props.saving}
                onClick={props.onSave}
              >
                {props.saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Show>
  );
}
