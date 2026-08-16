import { A, useNavigate } from "@solidjs/router";
import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  crmNotificationHref,
  crmNotificationRelativeTime,
  crmNotificationSourceLabel,
} from "./crmNotificationRoutes";
import {
  markAllCrmNotificationsRead,
  markCrmNotificationRead,
  useCrmNotificationFeed,
  useInvalidateCrmNotifications,
  type CrmNotification,
} from "./useCrmNotifications";
import { LoadingText } from "./LoadingText";
import { StatusIcon, type StatusIconKind } from "./icons/StatusIcon";
import { useToast } from "./toast";

type Props = {
  enabled: boolean;
};

function severityKind(severity: CrmNotification["severity"]): StatusIconKind {
  if (severity === "critical") return "error";
  if (severity === "warning") return "warning";
  return "info";
}

const severityTone: Record<CrmNotification["severity"], string> = {
  info: "text-brand-600",
  warning: "text-amber-600",
  critical: "text-red-600",
};

function isActionableNotification(n: CrmNotification): boolean {
  const src = n.source ?? "activity";
  if (src !== "activity") return true;
  return n.severity === "warning" || n.severity === "critical";
}

function formatBadge(n: number): string {
  if (n > 99) return "99+";
  return String(n);
}

export function CrmNotificationBell(props: Props) {
  const [open, setOpen] = createSignal(false);
  const [markingAll, setMarkingAll] = createSignal(false);
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateCrmNotifications();

  const preview = useCrmNotificationFeed(() => props.enabled);

  /** Red pill: actionable unread (alerts / chat / support / warnings), not activity noise. */
  const badge = () => preview.data?.badgeCount ?? 0;
  /** Full unread count for inbox copy. */
  const unread = () => preview.data?.unreadTotal ?? 0;

  const visibleRows = createMemo(() =>
    (preview.data?.rows ?? []).filter((n) => !n.read_at && isActionableNotification(n)),
  );

  onMount(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-crm-bell]")) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    });
  });

  const openNotification = async (n: CrmNotification) => {
    if (!n.read_at) {
      const res = await markCrmNotificationRead(n.id);
      if (!res.success) return;
      invalidate();
    }
    setOpen(false);
    navigate(crmNotificationHref(n));
  };

  const markAllRead = async () => {
    setMarkingAll(true);
    const res = await markAllCrmNotificationsRead();
    setMarkingAll(false);
    if (!res.success) {
      toast.warning(res.message ?? "Could not mark all as read.");
      return;
    }
    invalidate();
    toast.success("All notifications marked read.");
  };

  const ariaLabel = () => {
    const n = badge();
    if (n <= 0) return "Notifications";
    return `Notifications, ${n} needing attention`;
  };

  return (
    <Show when={props.enabled}>
      <div class="relative" data-crm-bell>
        <button
          type="button"
          class="relative rounded-lg border border-stroke p-2 text-text-secondary transition hover:bg-slate-50 hover:text-text-primary"
          aria-label={ariaLabel()}
          aria-expanded={open()}
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
          <Show when={badge() > 0}>
            <span class="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {formatBadge(badge())}
            </span>
          </Show>
        </button>

        <Show when={open()}>
          <div class="absolute right-0 z-50 mt-2 w-96 rounded-xl border border-stroke bg-white shadow-lg">
            <div class="flex items-center justify-between gap-2 border-b border-stroke px-4 py-3">
              <div class="min-w-0">
                <h2 class="text-sm font-semibold text-text-primary">Notifications</h2>
                <Show when={badge() > 0}>
                  <p class="text-xs text-text-secondary">
                    {badge()} need{badge() === 1 ? "s" : ""} attention
                    <Show when={unread() > badge()}>
                      <span> · {unread()} unread total</span>
                    </Show>
                  </p>
                </Show>
                <Show when={badge() === 0 && unread() > 0}>
                  <p class="text-xs text-text-secondary">{unread()} activity items unread</p>
                </Show>
                <Show when={badge() === 0 && unread() === 0}>
                  <p class="text-xs text-text-secondary">You're caught up</p>
                </Show>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <Show when={unread() > 0}>
                  <button
                    type="button"
                    class="text-xs font-medium text-text-secondary hover:text-text-primary disabled:opacity-50"
                    disabled={markingAll()}
                    onClick={(e) => {
                      e.stopPropagation();
                      void markAllRead();
                    }}
                  >
                    {markingAll() ? "…" : "Mark all read"}
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
                <LoadingText class="px-4 py-6 text-center text-sm text-text-secondary" as="p" />
              </Show>
              <Show when={!preview.isFetching && visibleRows().length === 0}>
                <div class="px-4 py-6 text-center text-sm text-text-secondary">
                  <p>No items needing attention.</p>
                  <Show when={unread() > 0}>
                    <p class="mt-2">
                      <A
                        href="/app/crm/notifications?unread=1"
                        class="font-medium text-brand-600 hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        Review {unread()} activity unread
                      </A>
                    </p>
                  </Show>
                </div>
              </Show>
              <For each={visibleRows()}>
                {(n) => (
                  <button
                    type="button"
                    class="w-full border-b border-stroke/60 px-4 py-3 text-left transition hover:bg-slate-50 bg-brand-50/50"
                    onClick={() => void openNotification(n)}
                  >
                    <div class="flex items-start gap-2">
                      <span class={`mt-0.5 shrink-0 ${severityTone[n.severity]}`}>
                        <StatusIcon kind={severityKind(n.severity)} size="sm" />
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <p class="text-sm font-medium text-text-primary">{n.title}</p>
                          <span class="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                            {crmNotificationSourceLabel(n.source)}
                          </span>
                        </div>
                        <Show when={n.body}>
                          <p class="mt-0.5 line-clamp-2 text-xs text-text-secondary">{n.body}</p>
                        </Show>
                        <p class="mt-1 text-[10px] text-text-secondary">{crmNotificationRelativeTime(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                )}
              </For>
            </div>
            <Show when={unread() > visibleRows().length && visibleRows().length > 0}>
              <div class="border-t border-stroke px-4 py-2 text-center">
                <A
                  href="/app/crm/notifications?unread=1"
                  class="text-xs font-medium text-brand-600 hover:underline"
                  onClick={() => setOpen(false)}
                >
                  View all unread in inbox
                </A>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </Show>
  );
}
