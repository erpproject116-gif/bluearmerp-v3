import { For, Show, createSignal } from "solid-js";
import { canViewChangeLogs, useAuth } from "./auth-context";
import { useChangeLogList } from "./useChangeLogList";

type Props = {
  /** Backend target_type, e.g. "sa_sales", "so_sales_order", "quo_quotation". */
  targetType: string;
  /** Record id. When null/0 (unsaved record) the panel renders nothing. */
  targetId: number | null | undefined;
  /** Optional heading override. */
  title?: string;
  /** Start expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Inline change/history log for a single transaction record. Renders the record's
 * change history in-place (no navigation) using the existing /activity-logs/changes API.
 * Hidden entirely for users without the view-change-logs permission.
 */
export function ChangeLogPanel(props: Props) {
  const auth = useAuth();
  const [open, setOpen] = createSignal(Boolean(props.defaultOpen));

  const enabled = () => canViewChangeLogs(auth.me) && !!props.targetId && props.targetId > 0;

  const list = useChangeLogList(() => ({
    page: 1,
    pageSize: 50,
    sort: "created_at",
    order: "desc" as const,
    targetType: props.targetType,
    targetId: enabled() && open() ? String(props.targetId) : undefined,
  }));

  return (
    <Show when={enabled()}>
      <div class="mt-4 rounded-lg border border-stroke">
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-text-primary"
          aria-expanded={open()}
          onClick={() => setOpen((v) => !v)}
        >
          <span>{props.title ?? "History / change log"}</span>
          <svg
            class="h-4 w-4 transition-transform"
            classList={{ "rotate-180": open() }}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <Show when={open()}>
          <div class="border-t border-stroke px-3 py-2">
            <Show when={!list.isFetching || (list.data?.rows.length ?? 0) > 0} fallback={<p class="py-2 text-sm text-text-secondary">Loading…</p>}>
              <Show
                when={(list.data?.rows.length ?? 0) > 0}
                fallback={<p class="py-2 text-sm text-text-secondary">No changes recorded yet.</p>}
              >
                <ul class="space-y-3">
                  <For each={list.data?.rows ?? []}>
                    {(row) => (
                      <li class="border-b border-stroke pb-3 last:border-0 last:pb-0">
                        <div class="flex items-center justify-between gap-2">
                          <span class="text-sm font-medium text-text-primary">{row.summary || row.action_code}</span>
                          <span class="shrink-0 text-xs text-text-secondary">{formatWhen(row.created_at)}</span>
                        </div>
                        <div class="text-xs text-text-secondary">{row.actor_name || "System"}</div>
                        <Show when={(row.details?.length ?? 0) > 0}>
                          <ul class="mt-1 list-disc space-y-0.5 pl-5 text-xs text-text-secondary">
                            <For each={row.details ?? []}>{(d) => <li>{d}</li>}</For>
                          </ul>
                        </Show>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
