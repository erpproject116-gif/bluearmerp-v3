import { createSignal, For, Show } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { crmNotificationHref } from "../../shared/crmNotificationRoutes";
import {
  markAllCrmNotificationsRead,
  markCrmNotificationRead,
  useCrmNotifications,
  useInvalidateCrmNotifications,
  type CrmNotification,
} from "../../shared/useCrmNotifications";
import { useToast } from "../../shared/toast";
import { CrmLayout } from "./CrmLayout";

const severityClass: Record<CrmNotification["severity"], string> = {
  info: "border-l-brand-500",
  warning: "border-l-amber-500",
  critical: "border-l-red-500",
};

export default function CrmNotificationsPage() {
  const navigate = useNavigate();
  const [page, setPage] = createSignal(1);
  const [unreadOnly, setUnreadOnly] = createSignal(false);
  const pageSize = 25;
  const toast = useToast();
  const invalidate = useInvalidateCrmNotifications();

  const list = useCrmNotifications(() => ({
    page: page(),
    pageSize,
    unreadOnly: unreadOnly(),
  }));

  const totalPages = () => Math.max(1, Math.ceil((list.data?.total ?? 0) / pageSize));

  const markRead = async (n: CrmNotification) => {
    if (n.read_at) return;
    const res = await markCrmNotificationRead(n.id);
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark as read.");
      return;
    }
    invalidate();
  };

  const markAll = async () => {
    const res = await markAllCrmNotificationsRead();
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark all as read.");
      return;
    }
    invalidate();
  };

  const openNotification = async (n: CrmNotification) => {
    await markRead(n);
    navigate(crmNotificationHref(n));
  };

  return (
    <CrmLayout>
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p class="text-sm text-text-secondary">In-app alerts from warranty, quotations, and stock rules.</p>
        <div class="flex flex-wrap gap-2">
          <label class="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={unreadOnly()}
              onChange={(e) => {
                setUnreadOnly(e.currentTarget.checked);
                setPage(1);
              }}
            />
            Unread only
          </label>
          <button
            type="button"
            class="rounded-lg border border-stroke px-3 py-1.5 text-sm text-text-secondary hover:bg-slate-50"
            onClick={() => void markAll()}
          >
            Mark all read
          </button>
        </div>
      </div>

      <div class="space-y-2">
        <Show when={list.isFetching}>
          <p class="text-sm text-text-secondary">Loading…</p>
        </Show>
        <Show when={!list.isFetching && (list.data?.rows.length ?? 0) === 0}>
          <p class="rounded-xl border border-stroke bg-white p-8 text-center text-sm text-text-secondary">
            No notifications.
          </p>
        </Show>
        <For each={list.data?.rows ?? []}>
          {(n) => (
            <button
              type="button"
              class={`w-full rounded-xl border border-stroke border-l-4 bg-white p-4 text-left shadow-sm transition hover:bg-slate-50 ${severityClass[n.severity]}`}
              classList={{ "opacity-70": Boolean(n.read_at) }}
              onClick={() => void openNotification(n)}
            >
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 class="font-medium text-text-primary">{n.title}</h3>
                  <Show when={n.body}>
                    <p class="mt-1 text-sm text-text-secondary">{n.body}</p>
                  </Show>
                  <p class="mt-2 text-xs text-text-secondary">{new Date(n.created_at).toLocaleString()}</p>
                  <p class="mt-1 text-xs font-medium text-brand-600">Click to open</p>
                </div>
                <Show when={!n.read_at}>
                  <span class="rounded-lg bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600">Unread</span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>

      <div class="mt-4 flex items-center justify-end gap-2 text-sm">
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={page() <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          Prev
        </button>
        <span>
          Page {page()} / {totalPages()}
        </span>
        <button
          type="button"
          class="rounded border border-stroke px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={page() >= totalPages()}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </CrmLayout>
  );
}
