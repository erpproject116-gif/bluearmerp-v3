import { createEffect, createSignal, For } from "solid-js";
import { Modal } from "../Modal";
import type { ReportColumnDef } from "./types";

type Props<T extends string> = {
  open: boolean;
  columns: ReportColumnDef[];
  value: Record<T, boolean>;
  onClose: () => void;
  onApply: (next: Record<T, boolean>) => void;
};

export function ReportColumnEditorModal<T extends string>(props: Props<T>) {
  const [draft, setDraft] = createSignal<Record<T, boolean>>({ ...props.value });

  createEffect(() => {
    if (props.open) setDraft(() => ({ ...props.value }));
  });

  const toggle = (key: T) => {
    setDraft((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const visible = Object.values(next).filter(Boolean).length;
      if (visible === 0) return prev;
      return next;
    });
  };

  return (
    <Modal open={props.open} title="Column visibility" onClose={() => props.onClose()}>
      <p class="mb-3 text-sm text-text-secondary">Choose which columns appear in the grid, export, and print.</p>
      <div class="space-y-2">
        <For each={props.columns}>
          {(col) => (
            <label class="flex cursor-pointer items-center gap-2 rounded border border-stroke px-3 py-2 hover:bg-slate-50">
              <input
                type="checkbox"
                checked={draft()[col.key as T]}
                onChange={() => toggle(col.key as T)}
              />
              {col.label}
            </label>
          )}
        </For>
      </div>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg bg-brand-600 px-4 py-2 text-sm text-white"
          onClick={() => props.onApply(draft())}
        >
          Apply
        </button>
        <button type="button" class="rounded-lg border border-stroke px-4 py-2 text-sm" onClick={() => props.onClose()}>
          Close
        </button>
      </div>
    </Modal>
  );
}
