import { Show } from "solid-js";
import { canViewActivityLogs, useAuth } from "./auth-context";

import { activityLogHref } from "./entityRoutes";

type Props = {
  module: string;
  targetType: string;
  targetId: number;
  class?: string;
};

export function ActivityHistoryLink(props: Props) {
  const auth = useAuth();
  const href = () =>
    activityLogHref({
      module: props.module,
      targetType: props.targetType,
      targetId: props.targetId,
    });

  return (
    <Show when={canViewActivityLogs(auth.me)}>
      <a
        href={href()}
        target="_blank"
        rel="noopener noreferrer"
        class={props.class ?? "text-xs text-brand-600 hover:underline"}
        onClick={(e) => e.stopPropagation()}
      >
        History
      </a>
    </Show>
  );
}
