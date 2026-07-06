import { For, Show, createMemo } from "solid-js";
import { Modal } from "./Modal";
import { useActivityLogList } from "./useActivityLogList";

type Props = {
  /** Boolean or Solid accessor — accessor form keeps the query in sync when the modal opens. */
  open: boolean | (() => boolean);
  onClose: () => void;
  /** Backend target_type, e.g. "sa_sales", "so_sales_order". */
  targetType: string;
  targetId: number | null | undefined;
  title?: string;
};

function readOpen(open: boolean | (() => boolean)): boolean {
  return typeof open === "function" ? open() : open;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Full activity + change history for a single transaction, shown in its own modal.
 * Lists every recorded action (create, edits, conversions, attachment uploads,
 * invoice posting, ...) with timestamp and the PIC (actor) who made it.
 */
export function HistoryLogModal(props: Props) {
  const isOpen = createMemo(() => readOpen(props.open));
  const targetId = createMemo(() => props.targetId);

  const list = useActivityLogList(() => ({
    page: 1,
    pageSize: 100,
    sort: "created_at",
    order: "desc" as const,
    targetType: props.targetType,
    targetId: isOpen() && targetId() ? String(targetId()) : undefined,
    enabled: isOpen() && Boolean(targetId()),
  }));

  return (
    <Modal open={isOpen()} title={props.title ?? "History log"} onClose={props.onClose} wide>
      <Show
        when={targetId()}
        fallback={<p class="py-4 text-sm text-text-secondary">Save the transaction first to see its history.</p>}
      >
        <Show when={list.isLoading}>
          <p class="py-4 text-sm text-text-secondary">Loading…</p>
        </Show>
        <Show when={list.isError}>
          <p class="py-4 text-sm text-red-600">
            {list.error instanceof Error ? list.error.message : "Failed to load history."}
          </p>
        </Show>
        <Show when={!list.isLoading && !list.isError && (list.data?.rows.length ?? 0) === 0}>
          <p class="py-4 text-sm text-text-secondary">No activity recorded yet.</p>
        </Show>
        <Show when={(list.data?.rows.length ?? 0) > 0}>
          <div class="max-h-[60vh] overflow-auto">
            <table class="w-full text-sm">
              <thead class="sticky top-0 bg-white text-left text-xs uppercase text-text-secondary">
                <tr class="border-b border-stroke">
                  <th class="py-2 pr-3">When</th>
                  <th class="py-2 pr-3">PIC</th>
                  <th class="py-2">Activity</th>
                </tr>
              </thead>
              <tbody>
                <For each={list.data?.rows ?? []}>
                  {(row) => (
                    <tr class="border-b border-stroke align-top">
                      <td class="whitespace-nowrap py-2 pr-3 text-text-secondary">{formatWhen(row.created_at)}</td>
                      <td class="whitespace-nowrap py-2 pr-3 font-medium text-text-primary">{row.actor_name || "System"}</td>
                      <td class="py-2">
                        <div class="font-medium text-text-primary">{row.summary || row.action_code}</div>
                        <Show when={(row.details?.length ?? 0) > 0}>
                          <ul class="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                            <For each={row.details ?? []}>{(d) => <li>{d}</li>}</For>
                          </ul>
                        </Show>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </Show>
    </Modal>
  );
}
