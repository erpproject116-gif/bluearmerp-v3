import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { useNavigate } from "@solidjs/router";
import { crmNotificationHref, crmSeverityToastType } from "./crmNotificationRoutes";
import { markCrmNotificationRead, useCrmNotificationFeed, useInvalidateCrmNotifications } from "./useCrmNotifications";
import { useToast } from "./toast";

type Props = {
  enabled: boolean;
  /** Stable user id so seen-state resets across login/logout. */
  userId?: number | null;
};

type SessionState = {
  userId: number | null;
  seenUnreadIds: Set<number>;
  bootstrapped: boolean;
};

let session: SessionState = {
  userId: null,
  seenUnreadIds: new Set(),
  bootstrapped: false,
};

function ensureSession(userId: number | null | undefined): SessionState {
  const id = userId ?? null;
  if (session.userId !== id) {
    session = { userId: id, seenUnreadIds: new Set(), bootstrapped: false };
  }
  return session;
}

/**
 * Shows clickable toasts for new warning/critical CRM notifications.
 * Shares the shell feed with the bell; filters unread rows client-side.
 */
export function CrmNotificationPoller(props: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateCrmNotifications();
  const [tick, setTick] = createSignal(0);

  const feed = useCrmNotificationFeed(() => props.enabled);

  onMount(() => {
    if (!props.enabled) return;
    const state = ensureSession(props.userId);
    const t = window.setTimeout(() => {
      state.bootstrapped = true;
      setTick((n) => n + 1);
    }, 2500);
    onCleanup(() => window.clearTimeout(t));
  });

  createEffect(() => {
    if (!props.enabled) return;
    tick();
    const state = ensureSession(props.userId);
    const rows = (feed.data?.rows ?? []).filter((n) => !n.read_at);
    for (const n of rows) {
      if (state.seenUnreadIds.has(n.id)) continue;
      state.seenUnreadIds.add(n.id);
      if (!state.bootstrapped) continue;
      if (n.severity !== "warning" && n.severity !== "critical") continue;
      const href = crmNotificationHref(n);
      toast.action({
        type: crmSeverityToastType(n.severity),
        title: n.title,
        message: n.body || undefined,
        actionLabel: "Open",
        onAction: () => {
          if (!n.read_at) {
            void markCrmNotificationRead(n.id).then(() => invalidate());
          }
          navigate(href);
        },
      });
    }
  });

  return null;
}
