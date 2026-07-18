import type { JSX } from "solid-js";
import { For, Show, createEffect, createSignal } from "solid-js";
import { Modal } from "./Modal";

export type BulkLifecycleItemResult = {
  id: number;
  ok: boolean;
  reason?: string;
};

export type BulkLifecycleOutcome = {
  results: BulkLifecycleItemResult[];
  deleted?: number;
  restored?: number;
  skipped: number;
};

type Props = {
  open: boolean;
  action: "delete" | "restore";
  /** Singular entity label, e.g. "quotation" or "partner". */
  entityLabel: string;
  count: number;
  submitting?: boolean;
  /** After submit: show outcome summary when set. */
  outcome?: BulkLifecycleOutcome | null;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function BulkLifecycleConfirmModal(props: Props): JSX.Element {
  const [reason, setReason] = createSignal("");

  createEffect(() => {
    if (props.open && !props.outcome) setReason("");
  });

  const title = () =>
    props.outcome
      ? `Bulk ${props.action} results`
      : `${props.action === "delete" ? "Delete" : "Restore"} selected ${props.entityLabel}s`;

  const successCount = () =>
    props.outcome?.deleted ?? props.outcome?.restored ?? props.outcome?.results.filter((r) => r.ok).length ?? 0;

  return (
    <Modal open={props.open} title={title()} onClose={() => !props.submitting && props.onClose()} stacked>
      <Show
        when={props.outcome}
        fallback={
          <div class="space-y-4">
            <p class="text-sm text-text-primary">
              You are about to {props.action}{" "}
              <span class="font-medium">
                {props.count} {props.entityLabel}
                {props.count === 1 ? "" : "s"}
              </span>
              . Each row is processed independently — blocked rows are skipped.
            </p>
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-text-primary">
                Reason <span class="text-red-600">*</span>
              </span>
              <textarea
                class="w-full rounded-lg border border-stroke px-3 py-2 text-sm"
                rows={3}
                maxLength={2000}
                placeholder={
                  props.action === "delete"
                    ? "Why are these records being deleted?"
                    : "Why are these records being restored?"
                }
                value={reason()}
                onInput={(e) => setReason(e.currentTarget.value)}
              />
            </label>
            <div class="flex justify-end gap-2 border-t border-stroke pt-3">
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
                disabled={props.submitting}
                onClick={() => props.onClose()}
              >
                Cancel
              </button>
              <button
                type="button"
                class={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  props.action === "delete" ? "bg-red-600 hover:bg-red-700" : "bg-brand-600 hover:bg-brand-700"
                }`}
                disabled={props.submitting || !reason().trim() || props.count < 1}
                onClick={() => void props.onConfirm(reason().trim())}
              >
                {props.submitting
                  ? props.action === "delete"
                    ? "Deleting…"
                    : "Restoring…"
                  : props.action === "delete"
                    ? "Delete selected"
                    : "Restore selected"}
              </button>
            </div>
          </div>
        }
      >
        {(outcome) => (
          <div class="space-y-4">
            <p class="text-sm text-text-primary">
              Completed: <span class="font-medium">{successCount()}</span> succeeded,{" "}
              <span class="font-medium">{outcome().skipped}</span> skipped.
            </p>
            <Show when={outcome().results.some((r) => !r.ok)}>
              <div class="max-h-48 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                <p class="mb-1 text-sm font-medium text-amber-800">Skipped</p>
                <ul class="list-disc space-y-0.5 pl-5 text-sm text-amber-800">
                  <For each={outcome().results.filter((r) => !r.ok)}>
                    {(r) => (
                      <li>
                        #{r.id}
                        {r.reason ? `: ${r.reason}` : ""}
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            </Show>
            <div class="flex justify-end border-t border-stroke pt-3">
              <button
                type="button"
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                onClick={() => props.onClose()}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
}
