import { createEffect, onMount } from "solid-js";
import { crmNotificationHref, crmSeverityToastType } from "./crmNotificationRoutes";
import { markCrmNotificationRead, useCrmNotifications, useInvalidateCrmNotifications } from "./useCrmNotifications";
import { useToast } from "./toast";

type Props = {
  enabled: boolean;
};

const seenUnreadIds = new Set<number>();
let bootstrapped = false;

/** Polls for new CRM notifications and shows clickable toasts. */
export function CrmNotificationPoller(props: Props) {
  const toast = useToast();
  const invalidate = useInvalidateCrmNotifications();

  const unread = useCrmNotifications(() => ({
    page: 1,
    pageSize: 10,
    unreadOnly: true,
    enabled: props.enabled,
  }));

  onMount(() => {
    if (!props.enabled) return;
    const t = window.setTimeout(() => {
      bootstrapped = true;
    }, 2500);
    return () => window.clearTimeout(t);
  });

  createEffect(() => {
    if (!props.enabled) return;
    const rows = unread.data?.rows ?? [];
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
