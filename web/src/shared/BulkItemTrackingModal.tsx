import type { JSX } from "solid-js";
import { For, Show, createEffect, createSignal } from "solid-js";
import { TRACKING_POLICY_OPTIONS } from "./itemMasterConstants";
import { Modal } from "./Modal";
import type { BulkLifecycleItemResult } from "./BulkLifecycleConfirmModal";

export type BulkTrackingAction =
  | "enable_serial"
  | "disable_serial"
  | "enable_lot"
  | "disable_lot";

export type BulkTrackingOutcome = {
  results: BulkLifecycleItemResult[];
  updated: number;
  skipped: number;
};

type Props = {
  open: boolean;
  action: BulkTrackingAction;
  count: number;
  submitting?: boolean;
  outcome?: BulkTrackingOutcome | null;
  onClose: () => void;
  onConfirm: (opts: { serial_policy?: string; lot_policy?: string }) => void | Promise<void>;
};

const ACTION_LABEL: Record<BulkTrackingAction, string> = {
  enable_serial: "Enable serial tracking",
  disable_serial: "Disable serial tracking",
  enable_lot: "Enable lot tracking",
  disable_lot: "Disable lot tracking",
};

export function BulkItemTrackingModal(props: Props): JSX.Element {
  const [policy, setPolicy] = createSignal("required");

  createEffect(() => {
    if (props.open && !props.outcome) setPolicy("required");
  });

  const needsPolicy = () => props.action === "enable_serial" || props.action === "enable_lot";

  const title = () =>
    props.outcome ? "Bulk tracking results" : `${ACTION_LABEL[props.action]}`;

  return (
    <Modal open={props.open} title={title()} onClose={() => !props.submitting && props.onClose()} stacked>
      <Show
        when={props.outcome}
        fallback={
          <div class="space-y-4">
            <p class="text-sm text-text-primary">
              Apply{" "}
              <span class="font-medium">{ACTION_LABEL[props.action].toLowerCase()}</span> to{" "}
              <span class="font-medium">
                {props.count} item{props.count === 1 ? "" : "s"}
              </span>
              . Enabling serial clears lot tracking (and vice versa). Blocked rows are skipped.
            </p>
            <Show when={needsPolicy()}>
              <label class="block">
                <span class="mb-1 block text-sm font-medium text-text-primary">
                  {props.action === "enable_serial" ? "Serial" : "Lot"} capture policy
                </span>
                <select
                  class="h-10 w-full rounded-lg border border-stroke bg-white px-3 text-sm"
                  value={policy()}
                  onChange={(e) => setPolicy(e.currentTarget.value)}
                >
                  <For each={[...TRACKING_POLICY_OPTIONS]}>
                    {(o) => <option value={o.value}>{o.label}</option>}
                  </For>
                </select>
              </label>
            </Show>
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
                class="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                disabled={props.submitting}
                onClick={() => {
                  if (props.action === "enable_serial") {
                    void props.onConfirm({ serial_policy: policy() });
                  } else if (props.action === "enable_lot") {
                    void props.onConfirm({ lot_policy: policy() });
                  } else {
                    void props.onConfirm({});
                  }
                }}
              >
                {props.submitting ? "Updating…" : "Apply"}
              </button>
            </div>
          </div>
        }
      >
        {(outcome) => (
          <div class="space-y-4">
            <p class="text-sm text-text-primary">
              Updated {outcome().updated}, skipped {outcome().skipped}.
            </p>
            <Show when={outcome().results.some((r) => !r.ok)}>
              <ul class="max-h-48 space-y-1 overflow-y-auto text-sm text-text-secondary">
                <For each={outcome().results.filter((r) => !r.ok)}>
                  {(r) => (
                    <li>
                      #{r.id}: {r.reason || "Skipped"}
                    </li>
                  )}
                </For>
              </ul>
            </Show>
            <div class="flex justify-end border-t border-stroke pt-3">
              <button
                type="button"
                class="rounded-lg border border-stroke px-4 py-2 text-sm text-text-secondary hover:bg-slate-50"
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
