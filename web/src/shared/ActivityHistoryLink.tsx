import { Show } from "solid-js";
import { canViewActivityLogs, useAuth } from "./auth-context";

type Props = {
  module: string;
  targetType: string;
  targetId: number;
  class?: string;
};

export function ActivityHistoryLink(props: Props) {
  const auth = useAuth();
  const href = () =>
    `/app/activity-logs?module=${encodeURIComponent(props.module)}&target_type=${encodeURIComponent(props.targetType)}&target_id=${props.targetId}`;

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
