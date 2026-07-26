import { createEffect, onMount } from "solid-js";
import { crmNotificationHref, crmSeverityToastType } from "./crmNotificationRoutes";
import { markCrmNotificationRead, useCrmNotificationFeed, useInvalidateCrmNotifications } from "./useCrmNotifications";
import { useToast } from "./toast";

type Props = {
  enabled: boolean;
};

const seenUnreadIds = new Set<number>();
let bootstrapped = false;

/**
 * Shows clickable toasts for new CRM notifications. It reads the same shell feed
 * as the bell rather than polling its own unread-only query, and filters the
 * unread rows client-side.
 */
export function CrmNotificationPoller(props: Props) {
  const toast = useToast();
  const invalidate = useInvalidateCrmNotifications();

  const feed = useCrmNotificationFeed(() => props.enabled);

  onMount(() => {
    if (!props.enabled) return;
    const t = window.setTimeout(() => {
      bootstrapped = true;
    }, 2500);
    return () => window.clearTimeout(t);
  });

  createEffect(() => {
    if (!props.enabled) return;
    const rows = (feed.data?.rows ?? []).filter((n) => !n.read_at);
    for (const n of rows) {
      if (seenUnreadIds.has(n.id)) continue;
      seenUnreadIds.add(n.id);
      if (!bootstrapped) continue;
      toast.action({
        type: crmSeverityToastType(n.severity),
        title: n.title,
        message: n.body || undefined,
        actionLabel: "Open",
        href: crmNotificationHref(n),
        onAction: () => {
          if (!n.read_at) {
            void markCrmNotificationRead(n.id).then(() => invalidate());
          }
        },
      });
    }
  });

  return null;
}
