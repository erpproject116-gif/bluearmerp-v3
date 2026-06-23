import { A, useNavigate } from "@solidjs/router";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { crmNotificationHref } from "./crmNotificationRoutes";
import {
  markAllCrmNotificationsRead,
  markCrmNotificationRead,
  useCrmNotifications,
  useInvalidateCrmNotifications,
  type CrmNotification,
} from "./useCrmNotifications";

type Props = {
  enabled: boolean;
};

const severityDot: Record<CrmNotification["severity"], string> = {
  info: "bg-brand-500",
  warning: "bg-amber-500",
  critical: "bg-red-500",
};

export function CrmNotificationBell(props: Props) {
  const [open, setOpen] = createSignal(false);
  const navigate = useNavigate();
  const invalidate = useInvalidateCrmNotifications();

  const preview = useCrmNotifications(() => ({
    page: 1,
    pageSize: 10,
    enabled: props.enabled,
  }));

  const unread = () => preview.data?.unreadTotal ?? 0;

  onMount(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-crm-bell]")) setOpen(false);
    };
    document.addEventListener("click", close);
    onCleanup(() => document.removeEventListener("click", close));
  });

  const openNotification = async (n: CrmNotification) => {
    if (!n.read_at) {
      await markCrmNotificationRead(n.id);
      invalidate();
    }
    setOpen(false);
    navigate(crmNotificationHref(n));
  };

  const markAllRead = async () => {
    await markAllCrmNotificationsRead();
    invalidate();
  };

  return (
    <Show when={props.enabled}>
      <div class="relative" data-crm-bell>
        <button
          type="button"
          class="relative rounded-lg border border-stroke p-2 text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
          aria-label="CRM notifications"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <Show when={unread() > 0}>
            <span class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {unread() > 99 ? "99+" : unread()}
            </span>
          </Show>
        </button>

        <Show when={open()}>
          <div class="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-stroke bg-white shadow-lg">
            <div class="flex items-center justify-between border-b border-stroke px-4 py-3">
              <h2 class="text-sm font-semibold text-text-primary">
                Notifications
                <Show when={unread() > 0}>
                  <span class="ml-2 text-xs font-normal text-text-secondary">({unread()} unread)</span>
                </Show>
              </h2>
              <div class="flex items-center gap-3">
                <Show when={unread() > 0}>
                  <button
                    type="button"
                    class="text-xs font-medium text-text-secondary hover:text-text-primary"
                    onClick={() => void markAllRead()}
                  >
                    Mark all read
                  </button>
                </Show>
                <A
                  href="/app/crm/notifications"
                  class="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  View all
                </A>
              </div>
            </div>
            <div class="max-h-96 overflow-y-auto">
              <Show when={preview.isFetching && (preview.data?.rows.length ?? 0) === 0}>
                <p class="px-4 py-6 text-center text-sm text-text-secondary">Loading…</p>
              </Show>
              <Show when={!preview.isFetching && (preview.data?.rows.length ?? 0) === 0}>
                <p class="px-4 py-6 text-center text-sm text-text-secondary">No notifications</p>
              </Show>
              <For each={preview.data?.rows ?? []}>
                {(n) => (
                  <button
                    type="button"
                    class="w-full border-b border-stroke/60 px-4 py-3 text-left transition hover:bg-slate-50"
                    classList={{ "bg-brand-50/50": !n.read_at }}
                    onClick={() => void openNotification(n)}
                  >
                    <div class="flex items-start gap-2">
                      <span class={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot[n.severity]}`} />
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-medium text-text-primary">{n.title}</p>
                        <Show when={n.body}>
                          <p class="mt-0.5 line-clamp-2 text-xs text-text-secondary">{n.body}</p>
                        </Show>
                        <p class="mt-1 text-[10px] text-brand-600">Click to open</p>
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  );
}
