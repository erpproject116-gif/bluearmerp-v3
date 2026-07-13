import { createSignal, Show } from "solid-js";
import { HistoryLogModal } from "./HistoryLogModal";

type Props = {
  targetType: string;
  targetId: number | null | undefined;
  title?: string;
  /** "link" for grid cells; "button" for modal headers */
  variant?: "link" | "button";
  class?: string;
};

/**
 * Opens transaction-scoped history in a modal (create, edits, status changes, attachments, …).
 * Per-record access is allowed without global activity-log permission (matches API).
 */
export function RecordHistoryButton(props: Props) {
  const [open, setOpen] = createSignal(false);
  const variant = () => props.variant ?? "link";

  return (
    <Show when={props.targetId}>
      <>
        <Show
          when={variant() === "button"}
          fallback={
            <button
              type="button"
              class={props.class ?? "text-xs text-brand-600 hover:underline"}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(true);
              }}
            >
              History
            </button>
          }
        >
          <button
            type="button"
            class={
              props.class ??
              "rounded-lg border border-stroke px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-slate-50"
            }
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
          >
            History
          </button>
        </Show>
        <HistoryLogModal
          open={open}
          onClose={() => setOpen(false)}
          targetType={props.targetType}
          targetId={props.targetId}
          title={props.title ?? "History"}
        />
      </>
    </Show>
  );
}
